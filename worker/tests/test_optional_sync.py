from unittest.mock import MagicMock, patch

import httpx
import pytest

from worker.config import WorkerConfig, load_config
from worker.optional_sync import download_artifact, sync_optional_sources
from worker.price_artifacts import PriceLimits


def test_optional_configuration_is_explicit_and_positive(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://localhost/test")
    monkeypatch.setenv("CARDMARKET_PRICES_ENABLED", "true")
    monkeypatch.setenv("MTGJSON_PRICES_ENABLED", "false")
    monkeypatch.setenv("PRICE_RECORD_BYTES", "123")
    config = load_config()
    assert config.cardmarket_prices_enabled is True
    assert config.mtgjson_prices_enabled is False
    assert config.price_limits.record_bytes == 123
    monkeypatch.setenv("PRICE_RECORD_BYTES", "0")
    with pytest.raises(ValueError, match="PRICE_RECORD_BYTES"):
        load_config()
    monkeypatch.setenv("PRICE_RECORD_BYTES", "123")
    monkeypatch.setenv("CARDMARKET_PRICES_ENABLED", "yes")
    with pytest.raises(ValueError, match="CARDMARKET_PRICES_ENABLED"):
        load_config()


def test_download_checks_complete_bytes_and_transport_metadata(tmp_path):
    def serve(request):
        return httpx.Response(
            200,
            stream=httpx.ByteStream(b'{"data":{}}'),
            headers={"etag": "fixture", "last-modified": "Wed, 07 Oct 2026 00:00:00 GMT"},
        )

    with httpx.Client(transport=httpx.MockTransport(serve)) as client:
        result = download_artifact(
            client, "https://fixture.invalid/feed", tmp_path / "feed.json", PriceLimits()
        )
    assert result["compressedBytes"] == 11
    assert len(result["payloadDigest"]) == 64
    assert result["etag"] == "fixture"
    assert "sourceTime" not in result
    with (
        httpx.Client(transport=httpx.MockTransport(serve)) as client,
        pytest.raises(ValueError, match="byte limit"),
    ):
        download_artifact(
            client,
            "https://fixture.invalid/feed",
            tmp_path / "small.json",
            PriceLimits(compressed_bytes=2),
        )


def test_provider_failure_does_not_prevent_other_provider_attempt(tmp_path):
    config = WorkerConfig(
        "postgresql://localhost/test", "all_cards", "manual", "fixture://api", tmp_path, True, True
    )
    publisher = MagicMock()
    with (
        patch("worker.optional_sync.sync_cardmarket", side_effect=ValueError("private")),
        patch("worker.optional_sync.sync_mtgjson") as mtgjson,
    ):
        assert sync_optional_sources(config, publisher) is False
    mtgjson.assert_called_once()
    assert publisher.set_enabled.call_count == 2


def test_disabled_sources_never_download(tmp_path):
    config = WorkerConfig(
        "postgresql://localhost/test", "all_cards", "manual", "fixture://api", tmp_path
    )
    publisher = MagicMock()
    with (
        patch("worker.optional_sync.sync_cardmarket") as cm,
        patch("worker.optional_sync.sync_mtgjson") as mtg,
    ):
        assert sync_optional_sources(config, publisher) is True
    cm.assert_not_called()
    mtg.assert_not_called()


def test_truncated_transfer_cannot_become_source_evidence(tmp_path):
    def serve(_request):
        return httpx.Response(
            200, stream=httpx.ByteStream(b"{}"), headers={"content-length": "50"}
        )

    with (
        httpx.Client(transport=httpx.MockTransport(serve)) as client,
        pytest.raises(ValueError, match="Incomplete"),
    ):
        download_artifact(
            client, "https://fixture.invalid/feed", tmp_path / "feed.json", PriceLimits()
        )
