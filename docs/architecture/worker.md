# Worker

- Status: Canonical
- Last Reviewed: 2026-10-03
- Source of Truth: code
- Update Triggers: Scryfall formats, synchronization, index swaps, status persistence
- Related Docs: [System overview](./system-overview.md), [MeiliSearch](../integrations/meilisearch/README.md), [Tasks](../integrations/meilisearch/tasks.md)

The Python worker ingests Scryfall MTG bulk data into MeiliSearch. Startup retries MeiliSearch readiness, configures indexes, and seeds `default_cards` when the catalog is empty. `AGGRESSIVE_PRELOAD=true` enables a background `all_cards` preload. `SYNC_INTERVAL` selects daily, weekly, or manual synchronization.

## Ingestion

The download client prefers `jsonl_download_uri` when Scryfall supplies it and falls back to `download_uri`. It accepts plain data and gzip payloads, including concatenated gzip members, and rejects truncated gzip data.

The parser detects JSON Lines and legacy JSON arrays. Both formats stream into a temporary SQLite document store instead of loading the full catalog into memory. Malformed records, empty downloads, and catalogs with no indexable documents fail indexing instead of publishing a partial or empty catalog. The store orders documents by descending release date before batched upload. Insertion order does not guarantee which printing MeiliSearch returns for an oracle ID.

[Document transformation](../integrations/meilisearch/documents.md) owns the stored fields. [Task handling](../integrations/meilisearch/tasks.md) owns staging, completion checks, and atomic swaps.

## Persistence and limits

The worker writes `state.json` under `WORKER_DATA_DIR`, defaulting to `/tmp/spellbook-worker`. Compose mounts durable storage at `/app/data`. State includes Scryfall timestamps, the last successful sync time, document count, and the last error. Successful sync markers follow successful indexing and swaps.

`LANGUAGES` is parsed but does not filter ingestion. All languages present in the selected bulk snapshot are indexed. The worker has no HTTP health or metrics endpoint; operators inspect logs and `state.json`.
