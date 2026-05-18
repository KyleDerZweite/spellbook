from unittest.mock import MagicMock

import pytest

from worker.indexer import (
    INDEX_SETTINGS_ALL,
    INDEX_SETTINGS_DISTINCT,
    MeiliIndexer,
    _DocumentStore,
    _iter_json_array,
)


def _api_error(code: str, message: str = "test error"):
    from meilisearch.errors import MeilisearchApiError

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


class TestHealthCheck:
    """Test MeiliIndexer.health_check()."""

    def test_returns_true_when_healthy(self):
        mock_client = MagicMock()
        mock_client.health.return_value = {"status": "available"}

        indexer = MeiliIndexer.__new__(MeiliIndexer)
        indexer.client = mock_client
        assert indexer.health_check() is True

    def test_returns_false_when_unhealthy(self):
        mock_client = MagicMock()
        mock_client.health.return_value = {"status": "unavailable"}

        indexer = MeiliIndexer.__new__(MeiliIndexer)
        indexer.client = mock_client
        assert indexer.health_check() is False

    def test_returns_false_on_exception(self):
        mock_client = MagicMock()
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
        path.write_text("\n  [\n  {\"id\": 1},\n  {\"id\": 2}\n  ]\n")
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
        from meilisearch.errors import MeilisearchApiError

        mock_index = MagicMock()
        mock_index.get_stats.side_effect = _api_error("internal_error", "boom")

        indexer = MeiliIndexer.__new__(MeiliIndexer)
        with pytest.raises(MeilisearchApiError):
            indexer._get_count(mock_index)
