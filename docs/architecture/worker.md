# Worker

- Status: Canonical
- Last Reviewed: 2026-04-08
- Source of Truth: code
- Update Triggers: sync flow changes, Scryfall ingest changes, index behavior changes, state marker changes
- Related Docs: [System Overview](./system-overview.md), [MeiliSearch Overview](../integrations/meilisearch/README.md), [Tasks](../integrations/meilisearch/tasks.md)

The Python worker is responsible for MTG catalog ingestion and indexing.

## Current Responsibilities

- wait for MeiliSearch readiness
- configure the current indexes
- seed `default_cards` when needed
- optionally preload `all_cards` in the background
- persist sync timestamps locally under `/tmp/spellbook-worker/state.json`

## Current Sync Model

- startup health check for MeiliSearch
- index configuration
- seed if the document count suggests the index is empty
- optional background full preload
- optional periodic sync based on `SYNC_INTERVAL`

## Current Persistence

The worker stores sync markers locally so it can skip unchanged Scryfall bulk snapshots.
