import io
import json
from unittest.mock import MagicMock

import pytest
from meilisearch.errors import MeilisearchApiError

from worker.indexer import (
    INDEX_SETTINGS_ALL,
    INDEX_SETTINGS_DISTINCT,
    MeiliIndexer,
    _DocumentStore,
    _iter_bulk_cards,
    _iter_json_array,
    _iter_jsonl,
)


def _api_error(code: str, message: str = "test error"):
    err = MeilisearchApiError.__new__(MeilisearchApiError)
    err.status_code = 404
    err.code = code
    err.message = message
    err.link = None
    err.type = None
    return err


class TestIndexSettings:
    """Verify the two-index configuration constants."""

    def test_distinct_has_distinct_attribute(self):
        assert INDEX_SETTINGS_DISTINCT["distinctAttribute"] == "oracle_id"

    def test_all_has_no_distinct_attribute(self):
        assert "distinctAttribute" not in INDEX_SETTINGS_ALL

    def test_shared_searchable_attributes(self):
        assert (
            INDEX_SETTINGS_DISTINCT["searchableAttributes"]
            == INDEX_SETTINGS_ALL["searchableAttributes"]
        )

    def test_shared_filterable_attributes(self):
        assert (
            INDEX_SETTINGS_DISTINCT["filterableAttributes"]
            == INDEX_SETTINGS_ALL["filterableAttributes"]
        )

    def test_shared_sortable_attributes(self):
        assert (
            INDEX_SETTINGS_DISTINCT["sortableAttributes"]
            == INDEX_SETTINGS_ALL["sortableAttributes"]
        )

    def test_searchable_includes_name(self):
        assert "name" in INDEX_SETTINGS_DISTINCT["searchableAttributes"]

    def test_printed_name_follows_english_name_in_both_indexes(self):
        for settings in (INDEX_SETTINGS_DISTINCT, INDEX_SETTINGS_ALL):
            assert settings["searchableAttributes"][:2] == ["name", "printed_name"]

    def test_searchable_includes_oracle_text(self):
        assert "oracle_text" in INDEX_SETTINGS_DISTINCT["searchableAttributes"]

    def test_filterable_includes_colors(self):
        assert "colors" in INDEX_SETTINGS_DISTINCT["filterableAttributes"]

    def test_filterable_includes_rarity(self):
        assert "rarity" in INDEX_SETTINGS_DISTINCT["filterableAttributes"]

    def test_filterable_includes_oracle_id(self):
        assert "oracle_id" in INDEX_SETTINGS_ALL["filterableAttributes"]

    def test_filterable_includes_import_resolver_fields(self):
        assert "normalized_name" in INDEX_SETTINGS_ALL["filterableAttributes"]
        assert "collector_number" in INDEX_SETTINGS_ALL["filterableAttributes"]
        assert "normalized_name" in INDEX_SETTINGS_DISTINCT["filterableAttributes"]
        assert "collector_number" in INDEX_SETTINGS_DISTINCT["filterableAttributes"]

    def test_typo_tolerance_enabled(self):
        assert INDEX_SETTINGS_DISTINCT["typoTolerance"]["enabled"] is True
        assert INDEX_SETTINGS_ALL["typoTolerance"]["enabled"] is True


class TestConfigureIndexes:
    """Test MeiliIndexer.configure_indexes()."""

    def test_updates_both_indexes(self):
        mock_client = MagicMock()
        mock_client.wait_for_task.return_value = MagicMock(status="succeeded")
        mock_distinct = MagicMock()
        mock_all = MagicMock()
        mock_client.index.side_effect = lambda name: {
            "cards_distinct": mock_distinct,
            "cards_all": mock_all,
        }[name]

        indexer = MeiliIndexer.__new__(MeiliIndexer)
        indexer.client = mock_client
        indexer.distinct_index = mock_distinct
        indexer.all_index = mock_all
        indexer.configure_indexes()

        mock_distinct.update_settings.assert_called_once()
        mock_all.update_settings.assert_called_once()

    def test_distinct_index_gets_oracle_id(self):
        mock_client = MagicMock()
        mock_client.wait_for_task.return_value = MagicMock(status="succeeded")
        mock_distinct = MagicMock()
        mock_all = MagicMock()

        indexer = MeiliIndexer.__new__(MeiliIndexer)
        indexer.client = mock_client
        indexer.distinct_index = mock_distinct
        indexer.all_index = mock_all
        indexer.configure_indexes()

        distinct_settings = mock_distinct.update_settings.call_args[0][0]
        assert distinct_settings["distinctAttribute"] == "oracle_id"

    def test_creates_indexes_with_primary_key(self):
        mock_client = MagicMock()
        mock_client.wait_for_task.return_value = MagicMock(status="succeeded")
        mock_distinct = MagicMock()
        mock_all = MagicMock()

        indexer = MeiliIndexer.__new__(MeiliIndexer)
        indexer.client = mock_client
        indexer.distinct_index = mock_distinct
        indexer.all_index = mock_all
        indexer.configure_indexes()

        calls = mock_client.create_index.call_args_list
        assert len(calls) == 2
        assert calls[0][0][0] == "cards_distinct"
        assert calls[1][0][0] == "cards_all"


