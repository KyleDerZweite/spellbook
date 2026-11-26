from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import MagicMock, patch
from uuid import uuid4

import httpx
import psycopg
import pytest
from psycopg import sql
from psycopg.conninfo import make_conninfo

from worker.catalog import CatalogPublisher
from worker.config import WorkerConfig, load_config
from worker.reference_decks.base import (
    MTG_FORMATS,
    RawDeckCard,
    RawReferenceDeck,
    parse_decklist_text,
)
from worker.reference_decks.cache import CachedHttpFetcher, HttpDiskCache, RateLimiter
from worker.reference_decks.local_dec import LocalDecDeckSource
from worker.reference_decks.mtggoldfish import MTGGoldfishDeckSource
from worker.reference_decks.publisher import ReferenceDeckPublisher
from worker.reference_decks.sync import sync_reference_decks
from worker.scryfall import BulkDataInfo


def test_reference_deck_config_validation(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://localhost/test")
    monkeypatch.setenv("REFERENCE_DECKS_ENABLED", "true")
    monkeypatch.setenv("REFERENCE_DECK_SOURCES", "mtggoldfish, local_dec, mtggoldfish")
    monkeypatch.setenv("REFERENCE_DECKS_CACHE_TTL_SECONDS", "3600")
    monkeypatch.setenv("REFERENCE_DECKS_RATE_LIMIT_MS", "250")
    monkeypatch.setenv("REFERENCE_DECKS_MAX_PER_FORMAT", "10")
    config = load_config()
    assert config.reference_decks_enabled is True
    assert config.reference_deck_sources == ("mtggoldfish", "local_dec")
    assert config.reference_decks_cache_ttl_seconds == 3600
    assert config.reference_decks_rate_limit_ms == 250
    assert config.reference_decks_max_per_format == 10

    monkeypatch.setenv("REFERENCE_DECK_SOURCES", "unknown_source")
    with pytest.raises(ValueError, match="REFERENCE_DECK_SOURCES"):
        load_config()

    monkeypatch.setenv("REFERENCE_DECK_SOURCES", "mtggoldfish")
    monkeypatch.setenv("REFERENCE_DECKS_MAX_PER_FORMAT", "0")
    with pytest.raises(ValueError, match="REFERENCE_DECKS_MAX_PER_FORMAT"):
        load_config()


def test_parse_decklist_text_handles_dec_and_mtgo_syntax():
    raw = """
    // Name: Boros Burn
    // Format: modern
    // MetaShare: 6.5%
    Commander:
    1 Ragavan, Nimble Pilferer (MH2) 138
    Deck
    4 Lightning Bolt (2X2) 117
    2x Monastery Swiftspear [KTK]
    2 Monastery Swiftspear
    SB: 2 Rest in Peace
    Sideboard:
    1 Rest in Peace
    """
    metadata, cards = parse_decklist_text(raw)
    assert metadata == {"name": "Boros Burn", "format": "modern", "metashare": "6.5%"}
    assert set(cards) == {
        RawDeckCard("Ragavan, Nimble Pilferer", 1, "commander"),
        RawDeckCard("Lightning Bolt", 4, "main"),
        RawDeckCard("Monastery Swiftspear", 4, "main"),
        RawDeckCard("Rest in Peace", 3, "sideboard"),
    }


def test_parse_decklist_text_blank_line_starts_sideboard():
    raw = "4 Lightning Bolt\n4 Mountain\n\n2 Smash to Smithereens\n"
    _, cards = parse_decklist_text(raw, blank_line_starts_sideboard=True)
    assert set(cards) == {
        RawDeckCard("Lightning Bolt", 4, "main"),
        RawDeckCard("Mountain", 4, "main"),
        RawDeckCard("Smash to Smithereens", 2, "sideboard"),
    }


def test_local_dec_source_reads_subdirectories_and_skips_unsupported_formats(tmp_path):
    (tmp_path / "modern").mkdir()
    (tmp_path / "modern" / "boros-burn.dec").write_text(
        "// Archetype: Burn\n4 Lightning Bolt\nSB: 2 Rest in Peace\n",
        encoding="utf-8",
    )
    (tmp_path / "standard-inline.dec").write_text(
        "// Format: standard\n// Name: Mono Red\n4 Monastery Swiftspear\n",
        encoding="utf-8",
    )
    (tmp_path / "unsupported").mkdir()
    (tmp_path / "unsupported" / "ignored.dec").write_text("4 Island\n", encoding="utf-8")

    source = LocalDecDeckSource(tmp_path)
    assert source.supported_formats() == frozenset(MTG_FORMATS)
    decks = source.fetch_decks((*MTG_FORMATS, "alchemy"))
    assert len(decks) == 2
    by_id = {deck.external_id: deck for deck in decks}
    assert set(by_id) == {"modern/boros-burn.dec", "standard-inline.dec"}
    assert by_id["modern/boros-burn.dec"].name == "Boros Burn"
    assert by_id["modern/boros-burn.dec"].format == "modern"
    assert by_id["modern/boros-burn.dec"].archetype == "Burn"
    assert by_id["standard-inline.dec"].name == "Mono Red"
    assert by_id["standard-inline.dec"].format == "standard"

    with pytest.raises(FileNotFoundError):
        LocalDecDeckSource(tmp_path / "does-not-exist").fetch_decks(MTG_FORMATS)


def test_mtggoldfish_source_caches_rate_limits_and_skips_unsupported_formats(tmp_path):
    requests: list[str] = []
    metagame_html = """
    <div class='archetype-tile' id='28136'>
      <div class='archetype-tile-image'>
        <img src='https://cards.mtggoldfish.com/example.webp' alt='Guide of Souls'>
        <a class='card-image-tile-link-overlay' href='/archetype/modern-boros-energy'>
          <span class='sr-only'>Guide of Souls</span>
        </a>
      </div>
      <div class='archetype-tile-description'>
        <div class='archetype-tile-title'>
          <img src='https://cards.mtggoldfish.com/icon.webp' alt='icon' />
          <span class='deck-price-online'>
            <a href="/archetype/modern-boros-energy#online">Boros Energy</a>
          </span>
          <span class='deck-price-paper'>
            <a href="/archetype/modern-boros-energy#paper">Boros Energy</a>
          </span>
        </div>
      </div>
      <div class='archetype-tile-statistic metagame-percentage'>
        <div class='archetype-tile-statistic-value'>14.2%<br></div>
      </div>
    </div>
    <div class='archetype-tile' id='28137'>
      <img src='https://cards.mtggoldfish.com/storm.webp' alt='Ruby Medallion'>
      <div class='archetype-tile-title'>
        <a href="/archetype/modern-ruby-storm#paper">Ruby Storm</a>
      </div>
      <div class='archetype-tile-statistic-value'>100.00%</div>
    </div>
    """
    archetype_html = (
        '<input type="hidden" name="deck_input[deck]" id="deck_input_deck" '
        'value="4 Guide of Souls\n4 Ocelot Pride\nsideboard\n2 Blood Moon\n" />'
    )

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request.url.path)
        if request.url.path == "/metagame/modern/full":
            return httpx.Response(200, text=metagame_html)
        if request.url.path == "/archetype/modern-boros-energy":
            return httpx.Response(200, text=archetype_html)
        return httpx.Response(404)

    now = [100.0]
    sleeps: list[float] = []

    def fake_clock() -> float:
        return now[0]

    def fake_sleep(seconds: float) -> None:
        sleeps.append(seconds)
        now[0] += seconds

    cache = HttpDiskCache(tmp_path / "cache", ttl_seconds=3600, clock=lambda: 1000.0)
    limiter = RateLimiter(1.5, clock=fake_clock, sleeper=fake_sleep)

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        fetcher = CachedHttpFetcher(client, cache, limiter)
        source = MTGGoldfishDeckSource(
            fetcher, base_url="https://mtggoldfish.invalid", max_decks_per_format=1
        )
        from worker.reference_decks.mtggoldfish import parse_metagame_html

        parsed_tiles = parse_metagame_html(metagame_html, "https://mtggoldfish.invalid")
        assert [(e.slug, e.name, e.meta_share) for e in parsed_tiles] == [
            ("modern-boros-energy", "Boros Energy", 14.2),
            ("modern-ruby-storm", "Ruby Storm", 100.0),
        ]
        edge_html = """
        <div class='archetype-tile'>
          <div class='archetype-tile-title'><a href="/archetype/a#paper">Out of Range</a></div>
          <div class='archetype-tile-statistic-value'>1000.00%</div>
        </div>
        <div class='archetype-tile'>
          <div class='archetype-tile-title'><a href="/archetype/b#paper">Tiny Share</a></div>
          <div class='archetype-tile-statistic-value'>0.001%</div>
        </div>
        """
        assert [
            (e.slug, e.meta_share)
            for e in parse_metagame_html(edge_html, "https://mtggoldfish.invalid")
        ] == [("a", None), ("b", 0.001)]
        decks = source.fetch_decks(["modern", "unsupported_format"])
        assert len(decks) == 1
        assert decks[0].name == "Boros Energy"
        assert decks[0].archetype == "Boros Energy"
        assert decks[0].format == "modern"
        assert decks[0].meta_share == 14.2
        assert decks[0].external_id == "modern:modern-boros-energy"
        assert decks[0].source_url == "https://mtggoldfish.invalid/archetype/modern-boros-energy"
        assert set(decks[0].cards) == {
            RawDeckCard("Guide of Souls", 4, "main"),
            RawDeckCard("Ocelot Pride", 4, "main"),
            RawDeckCard("Blood Moon", 2, "sideboard"),
        }
        assert requests == [
            "/metagame/modern/full",
            "/archetype/modern-boros-energy",
        ]
        # 2 uncached requests => 1 rate-limit sleep of 1.5s.
        assert sleeps == [1.5]

        # Second fetch hits disk cache: zero additional HTTP requests or sleeps.
        cached_decks = source.fetch_decks(["modern"])
        assert len(cached_decks) == 1
        assert len(requests) == 2
        assert len(sleeps) == 1


