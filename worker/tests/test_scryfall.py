import json
from pathlib import Path

import httpx
import pytest
import respx

from worker.scryfall import BulkDataInfo, ScryfallClient

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def bulk_list_json():
    return json.loads((FIXTURES / "bulk_data_list.json").read_text())


class TestFetchBulkDataList:
    """Tests for ScryfallClient.fetch_bulk_data_list()."""

    @respx.mock
    def test_returns_all_items(self, bulk_list_json):
        respx.get("https://api.scryfall.com/bulk-data").mock(
            return_value=httpx.Response(200, json=bulk_list_json)
        )
        client = ScryfallClient("https://api.scryfall.com/bulk-data")
        items = client.fetch_bulk_data_list()
        assert len(items) == 3

    @respx.mock
    def test_parses_types(self, bulk_list_json):
        respx.get("https://api.scryfall.com/bulk-data").mock(
            return_value=httpx.Response(200, json=bulk_list_json)
        )
        client = ScryfallClient("https://api.scryfall.com/bulk-data")
        items = client.fetch_bulk_data_list()
        types = [item.type for item in items]
        assert types == ["default_cards", "all_cards", "oracle_cards"]

    @respx.mock
    def test_parses_download_uri(self, bulk_list_json):
        respx.get("https://api.scryfall.com/bulk-data").mock(
            return_value=httpx.Response(200, json=bulk_list_json)
        )
        client = ScryfallClient("https://api.scryfall.com/bulk-data")
        items = client.fetch_bulk_data_list()
        assert "default-cards" in items[0].download_uri

    @respx.mock
    def test_parses_size(self, bulk_list_json):
        respx.get("https://api.scryfall.com/bulk-data").mock(
            return_value=httpx.Response(200, json=bulk_list_json)
        )
        client = ScryfallClient("https://api.scryfall.com/bulk-data")
        items = client.fetch_bulk_data_list()
        assert items[0].size == 529000000

    @respx.mock
    def test_raises_on_http_error(self):
        respx.get("https://api.scryfall.com/bulk-data").mock(return_value=httpx.Response(500))
        client = ScryfallClient("https://api.scryfall.com/bulk-data")
        with pytest.raises(httpx.HTTPStatusError):
            client.fetch_bulk_data_list()


class TestGetDownloadInfo:
    """Tests for ScryfallClient.get_download_info()."""

    @respx.mock
    def test_finds_default_cards(self, bulk_list_json):
        respx.get("https://api.scryfall.com/bulk-data").mock(
            return_value=httpx.Response(200, json=bulk_list_json)
        )
        client = ScryfallClient("https://api.scryfall.com/bulk-data")
        info = client.get_download_info("default_cards")
        assert info is not None
        assert info.type == "default_cards"
        assert "default-cards" in info.download_uri

    @respx.mock
    def test_finds_all_cards(self, bulk_list_json):
        respx.get("https://api.scryfall.com/bulk-data").mock(
            return_value=httpx.Response(200, json=bulk_list_json)
        )
        client = ScryfallClient("https://api.scryfall.com/bulk-data")
        info = client.get_download_info("all_cards")
        assert info is not None
        assert info.type == "all_cards"

    @respx.mock
    def test_returns_none_for_missing_type(self, bulk_list_json):
        respx.get("https://api.scryfall.com/bulk-data").mock(
            return_value=httpx.Response(200, json=bulk_list_json)
        )
        client = ScryfallClient("https://api.scryfall.com/bulk-data")
        info = client.get_download_info("nonexistent_type")
        assert info is None


class TestDownloadBulkFile:
    """Tests for ScryfallClient.download_bulk_file()."""

    @respx.mock
    def test_downloads_to_path(self, tmp_path):
        cards = [{"id": "card-1", "name": "Test Card"}]
        respx.get("https://data.scryfall.io/default-cards/default-cards-20260321.json").mock(
            return_value=httpx.Response(200, content=json.dumps(cards).encode())
        )
        client = ScryfallClient("https://api.scryfall.com/bulk-data")
        info = BulkDataInfo(
            type="default_cards",
            download_uri="https://data.scryfall.io/default-cards/default-cards-20260321.json",
            updated_at="2026-03-21T09:00:00+00:00",
            size=100,
        )
        dest = tmp_path / "cards.json"
        client.download_bulk_file(info, dest)
        assert dest.exists()

    @respx.mock
    def test_written_content_is_valid_json(self, tmp_path):
        cards = [{"id": "card-1", "name": "Test Card"}]
        respx.get("https://data.scryfall.io/default-cards/default-cards-20260321.json").mock(
            return_value=httpx.Response(200, content=json.dumps(cards).encode())
        )
        client = ScryfallClient("https://api.scryfall.com/bulk-data")
        info = BulkDataInfo(
            type="default_cards",
            download_uri="https://data.scryfall.io/default-cards/default-cards-20260321.json",
            updated_at="2026-03-21T09:00:00+00:00",
            size=100,
        )
        dest = tmp_path / "cards.json"
        client.download_bulk_file(info, dest)
        loaded = json.loads(dest.read_text())
        assert len(loaded) == 1
        assert loaded[0]["name"] == "Test Card"

    @respx.mock
    def test_creates_parent_directories(self, tmp_path):
        cards = [{"id": "card-1"}]
        respx.get("https://data.scryfall.io/test.json").mock(
            return_value=httpx.Response(200, content=json.dumps(cards).encode())
        )
        client = ScryfallClient("https://api.scryfall.com/bulk-data")
        info = BulkDataInfo(
            type="default_cards",
            download_uri="https://data.scryfall.io/test.json",
            updated_at="2026-03-21",
            size=10,
        )
        dest = tmp_path / "nested" / "dir" / "cards.json"
        client.download_bulk_file(info, dest)
        assert dest.exists()