class TestUploadDocuments:
    """Test MeiliIndexer._upload_to_index() batching and task UID tracking."""

    def test_batches_correctly(self):
        mock_index = MagicMock()
        mock_index.add_documents.return_value = MagicMock(task_uid=1)

        indexer = MeiliIndexer.__new__(MeiliIndexer)
        indexer.client = MagicMock()
        indexer.batch_size = 3

        docs = [{"id": f"card-{i}", "name": f"Card {i}"} for i in range(7)]
        task_uids = indexer._upload_to_index(mock_index, docs, "test_index")

        # 7 docs / batch_size 3 = 3 batches (3, 3, 1)
        assert mock_index.add_documents.call_count == 3
        assert len(task_uids) == 3

    def test_single_batch_when_under_limit(self):
        mock_index = MagicMock()
        mock_index.add_documents.return_value = MagicMock(task_uid=42)

        indexer = MeiliIndexer.__new__(MeiliIndexer)
        indexer.client = MagicMock()
        indexer.batch_size = 100

        docs = [{"id": f"card-{i}"} for i in range(5)]
        task_uids = indexer._upload_to_index(mock_index, docs, "test_index")

        assert mock_index.add_documents.call_count == 1
        assert len(mock_index.add_documents.call_args[0][0]) == 5
        assert task_uids == [42]

    def test_empty_docs_no_calls(self):
        mock_index = MagicMock()

        indexer = MeiliIndexer.__new__(MeiliIndexer)
        indexer.client = MagicMock()
        indexer.batch_size = 100

        task_uids = indexer._upload_to_index(mock_index, [], "test_index")
        mock_index.add_documents.assert_not_called()
        assert task_uids == []


class TestStagingIndexes:
    """Test zero-downtime staging helpers."""

    def test_configure_staging_index_uses_next_name(self):
        mock_client = MagicMock()
        mock_client.wait_for_task.return_value = MagicMock(status="succeeded")
        mock_index = MagicMock()
        mock_client.create_index.return_value = MagicMock(task_uid=10)
        mock_index.update_settings.return_value = MagicMock(task_uid=11)
        mock_client.index.return_value = mock_index

        indexer = MeiliIndexer.__new__(MeiliIndexer)
        indexer.client = mock_client

        result = indexer._configure_staging_index("cards_all_next", INDEX_SETTINGS_ALL)

        mock_client.delete_index.assert_called_once_with("cards_all_next")
        mock_client.create_index.assert_called_once_with("cards_all_next", {"primaryKey": "id"})
        mock_client.index.assert_called_once_with("cards_all_next")
        mock_index.update_settings.assert_called_once_with(INDEX_SETTINGS_ALL)
        assert result == mock_index


