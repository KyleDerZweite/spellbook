from __future__ import annotations

import json
import logging
import sqlite3
import tempfile
from collections.abc import Iterable, Iterator
from pathlib import Path
from typing import IO

import meilisearch
from meilisearch.errors import MeilisearchApiError

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
    "card_types",
    "mana_cost",
    "is_foil_available",
    "lang",
    "oracle_id",  # needed for printing-picker filter on cards_all
    "normalized_name",
    "collector_number",
    "legalities",
]
_SORTABLE = ["name", "rarity", "set_code", "collector_number"]

_STREAM_CHUNK_SIZE = 1 << 20  # 1 MiB
_SKIP_CHARS = " \t\n\r,"
_STORE_FLUSH_SIZE = 5_000


def _iter_json_array(fh: IO[str]) -> Iterator[dict]:
    """Yield each top-level object in a JSON array without holding the full
    document in memory.

    Uses ``json.JSONDecoder.raw_decode`` over a sliding buffer. Works for the
    Scryfall bulk file shape (``[\\n  {...},\\n  {...},\\n  ...]``) and any
    other valid JSON array of objects.
    """
    decoder = json.JSONDecoder()
    buf = ""
    started = False
    while True:
        chunk = fh.read(_STREAM_CHUNK_SIZE)
        if chunk:
            buf += chunk
        if not started:
            stripped = buf.lstrip(_SKIP_CHARS)
            if not stripped:
                if not chunk:
                    return
                buf = stripped
                continue
            if stripped[0] != "[":
                raise ValueError("expected JSON array at top level")
            buf = stripped[1:]
            started = True

        while True:
            buf = buf.lstrip(_SKIP_CHARS)
            if not buf:
                break
            if buf[0] == "]":
                return
            try:
                obj, end = decoder.raw_decode(buf)
            except json.JSONDecodeError:
                # Need more data in the buffer to finish decoding.
                break
            yield obj
            buf = buf[end:]

        if not chunk:
            # EOF without closing bracket; if anything was decoded already,
            # we trust the data, but flag malformed remainders.
            if buf.strip(_SKIP_CHARS):
                raise ValueError("trailing data after final element")
            return


