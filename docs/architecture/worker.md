# Worker

- Status: Canonical
- Last Reviewed: 2026-09-26
- Source of Truth: code
- Update Triggers: sync flow changes, Scryfall ingest changes, index behavior changes, state marker changes
- Related Docs: [System Overview](./system-overview.md), [MeiliSearch Overview](../integrations/meilisearch/README.md), [Tasks](../integrations/meilisearch/tasks.md)

The Python worker is responsible for MTG catalog ingestion and indexing.

## Current Responsibilities

- wait for MeiliSearch readiness
- configure live and staging indexes
- seed `default_cards` when needed
- optionally preload `all_cards` in the background
- persist sync status under `WORKER_DATA_DIR/state.json`

## Current Scryfall Bulk Ingest

Scryfall serves the bulk payload as gzip-compressed JSON Lines and exposes the download location as `jsonl_download_uri` with `compressed_size`. The worker accepts that shape and the older uncompressed `download_uri`/`size` JSON array, so older snapshots still ingest.

The download is decompressed while streaming, so the file under `WORKER_DATA_DIR` is always plain text. The indexer picks the parser from the first significant byte of that file, `{` for JSON Lines and `[` for the legacy array.

## Current Sync Model

- startup health check for MeiliSearch
- index configuration
- seed if the document count suggests the index is empty
- optional background full preload
- optional periodic sync based on `SYNC_INTERVAL`
- indexing writes to `cards_distinct_next` and `cards_all_next`, waits for MeiliSearch tasks, swaps the staging indexes with the live indexes, then removes the old staging names

## Current Persistence

The worker stores sync markers locally so it can skip unchanged Scryfall bulk snapshots.

Default local path:

```text
/tmp/spellbook-worker/state.json
```

Compose sets:

```text
WORKER_DATA_DIR=/app/data
```

The status file includes Scryfall update timestamps, the last successful sync time, the last indexed document count, and the last error. Scryfall update timestamps are written only after indexing and index swapping complete successfully.
