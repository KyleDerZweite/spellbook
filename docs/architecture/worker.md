# Worker

- Status: Canonical
- Last Reviewed: 2026-11-06
- Source of Truth: code
- Update Triggers: art crop transform version 6, managed Category removal, complete face-color projection and explicit color evidence validation, Python default runtime activation, independent Python state package and scheduler ownership, P13 worker source relocation and retired external resource gates, Python API/worker language selection and migration planning, independent API/web ownership and relocated code references, price evidence and paired/optional publication/recovery, public history, resource limits and provider opt-ins, Scryfall formats, synchronization schedule and retries, first publication, source selection, status persistence
- Related Docs: [System overview](./system-overview.md), [Catalog](./catalog.md), [Deployment](../operations/deployment.md), [Valuation](./valuation.md), [Independent applications](./independent-applications.md), [Backend language evaluation](../integrations/backend-language-evaluation.md), [Python direction](../decisions/0025-python-api-and-workers.md), [Migration contract](./python-backend-migration.md), [P13 resource contract](https://github.com/KyleDerZweite/spellbook/issues/260)

The Python worker imports and synchronizes the shared Scryfall catalog in PostgreSQL.
[ADR-0025](../decisions/0025-python-api-and-workers.md) selects Python for API and workers, grouped under `backend/` while retaining independent processes.
Catalog publisher sources and tests reside in `backend/workers/catalog/`; the independent Scan scaffold resides in `backend/workers/scan/`.
Python imports and entrypoints remain `worker.main` and `scan_worker.main:app`.
The [accepted migration contract](./python-backend-migration.md#framework-modules-and-resources) owns package responsibilities and relocation gates.
P13 requires paired packaging, image, launcher and CI integration before the relocated packages are accepted.
The resource protocol in [issue 260](https://github.com/KyleDerZweite/spellbook/issues/260) is historical.
[ADR-0027](../decisions/0027-python-functional-migration-acceptance.md) retires its strict experiment gates; real functional package and worker evidence remains required.
Full-source cohorts, peak evidence and actual Scan TCP/application integration remain separate acceptance requirements.
It is a service-level import, not a per-account operation.
Compose starts it after database migrations.
Each process startup attempts a sync.
`CATALOG_SOURCE` selects `all_cards` by default or `default_cards`; each run synchronizes that configured source directly.
It does not replace a full-language catalog with a recurring default-only refresh.
All languages present in the selected snapshot are retained.

`SYNC_INTERVAL` selects daily, weekly, or manual execution.
Compose defaults to `daily`.
Manual execution exits after the startup attempt, with a nonzero exit status on failure.
Daily and weekly execution log a failed attempt and wait the full configured interval before trying again.
They do not retry a failed download immediately.
Database schema readiness uses a separate bounded exponential backoff before the first sync.

The [Catalog artwork contract](./catalog.md) owns the flattened art crop field and transform-version rebuild requirements.

## Ingestion

Each sync reads Scryfall's bulk-data list and selects the configured source.
A matching active source timestamp, transformation schema version, nonempty Catalog and successful paired price publication with current extractor/mapping versions let the Worker skip unchanged input.
Otherwise, the download client prefers `jsonl_download_uri` when Scryfall supplies it and falls back to `download_uri`.
It streams plain or gzip data, including concatenated gzip members, and rejects truncated gzip payloads.

The parser streams JSON Lines and legacy JSON arrays through card transformation into PostgreSQL COPY.
It does not load the full catalog into memory.
The downloaded file lives in a temporary directory under `WORKER_DATA_DIR` and is removed after each attempt.
Malformed records, invalid identities, and snapshots without indexable documents fail publication.
The active catalog remains available when publication fails.

[`transform.py`](../../backend/workers/catalog/src/worker/transform.py) owns card document transformation.
Printed colors use an explicit top-level array or the union of complete per-face arrays; missing and invalid evidence fail the import.
The transform version changes when this projection changes so an unchanged bulk export is rebuilt.
[`catalog.py`](../../backend/workers/catalog/src/worker/catalog.py) adds indexed search fields, including printed face text.
The [catalog architecture](./catalog.md) owns generation publication, reader consistency, grouping, and search behavior.

## Persistence and readiness

PostgreSQL owns source timestamps, transformation schema versions, and publication counts.
A matching active source, sufficiently recent timestamp, matching Catalog/price versions and populated paired publication allow the Worker to skip unchanged input.
Losing `state.json` does not discard these markers.
Switching the configured source triggers publication of that source.

The worker writes operator status atomically to `state.json` under `WORKER_DATA_DIR`, defaulting to `/tmp/spellbook-worker`.
Compose mounts durable storage at `/app/data`.
A successful publication records source, completion time, document count, and no error.
A failure records the source and exception class without logging credential-bearing exception text.
Skipping an unchanged catalog does not update the file, so an earlier error can remain after a successful unchanged-source check.
This file is a status report, not the authority for whether a catalog is published.
PostgreSQL generation metadata is authoritative and survives loss of this status file.

The worker has no HTTP health, metrics, or catalog-import status endpoint.
Its startup check confirms schema access, not a populated catalog.
On a fresh database, frontend search can return no results until the first publication completes.
Inspect the active generation and worker logs to confirm first-publication readiness.
A failed scheduled sync is not retried until the next daily or weekly interval.
[Deployment](../operations/deployment.md#catalog-migration-and-recovery) owns operator commands and recovery.

## Scryfall reference publication

The same import also publishes immutable Scryfall prices, supplied product links and strict printing-variant mappings.
Migration 0015 is required before schema readiness.
Unchanged-source checks require a matching successful Catalog/Price pair and current extractor/mapping versions.
Prices and mappings use sequential streaming passes in the same transaction, not unbounded raw-card memory.
After COPY, Worker refreshes statistics on the public price tables before the mapping join so repeated publications use the actual new view size.
The publisher records safe publication failure after rollback; sync records descriptor/download failures before publication begins.
Each failure has one status owner, independently of local state.json.
[Valuation](./valuation.md#implemented-market-references) owns evidence, null semantics, exact decimals and pruning; [deployment](../operations/deployment.md#catalog-migration-and-recovery) owns atomic paired recovery.
Ingestion never reads private holdings.

## Optional public price synchronization

`CARDMARKET_PRICES_ENABLED` and `MTGJSON_PRICES_ENABLED` default to `false`.
Enabled providers use the fixed official public files on the existing `SYNC_INTERVAL`, without an account, API key, SDK or endpoint override.
[The explicit coordinator](../../backend/workers/catalog/src/worker/optional_sync.py) attempts each provider independently after Scryfall, including when Scryfall fails.
Manual mode exits unsuccessfully after all enabled attempts if any failed.
Disabled providers are not fetched and do not become readiness dependencies.
PostgreSQL owns safe per-source status; `state.json` remains only the Scryfall operator report.

Each import checks complete transfer length/digest and streams bounded JSON/gzip into private temporary staging.
Defaults are 512 MiB compressed and 8 GiB decompressed per artifact, 2 MiB per record, 30 seconds without network progress, 10 seconds to connect, 600 seconds each for download, parse and publication, 1,800 seconds for the import, and 12 GiB temporary staging.
Positive `PRICE_*` bounds are validated before synchronization.
One monotonic deadline begins before downloads and covers digest reads, parsing, staging SQLite VM work, hostname resolution, PostgreSQL connection polling, SQL I/O and commit.
Database setup receives at most the remaining budget and the configured connect bound, shared by hostname resolution and handshake; expired stages do not start.
A read-only resolver subprocess is terminated and reaped on timeout, while resolved addresses retain the original hostname for authentication.
Missing positions in explicit or environment address lists share that deadline; failed lookups retain later hosts, and Unix socket paths or abstract names remain native socket candidates.
Backups resolve only after preceding native connection attempts permit fallback.
An internal nonnumeric address boundary uses libpq's numeric-address rejection and failed `PGconn.host` to distinguish eligible fallback from native authentication/protocol rejection; it performs no DNS or network attempt and never appears in final errors.
SQLite progress handlers interrupt staged joins/sorts before their first row at the original import or shorter publication deadline.
Timeout closes the owned transport.
Failure-status recording has a separate finite total connection/SQL budget, default 10 seconds through `PRICE_CONNECT_SECONDS`; its failure preserves the original import error and other provider attempts.
Limits fail without partial publication.
Download/parse failures belong to the coordinator; once publication begins the publisher owns rollback and safe failure status.
Public source publication, independent recovery and history semantics are owned by [valuation](./valuation.md#optional-references-and-public-source-history).
No adapter reads private holdings.

## Private state worker candidate

The unmerged Python [state package](../../backend/workers/state/README.md) owns ValueHistory scheduling separately from HTTP and public ingestion.
It uses the same Core application/SQL modules, with its own finite Psycopg pool and no API imports, HTTP listener or broker.
ValueHistory retains its advisory lease, reporting timezone and pre-midnight observation policy.
The runner starts immediately, avoids overlapping captures, retries controlled failures and awaits cleanup before pool closure.
`VALUE_HISTORY_ENABLED` and `VALUE_HISTORY_TIMEZONE` retain their defaults and semantics.

Default Compose and launchers start Python API and the independent State worker after successful one-shot Python migration.
The replaced Node source and embedded scheduler owner are removed from the candidate.
State installed-wheel and lifecycle tests establish packaging and local ownership.
Scheduled daily ValueHistory observation and deployment acceptance remain separate.