class TestTaskFailures:
    @pytest.fixture
    def indexer(self):
        indexer = MeiliIndexer.__new__(MeiliIndexer)
        indexer.client = MagicMock()
        indexer.client.wait_for_task.return_value = MagicMock(status="succeeded")
        indexer.client.delete_index.return_value.task_uid = 1
        indexer.client.create_index.return_value.task_uid = 2
        indexer.client.index.return_value.update_settings.return_value.task_uid = 3
        indexer.client.index.return_value.add_documents.return_value.task_uid = 4
        indexer.client.swap_indexes.return_value.task_uid = 5
        indexer.batch_size = 100
        return indexer

    @pytest.fixture
    def catalog(self, tmp_path):
        path = tmp_path / "cards.jsonl"
        path.write_text('{"id":"first","oracle_id":"first"}\n')
        return path

    @pytest.mark.parametrize("failed_task", [1, 2, 3, 4])
    @pytest.mark.parametrize("status", ["failed", "canceled"])
    def test_task_failure_prevents_swap(self, indexer, catalog, failed_task, status):
        indexer.client.wait_for_task.side_effect = lambda uid, **kwargs: MagicMock(
            status=status if uid == failed_task else "succeeded",
            error={"code": "invalid_document", "message": "private document content"},
        )
        with pytest.raises(RuntimeError, match=f"task {failed_task}.*invalid_document") as exc:
            indexer.index_from_file(catalog)
        assert "private" not in str(exc.value)
        indexer.client.swap_indexes.assert_not_called()

    def test_failed_swap_does_not_delete_staged_data(self, indexer, catalog):
        indexer.client.wait_for_task.side_effect = lambda uid, **kwargs: MagicMock(
            status="failed" if uid == 5 else "succeeded", error={"code": "index_not_found"}
        )
        with pytest.raises(RuntimeError, match=r"task 5.*index_not_found"):
            indexer.index_from_file(catalog)
        assert indexer.client.delete_index.call_count == 2

    def test_missing_staging_index_is_expected_async(self, indexer):
        indexer.client.wait_for_task.return_value = MagicMock(
            status="failed", error={"code": "index_not_found"}
        )
        indexer._delete_index_if_exists("cards_all_next")

    def test_missing_staging_index_is_expected_http_404(self, indexer):
        indexer.client.delete_index.side_effect = _api_error("index_not_found")
        indexer._delete_index_if_exists("cards_all_next")
        indexer.client.wait_for_task.assert_not_called()

    def test_unrelated_delete_error_is_not_ignored(self, indexer):
        error = _api_error("internal_error")
        indexer.client.delete_index.side_effect = error
        with pytest.raises(MeilisearchApiError) as exc:
            indexer._delete_index_if_exists("cards_all_next")
        assert exc.value is error

    def test_missing_index_code_with_wrong_http_status_is_not_ignored(self, indexer):
        error = _api_error("index_not_found")
        error.status_code = 500
        indexer.client.delete_index.side_effect = error
        with pytest.raises(MeilisearchApiError):
            indexer._delete_index_if_exists("cards_all_next")

    def test_canceled_delete_is_not_treated_as_missing(self, indexer):
        indexer.client.wait_for_task.return_value = MagicMock(
            status="canceled", error={"code": "index_not_found"}
        )
        with pytest.raises(RuntimeError):
            indexer._delete_index_if_exists("cards_all_next")

    def test_failure_without_error_has_safe_message(self, indexer):
        indexer.client.wait_for_task.return_value = MagicMock(status="canceled", error=None)
        with pytest.raises(RuntimeError, match=r"task 10.*unknown_error"):
            indexer._wait_for_task(10)

    def test_error_code_cannot_inject_server_content(self, indexer):
        indexer.client.wait_for_task.return_value = MagicMock(
            status="failed", error={"code": "private\nserver content"}
        )
        with pytest.raises(RuntimeError, match="unknown_error") as exc:
            indexer._wait_for_task(10)
        assert "private" not in str(exc.value)

    def test_live_configuration_checks_settings_result(self, indexer):
        indexer.distinct_index = indexer.client.index.return_value
        indexer.all_index = indexer.client.index.return_value
        indexer.client.wait_for_task.side_effect = [
            MagicMock(status="failed", error={"code": "index_already_exists"}),
            MagicMock(status="failed", error={"code": "invalid_settings"}),
        ]
        with pytest.raises(RuntimeError, match="invalid_settings"):
            indexer.configure_indexes()
        assert indexer.client.create_index.call_count == 1

    @pytest.mark.parametrize("payload", ["[]", '{"id":"token","layout":"token"}'])
    def test_empty_catalog_cannot_replace_live_indexes(self, indexer, catalog, payload):
        catalog.write_text(payload)
        with pytest.raises(ValueError, match="no indexable cards"):
            indexer.index_from_file(catalog)
        assert indexer.client.mock_calls == []


