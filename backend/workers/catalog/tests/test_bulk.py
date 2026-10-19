import io

import pytest

from worker.bulk import _iter_bulk_cards, _iter_json_array, _iter_jsonl


class TestIterJsonArray:
    """Stream-parse JSON arrays without loading the whole document."""

    def test_decodes_each_element_in_order(self, tmp_path):
        path = tmp_path / "cards.json"
        path.write_text('[{"id": 1, "name": "a"}, {"id": 2, "name": "b"}]')
        with path.open() as fh:
            result = list(_iter_json_array(fh))
        assert result == [{"id": 1, "name": "a"}, {"id": 2, "name": "b"}]

    def test_handles_whitespace_and_newlines(self, tmp_path):
        path = tmp_path / "cards.json"
        path.write_text('\n  [\n  {"id": 1},\n  {"id": 2}\n  ]\n')
        with path.open() as fh:
            result = list(_iter_json_array(fh))
        assert [obj["id"] for obj in result] == [1, 2]

    def test_empty_array(self, tmp_path):
        path = tmp_path / "cards.json"
        path.write_text("[]")
        with path.open() as fh:
            result = list(_iter_json_array(fh))
        assert result == []

    def test_rejects_non_array(self, tmp_path):
        path = tmp_path / "cards.json"
        path.write_text('{"id": 1}')
        with path.open() as fh, pytest.raises(ValueError, match="JSON array"):
            list(_iter_json_array(fh))


class TestBulkParsing:
    @pytest.mark.parametrize(
        "payload", ['[{"id":1}', '[{"id":1},]', '[{"id":1}{"id":2}]', "[1]", "[{}] garbage", ""]
    )
    def test_rejects_invalid_array(self, payload):
        with pytest.raises(ValueError):
            list(_iter_json_array(io.StringIO(payload)))

    @pytest.mark.parametrize("chunk_size", [1, 2, 7])
    def test_array_objects_can_span_chunks(self, monkeypatch, chunk_size):
        monkeypatch.setattr("worker.bulk._STREAM_CHUNK_SIZE", chunk_size)
        payload = '\n[{"id":"first"}, {"id":"second"}]\n'
        assert list(_iter_json_array(io.StringIO(payload))) == [{"id": "first"}, {"id": "second"}]

    @pytest.mark.parametrize("payload", ['{"id":1}\nnull', '{"id":1}\n[]', '{"id":1}\n{bad'])
    def test_rejects_invalid_jsonl_with_line_number(self, payload):
        with pytest.raises(ValueError, match="line 2"):
            list(_iter_jsonl(io.StringIO(payload)))

    @pytest.mark.parametrize("payload", ['\n{"id":1}\n\n{"id":2}', '\n[{"id":1},{"id":2}]'])
    def test_detects_both_formats(self, payload):
        assert list(_iter_bulk_cards(io.StringIO(payload))) == [{"id": 1}, {"id": 2}]

    @pytest.mark.parametrize("payload", ["", " \n", "null", "garbage"])
    def test_rejects_unknown_or_empty_file(self, payload):
        with pytest.raises(ValueError, match="bulk file"):
            list(_iter_bulk_cards(io.StringIO(payload)))
