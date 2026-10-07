# Deployment

- Status: Canonical
- Last Reviewed: 2026-10-07
- Source of Truth: repo config
- Update Triggers: price publication/pair and optional recovery, source opt-ins and ingestion limits, compose services and first startup, catalog import and recovery, images, local launch commands and preview target, environment variables, migrations, storage, workspace ownership and compatibility adapters, Inventory ICU preflight and collation recovery, Inventory original-acknowledgement migration, Deck revision/acknowledgement migrations, SavedState migration/listener capacity and proxy streaming
- Related Docs: [Postgres](../architecture/postgres.md), [Operations](./README.md), [Local authentication](./local-auth.md), [System overview](../architecture/system-overview.md), [Private instance template](./private-instance-template.md), [GitHub automation](./github-automation.md), [PostgreSQL upgrade](./postgres-upgrade.md), [Classifier research](../integrations/card-categorization.md)

The canonical service definitions are [`podman-compose.yml`](../../podman-compose.yml) and the local storage override [`podman-compose.dev.yml`](../../podman-compose.dev.yml). Keep live domains, account details, and secret references in private operator notes.

## Local development

[`dev.sh`](../../dev.sh) starts the host development environment. It uses the pinned Node version through `fnm` when available; otherwise activate that version before launching. Install the root workspace dependencies with `pnpm install --frozen-lockfile` from the repository root and prepare the scan-worker environment with `uv sync --project scan-worker --frozen`. An existing PostgreSQL database with migrations applied is required. [Demo setup](./local-auth.md#demo-mode) owns the explicit initial migration and seed commands.

Copy [`.env.local.example`](../../.env.local.example) to the ignored root `.env.local` and set its database connection. Enable `DEMO_MODE` only for the prepared disposable demo. The launcher reads `.env.local`, not the deployment `.env`; environment variables already supplied by the caller take precedence. Run from the repository root:

```sh
./dev.sh
```

The equivalent frontend command is `pnpm --dir frontend dev:local`. The launcher starts Vite with Hot Reload on port 5173 and the scan-worker on loopback port 8087. Both use local scan storage, defaulting to the ignored `.local/scans` directory. Set `SCAN_LOCAL_STORAGE_DIR` in `.env.local` to retain an existing artifact directory. `APP_ORIGIN` defaults to `http://localhost:5173`; override it only to match the browser origin used for form submissions.

Stopping the launcher terminates its own frontend and scan-worker processes. An error or occupied port shuts down the other child process too. Existing services and the database are not stopped. Startup does not apply migrations, seed or reset accounts, synchronize the catalog, build containers or start a tunnel. The scan-worker still returns no matches; manual review remains available.

The T3 project uses `./dev.sh` as its Dev server script and `http://localhost:5173/` as its design-review preview URL. The root always shows the public landing, including with a signed-in demo session. Open `/mtg/dashboard` to review the private account summary. The removed `review=landing` override is no longer needed. The preview URL is a local app setting, not deployment configuration.

The Compose base file starts the built stack on port 3000. Its `podman-compose.dev.yml` override selects a shared local scan-storage volume instead of S3; it does not run Vite or enable Hot Reload.

## Workspace image ownership

[Root package.json](../../package.json), [pnpm-workspace.yaml](../../pnpm-workspace.yaml) and [pnpm-lock.yaml](../../pnpm-lock.yaml) own Node workspace install policies and the package-manager pin. Frontend-scoped install commands still resolve this frozen root workspace. Keep the root manifests and `frontend/`, `backend/`, `contracts/` and `scripts/` in the image build context.

The [frontend Dockerfile](../../frontend/Dockerfile) copies workspace manifests before installation, builds the frontend with backend/contracts sources and the client-boundary check, then installs production workspace dependencies for runtime. The runtime starts `node frontend/build/index.js` from `/app`. The migrator keeps `/app/frontend` and `pnpm db:migrate`, preserving existing Compose/operator commands and `frontend/drizzle/` history. Compose contexts remain the repository root. This module split adds no independently deployed backend service.

## Services and startup

| Service       | Responsibility                                                    |
| ------------- | ----------------------------------------------------------------- |
| `postgres`    | Accounts, inventory, decks, scan metadata, and the public catalog |
| `db-migrate`  | One-shot Drizzle migrations                                       |
| `worker`      | Scryfall catalog ingestion and synchronization                    |
| `frontend`    | SvelteKit web application and API                                 |
| `scan-worker` | Scan API scaffold that returns no matches                         |
| `newt`        | Optional Pangolin tunnel, enabled by the `tunnel` profile         |

`postgres` has a compose health check. `db-migrate` waits for healthy Postgres, and both the frontend and catalog worker wait for successful migration completion. Other dependencies require service startup, not readiness. The catalog worker also retries database schema readiness with backoff. No vector database is required.

On a new deployment, `podman-compose up --build -d` runs migrations and starts the catalog worker. The worker immediately imports the configured Scryfall bulk source into PostgreSQL, then repeats on the configured interval, daily by default. Scryfall does not require an application credential. Operators do not import the shared catalog for individual accounts. The first publication may still be in progress after the frontend starts, so search can be empty until the worker completes. Check the worker logs and active generation as described in [catalog migration and recovery](#catalog-migration-and-recovery). The worker has no HTTP readiness or import-status endpoint.

This automatic import applies to the Compose deployment. The host [development launcher](#local-development) expects an existing migrated database and does not start the catalog worker. The explicit [demo setup](./local-auth.md#demo-mode) seeds only 70 printing records for 69 canonical cards; it does not fetch the full Scryfall catalog. Neither workflow downloads card image files for the catalog.

The frontend binds to host loopback port 3000. Configure a reverse proxy or enable the optional tunnel. Catalog requests use the same application origin.

For an existing PostgreSQL 17 deployment, complete the [database dump/restore upgrade](./postgres-upgrade.md) before starting migrations or the frontend. The new `postgres18_data` volume is initially empty; the original `postgres_data` volume remains available for rollback.

1. Copy `.env.example` to a private `.env` and replace the database credentials.
2. Set `APP_ORIGIN` to the externally reachable application origin.
3. Configure scan storage as described below.
4. Run `podman-compose up --build -d` for the base stack.
5. Inspect migration and worker logs, then register a local account. Enroll existing accounts using [local authentication operations](./local-auth.md).

Use `podman-compose --profile tunnel up --build -d` to include Newt. Set `PANGOLIN_ENDPOINT`, `NEWT_ID`, and `NEWT_SECRET` only for that profile. The tunnel transports requests; local authentication owns login.

## Configuration

| Variable                                            | Meaning                                                                                                                 |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `APP_ORIGIN`                                        | Public application origin compiled into the frontend; compose passes it as a build argument                             |
| `ADDRESS_HEADER`, `XFF_DEPTH`                       | Optional trusted-proxy client address configuration; leave the header empty until proxy trust is configured             |
| `BODY_SIZE_LIMIT`                                   | Adapter request limit; compose defaults to `12M` to allow multipart overhead around a 10 MiB scan image                 |
| `DEMO_MODE`                                         | Set to `true` only for an explicitly seeded disposable demo. See [demo setup](./local-auth.md#demo-mode).               |
| `DATABASE_URL`                                      | Server, catalog worker, or operator PostgreSQL connection; compose constructs its internal connection from `POSTGRES_*` |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Database and credentials; replace the example password                                                                  |
| `CATALOG_SOURCE`                                    | Scryfall source: `all_cards` by default, or `default_cards`                                                             |
| `SCRYFALL_BULK_URL`                                 | Scryfall bulk-data list URL; defaults to `https://api.scryfall.com/bulk-data`                                           |
| `SYNC_INTERVAL`                                     | `daily`, `weekly`, or `manual`                                                                                          |
| `WORKER_DATA_DIR`                                   | Persistent worker status directory; compose uses `/app/data`                                                            |
| `SCAN_WORKER_URL`                                   | Internal scan-worker URL; compose uses `http://scan-worker:8080`                                                        |
| `SCAN_STORAGE_DRIVER`                               | `s3` in the base stack or `local` with the development override                                                         |
| `SCAN_LOCAL_STORAGE_DIR`                            | Local artifact directory for the `local` driver                                                                         |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`             | Existing S3-compatible storage endpoint, region, and bucket                                                             |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`          | S3-compatible credentials                                                                                               |
| `S3_FORCE_PATH_STYLE`                               | Defaults to `true` for S3-compatible services                                                                           |

Set `APP_ORIGIN` before building the frontend or migration image. Changing it requires `podman-compose build frontend db-migrate` and recreation of the frontend. Updating runtime environment variables alone does not change SvelteKit 3's compiled origin.

Leave `ADDRESS_HEADER` empty for direct deployments. Behind a trusted proxy, set it only when that proxy overwrites the client-address header and direct client access is blocked. For `x-forwarded-for`, set `XFF_DEPTH` to the trusted hop count. Without this configuration, users behind one proxy can share the same process-local authentication attempt limit.

Keep the reverse proxy request limit large enough for the configured adapter limit. JSON handlers independently cap streamed bodies at 1 MiB; scan uploads independently cap their multipart body at 12 MiB and image at 10 MiB. Raising `BODY_SIZE_LIMIT` does not bypass these application limits. See [request validation](../architecture/mobile-and-scan.md#request-validation).

OIDC provider variables, `AUTH_SESSION_SECRET`, and all MeiliSearch variables are no longer used. Browser catalog reads are public; account operations and the versioned integration API require authentication. Remove obsolete search origins and credentials from deployment configuration.

The optional `TYPESAFE_API_KEY` in `.env.example` belongs only to the isolated [Jev evaluation](../integrations/card-categorization.md). The prototype reads it explicitly from a protected env file. The application does not consume it and Compose does not forward it. Do not expose it through public frontend variables. A production classifier integration remains unselected.

## Storage and upgrades

Migration `0005` adds nullable request fingerprints without rewriting existing mutation history. New conflicting request-ID reuse returns HTTP 409; old null-hash records retain their earlier replay behavior. The [Postgres contract](../architecture/postgres.md#mutation-replay) owns the details.

[Migration 0012](../../frontend/drizzle/0012_deck_contracts.sql) adds Deck Description/composition revisions and persisted compact acknowledgements, retaining request records after Deck deletion. Run the existing migrator for the integrated migration history before starting these Deck contracts. [Postgres](../architecture/postgres.md#deck-persistence-and-reads) owns their persistence semantics. Existing operator commands, database/image ownership and dependencies are unchanged.

PostgreSQL and worker status use named volumes. Back up account data before migrations and keep a tested restore procedure. Image versions and runtime pins live in compose, Dockerfiles, and package manifests. Keep these files and lockfiles together when deploying an update.

Runtime support was reviewed on 2026-10-03. The workers pin [Python 3.14.8](https://www.python.org/downloads/release/python-3148/), released on 2026-10-01. Its [release schedule](https://peps.python.org/pep-0745/) provides regular bugfix releases through October 2027 and security releases through October 2030. [Python 3.15](https://peps.python.org/pep-0790/) is scheduled for final release on 2026-10-09 and is not adopted ahead of that release. [Frontend runtime policy](../architecture/frontend.md#runtime-compatibility) owns Node and framework compatibility.

PostgreSQL 18 uses the new named volume at `/var/lib/postgresql`, with database files under `/var/lib/postgresql/18/docker`. The [database upgrade procedure](./postgres-upgrade.md) owns migration, verification, and rollback for existing PostgreSQL 17 installations.

For local scan artifacts in Compose, run:

```sh
podman-compose -f podman-compose.yml -f podman-compose.dev.yml up --build -d
```

The override shares the `scan_artifacts` volume at `/app/storage/scans` between the frontend and scan-worker. For S3 storage, provision the bucket separately and configure its lifecycle policy. Scan upload bytes remain outside Postgres; PostgreSQL stores their account and review metadata. The backend Scan application owns storage and worker calls; frontend adapters inject existing configuration. Failed uploads remove only confirmed unattached objects. If COMMIT outcome cannot be established, retain the object for operator inspection rather than risking deletion of a committed artifact. Cleanup logs contain no object keys or credentials. Local filesystem and the actual Python scaffold are covered by local acceptance; real S3-compatible bucket evidence must be obtained separately. These user-uploaded images are separate from catalog card image URLs and tracked landing-page images. Recognition and normalized-image generation are not implemented.

`worker_data` persists `state.json` across container recreation. See [worker operations and limits](../architecture/worker.md).

On SELinux hosts, named volumes avoid most bind-mount relabeling. If replacing them with host paths, use `:Z` for one container or `:z` for a path shared by multiple containers. Host networking configuration belongs in operator notes rather than the shared compose file.

The [verification workflow](./github-automation.md#ci-coverage) owns CI coverage and its limits. Operators build and deploy explicitly.

## Inventory collation and recovery

[Migration 0011](../../frontend/drizzle/0011_inventory_windows.sql) requires PostgreSQL ICU support, creates deterministic root-locale `inventory_root`, verifies the accepted ordering examples and records the actual ICU version. Migration failure leaves this capability unavailable; use an ICU-enabled PostgreSQL installation and rerun the existing migrator before starting bounded Inventory reads. Demo initialization uses the same revision-aware writers and preserves the tracked sample.

After a PostgreSQL or ICU upgrade, compare the stored `pg_collation.collversion` with `pg_collation_actual_version(oid)` for `inventory_root`. If they differ, rebuild every index dependent on that collation, including `inventory_cards_window_name_idx`, before `ALTER COLLATION inventory_root REFRESH VERSION`. Coordinate writes and application restart during this operator maintenance, then verify page/location ordering against the same revision. Refreshing the version alone does not rebuild indexes. Catalog set-code equality retains its existing default collation as described in [Catalog](../architecture/catalog.md#printing-and-import-identity).

Apply [migration 0014](../../frontend/drizzle/0014_inventory_contracts.sql) with the existing migrator before starting the updated Inventory mutation application. The integrated journal applies it after 0013 SavedState, following 0011 Inventory windows and 0012 Deck contracts. It adds nullable JSONB original acknowledgements to Inventory mutation requests without fabricating or backfilling old receipts. [Postgres](../architecture/postgres.md) owns the legacy policy.

## Saved-state streaming

Apply [migration 0013](../../frontend/drizzle/0013_saved_state.sql) with the existing migrator before starting SSE-capable replicas. The integrated migration journal applies it after 0011 Inventory windows and 0012 Deck contracts. It adds commit notification triggers, not table columns. Reserve one additional PostgreSQL listener connection per application process beyond request pools. No new runtime variable, package or sticky-session configuration is required.

The `/api/account/events` proxy path must pass cookies/Authorization, disable response buffering and caching, permit long-lived streaming and use an idle timeout longer than the fifteen-second heartbeat. Changing public `APP_ORIGIN` still requires origin-matched builds. Keep credentials out of URLs. Test a live stream through the actual proxy/tunnel before rollout. Local controlled proxy/socket tests do not establish deployed proxy behavior or deployment acceptance. [The application contract](../architecture/application-contract.md#saved-state-synchronization) owns recovery/expiry; [verification](./github-automation.md) owns the reproducible two-process test.

## Catalog migration and recovery

Migration `0006` creates the catalog tables and `pg_trgm` extension. The migration database role must be allowed to create that extension, or an administrator must provision it first. After migration, the worker imports the configured Scryfall source automatically. A new deployment needs no manual catalog import or MeiliSearch export. Existing account data, decks, and inventory stay in their application tables.

When upgrading from a deployment that still runs the former MeiliSearch service, stop that old container using its previous compose configuration or observed container name. The current stack does not manage it, so it may remain running after the upgrade. Its volume is not used by PostgreSQL. Keep it until the PostgreSQL catalog is verified. Do not remove database volumes when rebuilding catalog data.

After migration, inspect the active catalog through the existing protected database connection:

```sql
SELECT g.id, g.source_type, g.source_updated_at, g.document_count, g.published_at
FROM catalog_state s
JOIN catalog_generations g ON g.id = s.active_generation
WHERE s.id = 1;
```

A published row with a positive document count indicates catalog publication. The frontend can start before first publication and return empty search results. `worker_data/state.json` records the last publication or failed synchronization attempt. Skipping an unchanged catalog does not update it; an earlier error can remain in that file. It is not a health endpoint or the publication authority. Inspect worker logs and the active generation to verify the catalog. Test public browser search and authenticated mutations before opening a fresh deployment to users.

Use `daily` or `weekly` for the persistent compose worker. Reserve `manual` for the one-shot command below; the service restart policy would otherwise restart the completed process. To rerun synchronization once, stop the scheduled worker and run:

```sh
podman-compose stop worker
podman-compose run --rm -e SYNC_INTERVAL=manual worker
```

An unchanged, already-published snapshot is skipped. To force a fresh transformation of the same source timestamp, keep the worker stopped and run this transaction through the protected database connection before the manual command:

```sql
BEGIN;
SELECT pg_advisory_xact_lock(1936747619, 1);
UPDATE catalog_generations
SET schema_version = 0
WHERE id = (SELECT active_generation FROM catalog_state WHERE id = 1);
COMMIT;
```

This invalidates the publication marker without removing the readable generation. A failed rebuild leaves that catalog available. Confirm the new publication and restart the scheduled worker with `podman-compose up -d worker`.

To restore the previous retained Catalog/Price pair, stop the Worker and run:

```sh
podman-compose run --rm --entrypoint python worker -c 'import os; from worker.catalog import CatalogPublisher; CatalogPublisher(os.environ["DATABASE_URL"]).restore_previous()'
```

The command verifies a retained recorded pair and swaps both pointers under the publisher lock in one transaction. Missing recovery data fails without changes. Verify Catalog search and reference reads. Keep the Worker stopped until the source or transformation problem is corrected; another sync can otherwise publish the newer snapshot again. Only current/previous public views are retained. [Catalog architecture](../architecture/catalog.md) owns reader guarantees.

## Scryfall price upgrade

Stop the scheduled Worker, then use the existing migrator to apply the coherent journal in order: 0014 Inventory acknowledgements, then 0015 public price references. Both migrations preserve existing account rows. Start the upgraded Worker and reference reads only after 0015 completes. A matching Catalog timestamp alone no longer skips initial price activation: successful paired publication and extraction/mapping versions are required. Existing daily/manual import commands remain unchanged. Inspect price_state joined to price_publications for source time, digest/version, active/previous IDs and safe refresh health. All-null amounts can be a successful publication.

Restore Catalog and Price together using the paired command above. Stop the scheduled Worker and invoke CatalogPublisher.restore_previous through the existing protected DATABASE_URL. This locks publication, verifies the retained pair exists and swaps both pointers atomically; no recoverable pair raises an error without changes. Verify public reference reads and Catalog search before resuming synchronization. Never infer source dates from downloaded filenames or attach today's descriptor to an older saved payload. Current/previous public views are bounded; later personal snapshots preserve trusted evidence independently.

## Optional public price upgrade and recovery

Stop scheduled ingestion and apply the coherent migrator prefix through 0016, then 0017 before starting the upgraded application/Worker. Existing private tables and rows are preserved. Set `CARDMARKET_PRICES_ENABLED=true` or `MTGJSON_PRICES_ENABLED=true` to opt into the official public feeds; both default to false. No key or account is required. Existing daily/manual Worker commands remain unchanged. Optional views and safe health are inspected through optional_price_state joined to optional_price_publications; source dates and digests come from original artifacts, never filenames or transfer timestamps.

Resource overrides are validated positive integers: `PRICE_COMPRESSED_BYTES`, `PRICE_DECOMPRESSED_BYTES`, `PRICE_RECORD_BYTES`, `PRICE_PROGRESS_SECONDS`, `PRICE_CONNECT_SECONDS`, `PRICE_DOWNLOAD_SECONDS`, `PRICE_PARSE_SECONDS`, `PRICE_PUBLICATION_SECONDS`, `PRICE_IMPORT_SECONDS` and `PRICE_STAGING_BYTES`. [Worker](../architecture/worker.md#optional-public-price-synchronization) records defaults and failure ownership. Exceeding a bound rolls back the provider, while other providers still attempt their refresh.

For optional recovery, stop the scheduled Worker and call OptionalPricePublisher.restore_previous with `Cardmarket` or `MTGJSON` through the existing protected DATABASE_URL. It verifies a recoverable previous view and swaps only that provider's pointers under the native lock. It does not restore or synthesize account history, or rewrite recorded source-history corrections. Scryfall continues to use its paired Catalog/Price recovery. Verify public/private reference reads before restarting ingestion. [Value persistence](../architecture/value-and-costs.md#optional-references-and-public-source-history) owns evidence retention and selection.
