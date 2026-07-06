# Worker

- Status: Canonical
- Last Reviewed: 2026-07-06
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

## Current Limitations

- The `LANGUAGES` env var is parsed into config but not applied. All languages present in the Scryfall bulk snapshot are indexed.
- The worker exposes no HTTP health endpoint or metrics. Its status is observable only through logs and `state.json`.