def test_mtggoldfish_source_rejects_missing_embedded_decklist(tmp_path):
    metagame_html = """
    <div class='archetype-tile'>
      <div class='archetype-tile-title'>
        <a href="/archetype/modern-boros-energy#paper">Boros Energy</a>
      </div>
    </div>
    """

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/metagame/modern/full":
            return httpx.Response(200, text=metagame_html)
        return httpx.Response(200, text="<html><body>No deck input</body></html>")

    cache = HttpDiskCache(tmp_path / "cache", ttl_seconds=0)
    limiter = RateLimiter(0.0)
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        source = MTGGoldfishDeckSource(
            CachedHttpFetcher(client, cache, limiter),
            base_url="https://mtggoldfish.invalid",
            max_decks_per_format=1,
        )
        with pytest.raises(ValueError, match="Missing embedded decklist"):
            source.fetch_decks(["modern"])


def test_publisher_normalizes_cards_to_oracle_id_and_skips_incomplete_decks():
    publisher = ReferenceDeckPublisher("postgresql://localhost/unused")
    oracle_bolt = "11111111-1111-4111-8111-111111111111"
    oracle_fire = "22222222-2222-4222-8222-222222222222"

    conn = MagicMock()
    conn.execute.return_value.fetchall.return_value = [
        ("lightning bolt", oracle_bolt, "Lightning Bolt"),
        ("fire", oracle_fire, "Fire // Ice"),
    ]
    raw = [
        RawReferenceDeck(
            source="local_dec",
            external_id="modern/burn.dec",
            name="Burn",
            format="modern",
            cards=(
                RawDeckCard("Lightning Bolt", 2, "main"),
                RawDeckCard("lightning bolt", 2, "main"),
                RawDeckCard("Fire", 2, "main"),
            ),
            source_updated_at=datetime(2026, 11, 26, tzinfo=UTC),
        ),
        RawReferenceDeck(
            source="local_dec",
            external_id="modern/incomplete.dec",
            name="Incomplete",
            format="modern",
            cards=(
                RawDeckCard("Lightning Bolt", 4, "main"),
                RawDeckCard("Nonexistent Card", 4, "main"),
            ),
            source_updated_at=datetime(2026, 11, 26, tzinfo=UTC),
        ),
    ]

    normalized = publisher._normalize_decks(conn, raw)
    assert len(normalized) == 1
    assert normalized[0].external_id == "modern/burn.dec"
    assert [(c.oracle_id, c.card_name, c.quantity, c.role) for c in normalized[0].cards] == [
        (oracle_bolt, "Lightning Bolt", 4, "main"),
        (oracle_fire, "Fire // Ice", 2, "main"),
    ]


