from __future__ import annotations

import logging
from pathlib import Path

import meilisearch
import orjson

from worker.transform import transform_card

log = logging.getLogger("worker.indexer")

# Spec Section 4: MeiliSearch Index Configuration
_SEARCHABLE = ["name", "type_line", "oracle_text", "set_name"]
_FILTERABLE = [
    "colors",
    "color_identity",
    "rarity",
    "set_code",
    "type_line",
    "mana_cost",
    "is_foil_available",
    "lang",
    "oracle_id",  # needed for printing-picker filter on cards_all
]
_SORTABLE = ["name", "rarity", "set_code", "collector_number"]

INDEX_SETTINGS_DISTINCT: dict = {
    "searchableAttributes": _SEARCHABLE,
    "filterableAttributes": _FILTERABLE,
    "sortableAttributes": _SORTABLE,
    "distinctAttribute": "oracle_id",
    "typoTolerance": {"enabled": True},
}

INDEX_SETTINGS_ALL: dict = {
    "searchableAttributes": _SEARCHABLE,
    "filterableAttributes": _FILTERABLE,
    "sortableAttributes": _SORTABLE,
    "typoTolerance": {"enabled": True},
}


class MeiliIndexer:
    """Manages MeiliSearch index configuration and document upload."""

    def __init__(
        self,
        url: str,
        master_key: str,
        batch_size: int = 20_000,
    ) -> None:
        self.client = meilisearch.Client(url, master_key)
        self.distinct_index = self.client.index("cards_distinct")
        self.all_index = self.client.index("cards_all")
        self.batch_size = batch_size

    def health_check(self) -> bool:
        """Check if MeiliSearch is reachable and healthy."""
        try:
            health = self.client.health()
            return health["status"] == "available"
        except Exception:
            return False

    def configure_indexes(self) -> None:
        """Create indexes and apply settings from spec Section 4."""
        log.info("Configuring cards_distinct index")
        self.client.create_index("cards_distinct", {"primaryKey": "id"})
        self.distinct_index.update_settings(INDEX_SETTINGS_DISTINCT)

        log.info("Configuring cards_all index")
        self.client.create_index("cards_all", {"primaryKey": "id"})
        self.all_index.update_settings(INDEX_SETTINGS_ALL)
        log.info("Index configuration applied")

    def get_distinct_count(self) -> int:
        """Get document count in cards_distinct index."""
        return self._get_count(self.distinct_index)

    def index_from_file(self, file_path: Path) -> int:
        """Read a bulk data JSON file, transform cards, upload to both indexes.

        Cards are sorted by released_at descending (newest first) so that
        MeiliSearch's distinctAttribute keeps the most recent printing.

        Returns the number of documents indexed.
        """
        log.info("Reading %s", file_path)
        raw_data = file_path.read_bytes()
        cards = orjson.loads(raw_data)
        log.info("Parsed %d raw cards", len(cards))

        # Transform and filter
        docs = []
        skipped = 0
        for card in cards:
            doc = transform_card(card)
            if doc is not None:
                docs.append(doc)
            else:
                skipped += 1
        log.info("Transformed %d cards (%d skipped)", len(docs), skipped)

        # Sort by released_at descending (newest first) for distinct dedup
        docs.sort(key=lambda d: d.get("released_at", ""), reverse=True)

        # Upload to both indexes and collect task UIDs
        log.info("Uploading to cards_distinct (%d docs)", len(docs))
        distinct_tasks = self._upload_to_index(self.distinct_index, docs, "cards_distinct")

        log.info("Uploading to cards_all (%d docs)", len(docs))
        all_tasks = self._upload_to_index(self.all_index, docs, "cards_all")

        # Wait for all tasks to complete (atomic sync per spec Section 5)
        all_task_uids = distinct_tasks + all_tasks
        log.info("Waiting for %d MeiliSearch tasks to complete", len(all_task_uids))
        for task_uid in all_task_uids:
            self.client.wait_for_task(task_uid, timeout_in_ms=300_000)
        log.info("All MeiliSearch tasks completed")

        return len(docs)

    def _upload_to_index(
        self,
        index: meilisearch.index.Index,
        docs: list[dict],
        index_name: str,
    ) -> list[int]:
        """Upload documents in batches. Returns list of task UIDs."""
        task_uids: list[int] = []
        total = len(docs)
        for i in range(0, total, self.batch_size):
            batch = docs[i : i + self.batch_size]
            task = index.add_documents(batch)
            task_uids.append(task.task_uid)
            log.info(
                "  %s: batch %d-%d / %d (task %s)",
                index_name,
                i,
                min(i + len(batch), total),
                total,
                task.task_uid,
            )
        return task_uids

    def _get_count(self, index: meilisearch.index.Index) -> int:
        """Get document count for an index."""
        try:
            stats = index.get_stats()
            return stats.number_of_documents
        except Exception:
            return 0
