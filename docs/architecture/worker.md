# Worker

- Status: Canonical
- Last Reviewed: 2026-10-03
- Source of Truth: code
- Update Triggers: Scryfall formats, synchronization, publication, source selection, status persistence
- Related Docs: [System overview](./system-overview.md), [Catalog](./catalog.md), [Deployment](../operations/deployment.md)

The Python worker ingests Scryfall bulk data into PostgreSQL. Startup retries database schema readiness. `CATALOG_SOURCE` selects `all_cards` by default or `default_cards`; each run synchronizes that source directly. It does not replace a full-language catalog with a recurring default-only refresh. All languages present in the selected snapshot are retained.

`SYNC_INTERVAL` selects daily, weekly, or manual execution. Every startup attempts a sync. Manual execution exits after that attempt, with a nonzero exit status on failure. Scheduled execution logs failure and retries after its configured interval.

## Ingestion

The download client prefers `jsonl_download_uri` when Scryfall supplies it and falls back to `download_uri`. It accepts plain data and gzip payloads, including concatenated gzip members, and rejects truncated gzip data.

The parser streams JSON Lines and legacy JSON arrays through card transformation into PostgreSQL COPY. It does not load the full catalog into memory. Malformed records, invalid identities, and snapshots without indexable documents fail publication. Downloaded bulk files are removed after each attempt.

[`transform.py`](../../worker/src/worker/transform.py) owns card document transformation. [`catalog.py`](../../worker/src/worker/catalog.py) adds indexed search fields, including printed face text. The [catalog architecture](./catalog.md) owns generation publication, reader consistency, grouping, and search behavior.

## Persistence and readiness

PostgreSQL owns source timestamps, transformation schema versions, and publication counts. A matching active source, sufficiently recent timestamp, matching schema version, and populated generation allow the worker to skip an unchanged snapshot. Losing `state.json` does not discard these markers. Switching the configured source triggers publication of that source.

The worker writes operator status atomically to `state.json` under `WORKER_DATA_DIR`, defaulting to `/tmp/spellbook-worker`. Compose mounts durable storage at `/app/data`. A successful run records source, completion time, document count, and no error. A failure records the source and exception class without logging credential-bearing exception text. This file is a status report, not the authority for whether a catalog is published.

The worker has no HTTP health or metrics endpoint. Its startup check confirms schema access, not a populated catalog. Inspect the active generation and logs to confirm first-publication readiness. [Deployment](../operations/deployment.md#catalog-migration-and-recovery) owns operator commands.
