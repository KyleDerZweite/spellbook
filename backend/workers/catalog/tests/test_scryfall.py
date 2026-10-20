import gzip
import json
import zlib
from pathlib import Path

import httpx
import pytest
import respx

from worker.scryfall import BulkDataInfo, ScryfallClient, _decode_bulk_chunks

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

    @respx.mock
    def test_prefers_current_bulk_fields(self, bulk_list_json):
        item = bulk_list_json["data"][0]
        item["jsonl_download_uri"] = "https://data.scryfall.io/default-cards.jsonl.gz"
        item["compressed_size"] = 123
        respx.get("https://api.scryfall.com/bulk-data").mock(
            return_value=httpx.Response(200, json=bulk_list_json)
        )
        result = ScryfallClient().fetch_bulk_data_list()[0]
        assert result.download_uri == item["jsonl_download_uri"]
        assert result.size == 123

    @respx.mock
    def test_accepts_current_fields_without_legacy_fields(self, bulk_list_json):
        for item in bulk_list_json["data"]:
            item["jsonl_download_uri"] = item.pop("download_uri") + "l.gz"
            item["compressed_size"] = item.pop("size")
        respx.get("https://api.scryfall.com/bulk-data").mock(
            return_value=httpx.Response(200, json=bulk_list_json)
        )
        result = ScryfallClient().fetch_bulk_data_list()
        assert len(result) == 3
        assert result[0].download_uri.endswith(".jsonl.gz")
        assert result[0].size == 529000000


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
            return_value=httpx.Response(200, stream=httpx.ByteStream(json.dumps(cards).encode()))
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
            return_value=httpx.Response(200, stream=httpx.ByteStream(json.dumps(cards).encode()))
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
            return_value=httpx.Response(200, stream=httpx.ByteStream(json.dumps(cards).encode()))
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

    @pytest.mark.parametrize("encoding", [None, "gzip"])
    @respx.mock
    def test_gzip_file_with_or_without_http_content_encoding(self, tmp_path, encoding):
        payload = b'{"id":"first"}\n{"id":"second"}\n'
        headers = {"content-encoding": encoding} if encoding else {}
        respx.get("https://data.scryfall.io/cards.jsonl.gz").mock(
            return_value=httpx.Response(
                200, stream=httpx.ByteStream(gzip.compress(payload)), headers=headers
            )
        )
        dest = tmp_path / "cards.json"
        info = BulkDataInfo("default_cards", "https://data.scryfall.io/cards.jsonl.gz", "now", 99)
        ScryfallClient().download_bulk_file(info, dest)
        assert dest.read_bytes() == payload

    @pytest.mark.parametrize("encoding", [None, "gzip"])
    @respx.mock
    def test_truncated_download_fails(self, tmp_path, encoding):
        headers = {"content-encoding": encoding} if encoding else {}
        respx.get("https://data.scryfall.io/cards.jsonl.gz").mock(
            return_value=httpx.Response(
                200,
                stream=httpx.ByteStream(gzip.compress(b'{"id":"first"}\n')[:-5]),
                headers=headers,
            )
        )
        info = BulkDataInfo("default_cards", "https://data.scryfall.io/cards.jsonl.gz", "now", 99)
        with pytest.raises(ValueError, match="Incomplete gzip"):
            ScryfallClient().download_bulk_file(info, tmp_path / "cards.json")

    @respx.mock
    def test_http_gzip_keeps_concatenated_members(self, tmp_path):
        payload = gzip.compress(b'{"id":"first"}\n') + gzip.compress(b'{"id":"second"}\n')
        respx.get("https://data.scryfall.io/cards.jsonl.gz").mock(
            return_value=httpx.Response(
                200, stream=httpx.ByteStream(payload), headers={"content-encoding": "gzip"}
            )
        )
        info = BulkDataInfo("default_cards", "https://data.scryfall.io/cards.jsonl.gz", "now", 99)
        dest = tmp_path / "cards.json"
        ScryfallClient().download_bulk_file(info, dest)
        assert dest.read_bytes() == b'{"id":"first"}\n{"id":"second"}\n'

    @respx.mock
    def test_http_gzip_can_wrap_a_gzip_file(self, tmp_path):
        payload = b'{"id":"first"}\n'
        respx.get("https://data.scryfall.io/cards.jsonl.gz").mock(
            return_value=httpx.Response(
                200,
                stream=httpx.ByteStream(gzip.compress(gzip.compress(payload))),
                headers={"content-encoding": "gzip"},
            )
        )
        info = BulkDataInfo("default_cards", "https://data.scryfall.io/cards.jsonl.gz", "now", 99)
        dest = tmp_path / "cards.json"
        ScryfallClient().download_bulk_file(info, dest)
        assert dest.read_bytes() == payload

    @respx.mock
    def test_empty_gzip_payload_fails(self, tmp_path):
        respx.get("https://data.scryfall.io/cards.jsonl.gz").mock(
            return_value=httpx.Response(200, stream=httpx.ByteStream(gzip.compress(b"")))
        )
        info = BulkDataInfo("default_cards", "https://data.scryfall.io/cards.jsonl.gz", "now", 20)
        with pytest.raises(ValueError, match="no data"):
            ScryfallClient().download_bulk_file(info, tmp_path / "cards.json")


class TestDecodeBulkChunks:
    def test_nested_decoders_allow_empty_output_chunks(self):
        payload = gzip.compress(gzip.compress(b'{"id":"first"}\n'))
        chunks = (payload[i : i + 1] for i in range(len(payload)))
        assert b"".join(_decode_bulk_chunks(_decode_bulk_chunks(chunks))) == b'{"id":"first"}\n'

    @pytest.mark.parametrize("chunk_size", [1, 7, 8192])
    def test_concatenated_members_keep_every_record(self, chunk_size):
        payload = gzip.compress(b'{"id":"first"}\n') + gzip.compress(b'{"id":"second"}\n')
        chunks = (payload[i : i + chunk_size] for i in range(0, len(payload), chunk_size))
        assert b"".join(_decode_bulk_chunks(chunks)) == b'{"id":"first"}\n{"id":"second"}\n'

    def test_limits_decompressed_chunk_size(self):
        payload = b"x" * (5 << 20)
        chunks = list(_decode_bulk_chunks([gzip.compress(payload)]))
        assert b"".join(chunks) == payload
        assert max(map(len, chunks)) <= 1 << 20

    @pytest.mark.parametrize("removed", [1, 8, 15])
    def test_rejects_truncated_second_member(self, removed):
        payload = gzip.compress(b"first") + gzip.compress(b"second")[:-removed]
        with pytest.raises(ValueError, match="Incomplete gzip"):
            list(_decode_bulk_chunks([payload]))

    def test_rejects_checksum_failure(self):
        payload = bytearray(gzip.compress(b"first"))
        payload[-8] ^= 1
        with pytest.raises(zlib.error):
            list(_decode_bulk_chunks([bytes(payload)]))
