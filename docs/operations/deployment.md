# Deployment

- Status: Canonical
- Last Reviewed: 2026-10-03
- Source of Truth: repo config
- Update Triggers: compose services, images, environment variables, migrations, storage
- Related Docs: [Operations](./README.md), [Local authentication](./local-auth.md), [System overview](../architecture/system-overview.md), [Private instance template](./private-instance-template.md), [GitHub automation](./github-automation.md), [MeiliSearch upgrade](./meilisearch-upgrade.md)

The canonical service definitions are [`podman-compose.yml`](../../podman-compose.yml) and the local storage override [`podman-compose.dev.yml`](../../podman-compose.dev.yml). Keep live domains, account details, and secret references in private operator notes.

## Services and startup

| Service       | Responsibility                                                       |
| ------------- | -------------------------------------------------------------------- |
| `postgres`    | Accounts, credentials, sessions, inventory, decks, and scan metadata |
| `db-migrate`  | One-shot Drizzle migrations                                          |
| `meilisearch` | Searchable MTG catalog                                               |
| `worker`      | Scryfall catalog ingestion and synchronization                       |
| `frontend`    | SvelteKit web application and API                                    |
| `scan-worker` | Scan API scaffold that returns no matches                            |
| `newt`        | Optional Pangolin tunnel, enabled by the `tunnel` profile            |

`postgres` has a compose health check. `db-migrate` waits for healthy Postgres, and the frontend waits for successful migration completion. Other dependencies require service startup, not readiness. The catalog worker retries MeiliSearch with backoff. No vector database is required.

The frontend binds to host loopback port 3000. Configure a reverse proxy or enable the optional tunnel. Publish MeiliSearch through the configured browser-facing search origin; the compose file does not expose its port directly.

1. Copy `.env.example` to a private `.env` and replace the database and MeiliSearch credentials.
2. Set `APP_ORIGIN` and `PUBLIC_MEILISEARCH_URL` to the externally reachable origins.
3. Configure scan storage as described below.
4. Run `podman-compose up --build -d` for the base stack.
5. Inspect migration and worker logs, then register a local account. Enroll existing accounts using [local authentication operations](./local-auth.md).

Use `podman-compose --profile tunnel up --build -d` to include Newt. Set `PANGOLIN_ENDPOINT`, `NEWT_ID`, and `NEWT_SECRET` only for that profile. The tunnel transports requests; local authentication owns login.

## Configuration

| Variable                                            | Meaning                                                                                                     |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `APP_ORIGIN`                                        | Public application origin; compose also sets adapter-node `ORIGIN` from it                                  |
| `ADDRESS_HEADER`, `XFF_DEPTH`                       | Optional trusted-proxy client address configuration; leave the header empty until proxy trust is configured |
| `BODY_SIZE_LIMIT`                                   | Adapter request limit; compose defaults to `12M` to allow multipart overhead around a 10 MiB scan image     |
| `DATABASE_URL`                                      | Direct server or operator Postgres connection; compose constructs its internal connection from `POSTGRES_*` |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Database and credentials; replace the example password                                                      |
| `PUBLIC_MEILISEARCH_URL`                            | Browser-facing catalog origin                                                                               |
| `MEILISEARCH_INTERNAL_URL`                          | Frontend-to-MeiliSearch URL; compose uses `http://meilisearch:7700`                                         |
| `MEILISEARCH_URL`                                   | Worker-to-MeiliSearch URL; compose uses the internal service                                                |
| `MEILI_MASTER_KEY`                                  | Server and worker administrative catalog credential                                                         |
| `AGGRESSIVE_PRELOAD`                                | Whether the worker preloads `all_cards`; defaults to `true`                                                 |
| `SYNC_INTERVAL`                                     | `daily`, `weekly`, or `manual`                                                                              |
| `LANGUAGES`                                         | Parsed but currently unused; does not filter catalog ingestion                                              |
| `WORKER_DATA_DIR`                                   | Persistent worker status directory; compose uses `/app/data`                                                |
| `SCAN_WORKER_URL`                                   | Internal scan-worker URL; compose uses `http://scan-worker:8080`                                            |
| `SCAN_STORAGE_DRIVER`                               | `s3` in the base stack or `local` with the development override                                             |
| `SCAN_LOCAL_STORAGE_DIR`                            | Local artifact directory for the `local` driver                                                             |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`             | Existing S3-compatible storage endpoint, region, and bucket                                                 |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`          | S3-compatible credentials                                                                                   |
| `S3_FORCE_PATH_STYLE`                               | Defaults to `true` for S3-compatible services                                                               |

Leave `ADDRESS_HEADER` empty for direct deployments. Behind a trusted proxy, set it only when that proxy overwrites the client-address header and direct client access is blocked. For `x-forwarded-for`, set `XFF_DEPTH` to the trusted hop count. Without this configuration, users behind one proxy can share the same process-local authentication attempt limit.

Keep the reverse proxy request limit large enough for the configured adapter limit. JSON handlers independently cap streamed bodies at 1 MiB; scan uploads independently cap their multipart body at 12 MiB and image at 10 MiB. Raising `BODY_SIZE_LIMIT` does not bypass these application limits. See [request validation](../architecture/mobile-and-scan.md#request-validation).

OIDC provider variables and `AUTH_SESSION_SECRET` are no longer used. Browser catalog credentials follow the [MeiliSearch authentication contract](../integrations/meilisearch/authentication.md); no operator-supplied public search key is required.

## Storage and upgrades

Existing MeiliSearch instances must follow the [dump/import upgrade procedure](./meilisearch-upgrade.md) before starting the updated image. The procedure preserves the old catalog volume and does not enable automatic database upgrade.

Migration `0005` adds nullable request fingerprints without rewriting existing mutation history. New conflicting request-ID reuse returns HTTP 409; old null-hash records retain their earlier replay behavior. The [Postgres contract](../architecture/postgres.md#mutation-replay) owns the details.

Postgres, MeiliSearch, and worker status use named volumes. Back up account data before migrations and keep a tested restore procedure. Image versions and runtime pins live in compose, Dockerfiles, and package manifests. Keep these files and lockfiles together when deploying an update.

For local scan artifacts, run:

```sh
podman-compose -f podman-compose.yml -f podman-compose.dev.yml up --build -d
```

The override shares the `scan_artifacts` volume at `/app/storage/scans` between the frontend and scan-worker. For S3 storage, provision the bucket separately and configure its lifecycle policy. Uploads remain outside Postgres. Recognition and normalized-image generation are not implemented.

`worker_data` persists `state.json` across container recreation. See [worker operations and limits](../architecture/worker.md).

On SELinux hosts, named volumes avoid most bind-mount relabeling. If replacing them with host paths, use `:Z` for one container or `:z` for a path shared by multiple containers. Host networking configuration belongs in operator notes rather than the shared compose file.

CI validates application changes but does not publish containers or deploy the stack. Operators build and deploy explicitly.
