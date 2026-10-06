# Deployment

- Status: Canonical
- Last Reviewed: 2026-10-06
- Source of Truth: repo config
- Update Triggers: compose services, images, local launch commands and preview target, environment variables, migrations, storage
- Related Docs: [Operations](./README.md), [Local authentication](./local-auth.md), [System overview](../architecture/system-overview.md), [Private instance template](./private-instance-template.md), [GitHub automation](./github-automation.md), [PostgreSQL upgrade](./postgres-upgrade.md)

The canonical service definitions are [`podman-compose.yml`](../../podman-compose.yml) and the local storage override [`podman-compose.dev.yml`](../../podman-compose.dev.yml). Keep live domains, account details, and secret references in private operator notes.

## Local development

[`dev.sh`](../../dev.sh) starts the host development environment. It uses the pinned Node version through `fnm` when available; otherwise activate that version before launching. Install frontend dependencies with `pnpm --dir frontend install --frozen-lockfile` and prepare the scan-worker environment with `uv sync --project scan-worker --frozen`. An existing PostgreSQL database with migrations applied is required. [Demo setup](./local-auth.md#demo-mode) owns the explicit initial migration and seed commands.

Copy [`.env.local.example`](../../.env.local.example) to the ignored root `.env.local` and set its database connection. Enable `DEMO_MODE` only for the prepared disposable demo. The launcher reads `.env.local`, not the deployment `.env`; environment variables already supplied by the caller take precedence. Run from the repository root:

```sh
./dev.sh
```

The equivalent frontend command is `pnpm --dir frontend dev:local`. The launcher starts Vite with Hot Reload on port 5173 and the scan-worker on loopback port 8087. Both use local scan storage, defaulting to the ignored `.local/scans` directory. Set `SCAN_LOCAL_STORAGE_DIR` in `.env.local` to retain an existing artifact directory. `APP_ORIGIN` defaults to `http://localhost:5173`; override it only to match the browser origin used for form submissions.

Stopping the launcher terminates its own frontend and scan-worker processes. An error or occupied port shuts down the other child process too. Existing services and the database are not stopped. Startup does not apply migrations, seed or reset accounts, synchronize the catalog, build containers or start a tunnel. The scan-worker still returns no matches; manual review remains available.

The T3 project uses `./dev.sh` as its Dev server script and `http://localhost:5173/` as its design-review preview URL. The root always shows the public landing, including with a signed-in demo session. Open `/mtg/dashboard` to review the private account summary. The removed `review=landing` override is no longer needed. The preview URL is a local app setting, not deployment configuration.

The Compose base file starts the built stack on port 3000. Its `.dev.yml` override selects a shared local scan-storage volume instead of S3; it does not run Vite or enable Hot Reload.

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

## Storage and upgrades

Migration `0005` adds nullable request fingerprints without rewriting existing mutation history. New conflicting request-ID reuse returns HTTP 409; old null-hash records retain their earlier replay behavior. The [Postgres contract](../architecture/postgres.md#mutation-replay) owns the details.

PostgreSQL and worker status use named volumes. Back up account data before migrations and keep a tested restore procedure. Image versions and runtime pins live in compose, Dockerfiles, and package manifests. Keep these files and lockfiles together when deploying an update.

Runtime support was reviewed on 2026-10-03. The workers pin [Python 3.14.8](https://www.python.org/downloads/release/python-3148/), released on 2026-10-01. Its [release schedule](https://peps.python.org/pep-0745/) provides regular bugfix releases through October 2027 and security releases through October 2030. [Python 3.15](https://peps.python.org/pep-0790/) is scheduled for final release on 2026-10-09 and is not adopted ahead of that release. [Frontend runtime policy](../architecture/frontend.md#runtime-compatibility) owns Node and framework compatibility.

PostgreSQL 18 uses the new named volume at `/var/lib/postgresql`, with database files under `/var/lib/postgresql/18/docker`. The [database upgrade procedure](./postgres-upgrade.md) owns migration, verification, and rollback for existing PostgreSQL 17 installations.

For local scan artifacts, run:

```sh
podman-compose -f podman-compose.yml -f podman-compose.dev.yml up --build -d
```

The override shares the `scan_artifacts` volume at `/app/storage/scans` between the frontend and scan-worker. For S3 storage, provision the bucket separately and configure its lifecycle policy. Uploads remain outside Postgres. Recognition and normalized-image generation are not implemented.

`worker_data` persists `state.json` across container recreation. See [worker operations and limits](../architecture/worker.md).

On SELinux hosts, named volumes avoid most bind-mount relabeling. If replacing them with host paths, use `:Z` for one container or `:z` for a path shared by multiple containers. Host networking configuration belongs in operator notes rather than the shared compose file.

The [verification workflow](./github-automation.md#ci-coverage) owns CI coverage and its limits. Operators build and deploy explicitly.

## Catalog migration and recovery

Migration `0006` creates the catalog tables and `pg_trgm` extension. The migration database role must be allowed to create that extension, or an administrator must provision it first. The worker then rebuilds the catalog directly from the configured Scryfall source. No MeiliSearch export is required. Existing account data, decks, and inventory stay in their application tables.

Stop the existing MeiliSearch container using the previous compose configuration or its observed container name. The new compose stack no longer manages that service, so an already-running container may remain until stopped. Its old physical volume is not deleted automatically. Preserve that volume until the new catalog is verified; it is not used by PostgreSQL. Do not remove database volumes when rebuilding catalog data.

After migration, inspect the active catalog through the existing protected database connection:

```sql
SELECT g.id, g.source_type, g.source_updated_at, g.document_count, g.published_at
FROM catalog_state s
JOIN catalog_generations g ON g.id = s.active_generation
WHERE s.id = 1;
```

A published row with a positive document count indicates catalog publication. The frontend can start before first publication and return empty search results. Inspect worker logs and test public browser search and authenticated mutations before opening a fresh deployment to users.

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

To restore the previous retained catalog, stop the worker and run:

```sql
BEGIN;
SELECT pg_advisory_xact_lock(1936747619, 1);
UPDATE catalog_state
SET active_generation = previous_generation,
    previous_generation = active_generation,
    updated_at = now()
WHERE id = 1 AND previous_generation IS NOT NULL;
COMMIT;
```

Confirm that the update affected one row and verify the active generation. Zero rows means no previous generation is available. Keep the worker stopped until the source or transformation problem is corrected; another sync can otherwise publish the newer snapshot again. Only one previous generation is retained. [Catalog architecture](../architecture/catalog.md) owns transaction and reader guarantees.
