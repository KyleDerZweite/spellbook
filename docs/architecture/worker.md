# Worker

- Status: Canonical
- Last Reviewed: 2026-10-07
- Source of Truth: code
- Update Triggers: price evidence and paired publication/recovery, Scryfall formats, synchronization schedule and retries, first publication, source selection, status persistence
- Related Docs: [System overview](./system-overview.md), [Catalog](./catalog.md), [Deployment](../operations/deployment.md), [Value persistence](./value-and-costs.md)

The Python worker imports and synchronizes the shared Scryfall catalog in PostgreSQL. It is a service-level import, not a per-account operation. Compose starts it after database migrations. Each process startup attempts a sync. `CATALOG_SOURCE` selects `all_cards` by default or `default_cards`; each run synchronizes that configured source directly. It does not replace a full-language catalog with a recurring default-only refresh. All languages present in the selected snapshot are retained.

`SYNC_INTERVAL` selects daily, weekly, or manual execution. Compose defaults to `daily`. Manual execution exits after the startup attempt, with a nonzero exit status on failure. Daily and weekly execution log a failed attempt and wait the full configured interval before trying again. They do not retry a failed download immediately. Database schema readiness uses a separate bounded exponential backoff before the first sync.

## Ingestion

Each sync reads Scryfall's bulk-data list and selects the configured source. A matching active source timestamp, transformation schema version, nonempty Catalog and successful paired price publication with current extractor/mapping versions let the Worker skip unchanged input. Otherwise, the download client prefers `jsonl_download_uri` when Scryfall supplies it and falls back to `download_uri`. It streams plain or gzip data, including concatenated gzip members, and rejects truncated gzip payloads.

The parser streams JSON Lines and legacy JSON arrays through card transformation into PostgreSQL COPY. It does not load the full catalog into memory. The downloaded file lives in a temporary directory under `WORKER_DATA_DIR` and is removed after each attempt. Malformed records, invalid identities, and snapshots without indexable documents fail publication. The active catalog remains available when publication fails.

[`transform.py`](../../worker/src/worker/transform.py) owns card document transformation. [`catalog.py`](../../worker/src/worker/catalog.py) adds indexed search fields, including printed face text. The [catalog architecture](./catalog.md) owns generation publication, reader consistency, grouping, and search behavior.

## Persistence and readiness

PostgreSQL owns source timestamps, transformation schema versions, and publication counts. A matching active source, sufficiently recent timestamp, matching Catalog/price versions and populated paired publication allow the Worker to skip unchanged input. Losing `state.json` does not discard these markers. Switching the configured source triggers publication of that source.

The worker writes operator status atomically to `state.json` under `WORKER_DATA_DIR`, defaulting to `/tmp/spellbook-worker`. Compose mounts durable storage at `/app/data`. A successful publication records source, completion time, document count, and no error. A failure records the source and exception class without logging credential-bearing exception text. Skipping an unchanged catalog does not update the file, so an earlier error can remain after a successful unchanged-source check. This file is a status report, not the authority for whether a catalog is published. PostgreSQL generation metadata is authoritative and survives loss of this status file.

The worker has no HTTP health, metrics, or catalog-import status endpoint. Its startup check confirms schema access, not a populated catalog. On a fresh database, frontend search can return no results until the first publication completes. Inspect the active generation and worker logs to confirm first-publication readiness. A failed scheduled sync is not retried until the next daily or weekly interval. [Deployment](../operations/deployment.md#catalog-migration-and-recovery) owns operator commands and recovery.

## Scryfall reference publication

The same import also publishes immutable Scryfall prices, supplied product links and strict printing-variant mappings. Migration 0015 is required before schema readiness. Unchanged-source checks require a matching successful Catalog/Price pair and current extractor/mapping versions. Prices and mappings use sequential streaming passes in the same transaction, not unbounded raw-card memory. PostgreSQL stores safe failed-refresh status after rollback independently of local state.json. [Value persistence](./value-and-costs.md#implemented-scryfall-references) owns evidence, null semantics, exact decimals and pruning; [deployment](../operations/deployment.md#catalog-migration-and-recovery) owns atomic paired recovery. Ingestion never reads private holdings.