class _DocumentStore:
    """Disk-backed transformed document store used during reindexing."""

    def __init__(self, path: Path) -> None:
        self.conn = sqlite3.connect(path)
        self.conn.execute(
            "CREATE TABLE docs ("
            "seq INTEGER PRIMARY KEY AUTOINCREMENT, "
            "released_at TEXT NOT NULL, "
            "body TEXT NOT NULL)"
        )
        self.pending: list[tuple[str, str]] = []
        self.count = 0

    def add(self, doc: dict) -> None:
        body = json.dumps(doc, separators=(",", ":"))
        self.pending.append((str(doc.get("released_at", "")), body))
        self.count += 1
        if len(self.pending) >= _STORE_FLUSH_SIZE:
            self.flush()

    def flush(self) -> None:
        if not self.pending:
            return
        self.conn.executemany(
            "INSERT INTO docs (released_at, body) VALUES (?, ?)",
            self.pending,
        )
        self.conn.commit()
        self.pending = []

    def iter_by_release_desc(self) -> Iterator[dict]:
        self.flush()
        cursor = self.conn.execute("SELECT body FROM docs ORDER BY released_at DESC, seq ASC")
        for (body,) in cursor:
            yield json.loads(body)

    def close(self) -> None:
        self.conn.close()


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
    "pagination": {"maxTotalHits": 5000},
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
        except (MeilisearchApiError, ConnectionError, OSError) as exc:
            log.debug("Health check failed: %s", exc)
            return False
        return health["status"] == "available"

    def configure_indexes(self) -> None:
        """Create indexes and apply settings from spec Section 4."""
        self._configure_index("cards_distinct", INDEX_SETTINGS_DISTINCT)
        self._configure_index("cards_all", INDEX_SETTINGS_ALL)
        log.info("Index configuration applied")

    def _configure_index(self, uid: str, settings: dict) -> meilisearch.index.Index:
        """Create an index when needed and apply settings."""
        if uid == "cards_distinct":
            index = self.distinct_index
        elif uid == "cards_all":
            index = self.all_index
        else:
            index = self.client.index(uid)
        log.info("Configuring %s index", uid)
        try:
            self.client.create_index(uid, {"primaryKey": "id"})
        except MeilisearchApiError as exc:
            if exc.code != "index_already_exists":
                raise
            log.info("%s index already exists", uid)
        index.update_settings(settings)
        return index

    def get_distinct_count(self) -> int:
        """Get document count in cards_distinct index."""
        return self._get_count(self.distinct_index)

    def index_from_file(self, file_path: Path) -> int:
        """Read a bulk data JSON file, transform cards, upload to both indexes.

        Cards are sorted by released_at descending (newest first) so that
        MeiliSearch's distinctAttribute keeps the most recent printing.

        The Scryfall ``all_cards`` bulk file is multi-GB, so the JSON array is
        decoded incrementally instead of loaded all at once.

        Returns the number of documents indexed.
        """
        log.info("Streaming %s", file_path)
        with tempfile.TemporaryDirectory(prefix="spellbook-index-") as tmpdir:
            store = _DocumentStore(Path(tmpdir) / "documents.sqlite3")
            try:
                seen = 0
                skipped = 0
                with file_path.open("r", encoding="utf-8") as fh:
                    for card in _iter_json_array(fh):
                        seen += 1
                        doc = transform_card(card)
                        if doc is not None:
                            store.add(doc)
                        else:
                            skipped += 1
                        if seen % 50_000 == 0:
                            log.info("  parsed %d cards so far", seen)
                store.flush()
                log.info("Transformed %d cards (%d skipped)", store.count, skipped)

                distinct_next = self._configure_staging_index(
                    "cards_distinct_next", INDEX_SETTINGS_DISTINCT
                )
                all_next = self._configure_staging_index("cards_all_next", INDEX_SETTINGS_ALL)

                log.info("Uploading to cards_distinct_next (%d docs)", store.count)
                distinct_tasks = self._upload_to_index(
                    distinct_next,
                    store.iter_by_release_desc(),
                    "cards_distinct_next",
                    total=store.count,
                )

                log.info("Uploading to cards_all_next (%d docs)", store.count)
                all_tasks = self._upload_to_index(
                    all_next,
                    store.iter_by_release_desc(),
                    "cards_all_next",
                    total=store.count,
                )

                all_task_uids = distinct_tasks + all_tasks
                log.info("Waiting for %d MeiliSearch tasks to complete", len(all_task_uids))
                for task_uid in all_task_uids:
                    self.client.wait_for_task(task_uid, timeout_in_ms=300_000)
                log.info("Document upload tasks completed")

                swap_task = self.client.swap_indexes(
                    [
                        {"indexes": ["cards_distinct", "cards_distinct_next"]},
                        {"indexes": ["cards_all", "cards_all_next"]},
                    ]
                )
                self.client.wait_for_task(swap_task.task_uid, timeout_in_ms=300_000)
                log.info("Live indexes swapped with staging indexes")

                self._delete_index_if_exists("cards_distinct_next")
                self._delete_index_if_exists("cards_all_next")

                return store.count
            finally:
                store.close()

    def _configure_staging_index(self, uid: str, settings: dict) -> meilisearch.index.Index:
        """Reset and configure a staging index for zero-downtime reindexing."""
        self._delete_index_if_exists(uid)
        create_task = self.client.create_index(uid, {"primaryKey": "id"})
        self.client.wait_for_task(create_task.task_uid, timeout_in_ms=300_000)
        index = self.client.index(uid)
        settings_task = index.update_settings(settings)
        self.client.wait_for_task(settings_task.task_uid, timeout_in_ms=300_000)
        return index

    def _delete_index_if_exists(self, uid: str) -> None:
        """Delete an index and wait for the delete task when it exists."""
        try:
            task = self.client.delete_index(uid)
        except MeilisearchApiError as exc:
            if exc.code != "index_not_found":
                raise
            log.info("%s index did not need deletion", uid)
            return
        self.client.wait_for_task(task.task_uid, timeout_in_ms=300_000)

    def _upload_to_index(
        self,
        index: meilisearch.index.Index,
        docs: Iterable[dict],
        index_name: str,
        total: int | None = None,
    ) -> list[int]:
        """Upload documents in batches. Returns list of task UIDs."""
        task_uids: list[int] = []
        if total is None and hasattr(docs, "__len__"):
            total = len(docs)  # type: ignore[arg-type]
        total_label = total if total is not None else "?"
        batch: list[dict] = []
        batch_start = 0
        sent = 0

        for doc in docs:
            batch.append(doc)
            if len(batch) < self.batch_size:
                continue
            task = index.add_documents(batch)
            task_uids.append(task.task_uid)
            sent += len(batch)
            log.info(
                "  %s: batch %d-%d / %s (task %s)",
                index_name,
                batch_start,
                sent,
                total_label,
                task.task_uid,
            )
            batch_start = sent
            batch = []

        if batch:
            task = index.add_documents(batch)
            task_uids.append(task.task_uid)
            sent += len(batch)
            log.info(
                "  %s: batch %d-%d / %s (task %s)",
                index_name,
                batch_start,
                sent,
                total_label,
                task.task_uid,
            )
        return task_uids

    def _get_count(self, index: meilisearch.index.Index) -> int:
        """Get document count for an index. Returns 0 when the index does
        not exist yet (first boot before configure_indexes)."""
        try:
            stats = index.get_stats()
        except MeilisearchApiError as exc:
            if exc.code == "index_not_found":
                return 0
            raise
        return stats.number_of_documents