class TestHealthCheck:
    """Test MeiliIndexer.health_check()."""

    def test_returns_true_when_healthy(self):
        mock_client = MagicMock()
        mock_client.wait_for_task.return_value = MagicMock(status="succeeded")
        mock_client.health.return_value = {"status": "available"}

        indexer = MeiliIndexer.__new__(MeiliIndexer)
        indexer.client = mock_client
        assert indexer.health_check() is True

    def test_returns_false_when_unhealthy(self):
        mock_client = MagicMock()
        mock_client.wait_for_task.return_value = MagicMock(status="succeeded")
        mock_client.health.return_value = {"status": "unavailable"}

        indexer = MeiliIndexer.__new__(MeiliIndexer)
        indexer.client = mock_client
        assert indexer.health_check() is False

    def test_returns_false_on_exception(self):
        mock_client = MagicMock()
        mock_client.wait_for_task.return_value = MagicMock(status="succeeded")
        mock_client.health.side_effect = ConnectionError("refused")

        indexer = MeiliIndexer.__new__(MeiliIndexer)
        indexer.client = mock_client
        assert indexer.health_check() is False


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
        "payload",
        ['[{"id":1}', '[{"id":1},]', '[{"id":1}{"id":2}]', "[1]", "[{}] garbage", ""],
    )
    def test_rejects_invalid_array(self, payload):
        with pytest.raises(ValueError):
            list(_iter_json_array(io.StringIO(payload)))

    @pytest.mark.parametrize("chunk_size", [1, 2, 7])
    def test_array_objects_can_span_chunks(self, monkeypatch, chunk_size):
        monkeypatch.setattr("worker.indexer._STREAM_CHUNK_SIZE", chunk_size)
        payload = '\n[{"id":"first"}, {"id":"second"}]\n'
        assert list(_iter_json_array(io.StringIO(payload))) == [
            {"id": "first"},
            {"id": "second"},
        ]

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

    def test_bad_record_does_not_modify_live_indexes(self, tmp_path):
        path = tmp_path / "cards.jsonl"
        path.write_text('{"id":"first","oracle_id":"first"}\nnull\n')
        indexer = MeiliIndexer.__new__(MeiliIndexer)
        indexer.client = MagicMock()
        with pytest.raises(ValueError, match="line 2"):
            indexer.index_from_file(path)
        assert indexer.client.mock_calls == []

    def test_jsonl_is_uploaded_to_both_staging_indexes(self, tmp_path):
        cards = [
            {"id": "old", "oracle_id": "one", "released_at": "2000-01-01"},
            {"id": "new", "oracle_id": "one", "released_at": "2026-01-01"},
        ]
        path = tmp_path / "cards.jsonl"
        path.write_text("\n".join(json.dumps(card) for card in cards))
        indexer = MeiliIndexer.__new__(MeiliIndexer)
        indexer.client = MagicMock()
        indexer.client.wait_for_task.return_value = MagicMock(status="succeeded")
        indexer.batch_size = 100
        assert indexer.index_from_file(path) == 2
        uploads = indexer.client.index.return_value.add_documents.call_args_list
        assert len(uploads) == 2
        assert all([doc["id"] for doc in call.args[0]] == ["new", "old"] for call in uploads)
        indexer.client.swap_indexes.assert_called_once_with(
            [
                {"indexes": ["cards_distinct", "cards_distinct_next"]},
                {"indexes": ["cards_all", "cards_all_next"]},
            ]
        )


class TestDocumentStore:
    """Disk-backed transformed document store."""

    def test_iter_by_release_desc_preserves_default_printing_order(self, tmp_path):
        store = _DocumentStore(tmp_path / "docs.sqlite3")
        try:
            store.add({"id": "old", "released_at": "2001-01-01"})
            store.add({"id": "new", "released_at": "2026-01-01"})
            store.add({"id": "same-day", "released_at": "2026-01-01"})

            assert [doc["id"] for doc in store.iter_by_release_desc()] == [
                "new",
                "same-day",
                "old",
            ]
            assert store.count == 3
        finally:
            store.close()


class TestGetCount:
    """Test MeiliIndexer._get_count()."""

    def test_returns_document_count(self):
        mock_index = MagicMock()
        mock_index.get_stats.return_value = MagicMock(number_of_documents=42000)

        indexer = MeiliIndexer.__new__(MeiliIndexer)
        count = indexer._get_count(mock_index)
        assert count == 42000

    def test_returns_zero_when_index_missing(self):
        mock_index = MagicMock()
        mock_index.get_stats.side_effect = _api_error("index_not_found")

        indexer = MeiliIndexer.__new__(MeiliIndexer)
        count = indexer._get_count(mock_index)
        assert count == 0

    def test_reraises_on_unrelated_api_error(self):
        mock_index = MagicMock()
        mock_index.get_stats.side_effect = _api_error("internal_error", "boom")

        indexer = MeiliIndexer.__new__(MeiliIndexer)
        with pytest.raises(MeilisearchApiError):
            indexer._get_count(mock_index)