def test_sync_reference_decks_disabled_and_failure_isolation(tmp_path):
    disabled_config = WorkerConfig(
        "postgresql://localhost/test", "all_cards", "manual", "fixture://api", tmp_path
    )
    publisher = MagicMock()
    assert sync_reference_decks(disabled_config, publisher) is True
    publisher.publish_source.assert_not_called()

    enabled_config = WorkerConfig(
        "postgresql://localhost/test",
        "all_cards",
        "manual",
        "fixture://api",
        tmp_path,
        reference_decks_enabled=True,
        reference_deck_sources=("mtggoldfish", "local_dec"),
    )
    failing_source = MagicMock()
    failing_source.fetch_decks.side_effect = RuntimeError("upstream down")
    ok_source = MagicMock()
    ok_source.fetch_decks.return_value = []
    publisher.publish_source.return_value = 0

    def fake_build(name, _config, _stack):
        return failing_source if name == "mtggoldfish" else ok_source

    with patch("worker.reference_decks.sync.build_deck_source", side_effect=fake_build):
        assert sync_reference_decks(enabled_config, publisher) is False

    publisher.record_failure.assert_called_once()
    assert publisher.record_failure.call_args.args[0] == "mtggoldfish"
    publisher.publish_source.assert_called_once_with("local_dec", [])


def test_reference_deck_publisher_postgres_roundtrip_and_pruning(tmp_path):
    url = os.environ.get("WORKER_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set WORKER_TEST_DATABASE_URL to run PostgreSQL reference deck tests")

    schema = "worker_refdeck_test_" + uuid4().hex
    drizzle = Path(__file__).parents[3] / "drizzle"
    fixtures = Path(__file__).parent / "fixtures"

    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public")
        admin.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
        scoped = make_conninfo(url, options=f"-csearch_path={schema},public")
        try:
            with psycopg.connect(scoped) as conn:
                for migration_name in (
                    "0006_postgres_catalog.sql",
                    "0015_scryfall_prices.sql",
                    "0031_reference_decks.sql",
                ):
                    conn.execute(
                        (drizzle / migration_name).read_text().replace('"public".', f'"{schema}".')
                    )

            card = json.loads((fixtures / "normal_card.json").read_text())
            bulk_path = tmp_path / "cards.jsonl"
            bulk_path.write_text(json.dumps(card), encoding="utf-8")
            CatalogPublisher(scoped).publish(
                bulk_path,
                BulkDataInfo(
                    "all_cards",
                    "fixture://catalog",
                    "2026-11-26T00:00:00Z",
                    bulk_path.stat().st_size,
                ),
            )

            dec_root = tmp_path / "decks"
            (dec_root / "modern").mkdir(parents=True)
            (dec_root / "modern" / "sample.dec").write_text(
                f"// Name: Sample Deck\n4 {card['name']}\nSB: 2 {card['name']}\n",
                encoding="utf-8",
            )
            source = LocalDecDeckSource(dec_root)
            publisher = ReferenceDeckPublisher(scoped)
            published = publisher.publish_source("local_dec", source.fetch_decks(MTG_FORMATS))
            assert published == 1

            with psycopg.connect(scoped) as conn:
                deck_row = conn.execute(
                    "SELECT id, name, format FROM reference_decks WHERE source = 'local_dec'"
                ).fetchone()
                assert deck_row is not None
                assert deck_row[1:] == ("Sample Deck", "modern")
                card_rows = conn.execute(
                    "SELECT oracle_id::text, role, quantity FROM reference_deck_cards "
                    "WHERE reference_deck_id = %s ORDER BY role",
                    (deck_row[0],),
                ).fetchall()
                assert card_rows == [
                    (card["oracle_id"], "main", 4),
                    (card["oracle_id"], "sideboard", 2),
                ]
                status_row = conn.execute(
                    "SELECT last_status, deck_count FROM reference_deck_sources "
                    "WHERE source = 'local_dec'"
                ).fetchone()
                assert status_row == ("ok", 1)

            # Failed resolution preserves previously published decks.
            unresolved = [
                RawReferenceDeck(
                    source="local_dec",
                    external_id="modern/broken.dec",
                    name="Broken",
                    format="modern",
                    cards=(RawDeckCard("Card Not In Catalog", 4, "main"),),
                )
            ]
            with pytest.raises(ValueError, match="resolved cleanly"):
                publisher.publish_source("local_dec", unresolved)
            with psycopg.connect(scoped) as conn:
                assert (
                    conn.execute(
                        "SELECT count(*) FROM reference_decks WHERE source = 'local_dec'"
                    ).fetchone()[0]
                    == 1
                )

            # Re-publishing with an empty list prunes stale decks for that source.
            assert publisher.publish_source("local_dec", []) == 0
            with psycopg.connect(scoped) as conn:
                assert (
                    conn.execute(
                        "SELECT count(*) FROM reference_decks WHERE source = 'local_dec'"
                    ).fetchone()[0]
                    == 0
                )

            # Missing active Catalog generation fails before publishing.
            with psycopg.connect(scoped) as conn:
                conn.execute("UPDATE catalog_state SET active_generation = NULL WHERE id = 1")
            with pytest.raises(RuntimeError, match="Active Catalog generation"):
                publisher.publish_source("local_dec", [])
        finally:
            admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))
