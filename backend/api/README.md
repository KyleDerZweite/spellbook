# Python API

The candidate assembles Auth/QR, Account/Profile/Dashboard, four canonical Catalog adapters, sixteen Inventory/Groups/import adapters, five Valuation adapters, seven Scan adapters, seventeen Category adapters and SavedState.
It is the normal API in the unmerged candidate, including nineteen Deck routes and all nine closed web commands.
Root scripts, Compose and the explicit Python migrator use installed packages.
The [migration contract](../../docs/architecture/python-backend-migration.md) owns functional acceptance and remaining integration work.
There are no schedulers or ingestion jobs in this process.

Use Python 3.14.8 and uv 0.12.23, matching CI and the image.
The exact direct dependency pins and independent `uv.lock` preserve reproducible installation.
FastAPI/Uvicorn own HTTP, Psycopg Pool owns finite connection acquisition, and the local `../core` package owns typed application/SQL behavior.
Core pins Psycopg 3 separately.
Pydantic's pinned URL parser validates trusted startup origins, without framework request-body coercion.
Ruff owns lint/format; strict Mypy checks source and tests.
Pytest and httpx2 provide component/host tests and Starlette TestClient transport.
Hatchling embeds the canonical schema and unchanged SQL/journal/snapshot assets in both distributions, including a wheel rebuilt from the sdist.
Scan assembly pins `boto3==1.43.118` for maintained S3/SigV4 and `python-multipart==0.0.32` for the existing bounded multipart upload contract.
The existing `httpx2==2.13.1` pin is now a runtime dependency for the Scan worker adapter.
The regenerated API lock freezes their transitive dependencies.

From the repository root:

```sh
uvx --from uv==0.12.23 uv sync --project backend/api --frozen --extra dev --python 3.14.8 --reinstall-package spellbook-core --no-editable
APP_ORIGIN=http://localhost:5173 API_HOST=127.0.0.1 API_PORT=3001 \
  uvx --from uv==0.12.23 uv run --directory backend/api --no-sync spellbook-api
```

Supply `DATABASE_URL` through the existing protected environment to start the assembled API.
The normal host rejects missing database configuration.
Set `API_DISCOVERY_ONLY=true` explicitly for resource-free Discovery.
No command implicitly loads `.env`.
The API accepts IP bind addresses, defaults to loopback port 3001 and supports container `API_HOST=0.0.0.0`.
Send SIGTERM only to a verified task-owned candidate.
Use `spellbook-api`, rather than bare Uvicorn, to retain pre-drain stream shutdown.
After changing Core, frozen-reinstall `spellbook-core` because its local path dependency is installed as a wheel.

The [neutral artifact](../../contracts/openapi.json) owns the complete structural schema; Discovery replaces only `servers` with APP_ORIGIN.
Generated framework docs/schema are disabled.
The host uses `create_catalog_routes`, `create_inventory_routes` and `create_valuation_routes` without singleton or item-handler duplicates.
Auth/Account/session/SavedState remain registered once.
Inventory import preview/commit routes now use the integrated implementation.
All factories are assembled, including `create_deck_routes` and `create_command_routes`.
Canonical methods are compared with OpenAPI; legacy aliases are compared separately with the frozen neutral inventory.
The shared compatibility adapter derives aliases from canonical factories and preserves authentication on legacy mobile Catalog reads.
MTG factories live in `spellbook_api.http.mtg`; shared Auth, account preferences, parsing, routing and process lifetime keep their owners.
Web SSR/forms forward only the selected browser cookie; direct API commands retain Bearer-before-cookie selection and cookie-mode Origin protection.
Commands reject unknown fields and delegate unchanged retry inputs to Core.

The host constructs `LocalAuth` with its owned password executor and constructs `Profile` with that same authority.
`LocalAuth` extends the existing `SessionAuth` actor interface.
Registration persists credentials, profile and initial session in one transaction.
Password rotation rechecks the verified credential under the Profile lock, replaces credentials and revokes old sessions atomically.
QR redemption locks Profile, challenge and the original approver session before issuing and consuming a session in one transaction.
The Core `hash_password` helper creates the existing scrypt encoding for future operator use; async consumers use the bounded executor's `hash` method.
`DEMO_MODE=true` and `API_TRUSTED_PROXY_ADDRESSES` retain the existing demo and explicit socket-peer trust settings.
Raw credential forms consume an Auth attempt before the bounded decoder and preserve non-string file inputs and first repeated values.
Auth/Account adapter tests run against the production registry with isolated application doubles.
`backend/core/tests/test_auth_profile_postgres.py` adds opt-in transaction, account-isolation, password-race and QR redemption cases under the existing guarded native pool.
These PostgreSQL cases require the assigned disposable target and do not run during ordinary unit tests.
`create_valuation` and `create_inventory_values` supply the real Dashboard dependency.
`VALUE_HISTORY_TIMEZONE` defaults to `Europe/Berlin`, is validated before resources are constructed and configures private history reads.
`GET /api/v1/mtg/dashboard` authenticates and computes account-scoped totals, distributions, recent entries, Deck availability and optional Scan counts in one read-only repeatable-read transaction.
Current value and thirty-day history reuse that transaction and its PostgreSQL clock.
Savepoints isolate optional Scan/valuation failures; aggregate overflow retains the existing 503 summary error.
The opt-in `backend/core/tests/test_dashboard_postgres.py` case covers real aggregates, exact-first Deck allocation, current/history reads and account isolation; Root owns its assigned database execution.

Missing business handlers return 404.
Declared literal paths cannot fall through into a named entry parameter.
For implemented paths, OPTIONS and ordered Allow retain the neutral method inventory, including later-slice methods without fabricated business handlers.
The router normalizes URL dot segments, matches RAW literals, validates named encoding before form-Origin/Cookie SQL and passes the unchanged RAW segment to each adapter.
Duplicate headers, absent/null fields, body framing, the 1-MiB JSON decoder and 12-MiB outer cap retain explicit compatibility handling.
Cookie cleanup precedes handler cookies, including bearer and public Catalog requests.
Auth/account/singleton-Catalog responses retain no-store on errors; these Inventory routes receive no additional Cache-Control policy.
API responses retain Robots headers.
GET-derived HEAD awaits SSE response closure and creates a separate bodyless response.
The actual host also retains Node HTTP-parser method rejection and the HTTP-to-Fetch TRACE failure before router dispatch; direct router method tests remain separate.
Its pinned Uvicorn H11 transport closes CONNECT tunnels without an HTTP response, matching Node's server without a `connect` listener.
The explicit manual rollback check compares fragmented CONNECT requests against installed Python and the retained external Node artifact.

One API instance owns a request pool with min 0/max 10, at most 32 pending acquisitions and a 2-second acquisition timeout.
Non-SSE admission allows 32 active plus 32 waiting requests, waits at most 2 seconds and rejects excess before SQL.
Core transactions set 5-second statements, 2-second locks and 10-second transaction/idle-transaction limits.
SavedState allows 32 subscriptions with 5-second setup, 10-second revalidation, 15-second heartbeat and 30-second slow disposal.
One separately owned autocommit LISTEN connection has one notification consumer and one externally owned authorization barrier.
Generations fence stale callbacks; recovery settles the old barrier/consumer/connection before the 500-ms retry.
Unproven connection closure fails closed, without replacement overlap.
The SSE adapter owns the sole downstream receive consumer and awaited sends, with no prefetch queue.

The lifetime owns one dedicated four-thread password executor.
Core reserves at most four actual native futures, without backlog, retaining occupancy after waiter cancellation until native completion.
The retired private `VerificationPlan` injection and performance instrumentation are removed under ADR-0027.
Functional password occupancy, cancellation, partial startup and shutdown checks remain.
Multipart credential parsing matches Node transfer encoding: exact lowercase `base64` decodes; quoted-printable, `8bit` and uppercase `BASE64` remain literal.
First duplicate values, UTF-8 replacement, file bytes and body caps remain covered.

Shutdown closes admission and SSE before Uvicorn drain, then settles listener/Core work, closes the Scan worker and storage adapters, settles native work, joins the dedicated executor and closes the request pool last.
All host shutdown phases share the 15-second deadline, including partial startup cleanup.
A deadline failure is not permission to force termination.
Cancellation never establishes that a mutation did not commit.

Build from the repository root:

```sh
uvx --from uv==0.12.23 uv build --project backend/core
uvx --from uv==0.12.23 uv build --project backend/api
podman build -f backend/api/Dockerfile -t localhost/spellbook-python-candidate .
```

The image uses the repository context for local Core, the schema, preserved migration assets and four canonical Demo fixtures, and retains only the installed noneditable runtime environment.
It has no default launcher or Compose service.
For explicit local Linux use, host networking permits its loopback listener; pass only the assigned protected environment reference and task-owned ports.

The shared writer owns manifests, host, registry, resource construction, listener supervisor, admission and their tests.
Core/domain and direct HTTP adapters retain their separate ownership.
[Repository verification](../../docs/operations/github-automation.md#python-api-and-core) owns commands and manual native-host prerequisites.
Real PostgreSQL, direct/proxy HTTP, two-process SavedState and same-data rollback remain integration evidence owned by Root.
Strict P01 resource/performance proof is retired.

Run the prepared one-shot migrator only through its explicit operator command:

```sh
uvx --from uv==0.12.23 uv run --directory backend/api --no-sync spellbook-migrate
# Optional external SQL location:
uvx --from uv==0.12.23 uv run --directory backend/api --no-sync spellbook-migrate --migrations-dir /absolute/path/to/drizzle
```

`DATABASE_URL` comes from the caller's protected environment; the CLI loads no environment file.
Installed wheels discover bundled assets without repository paths or `PYTHONPATH`.
Source checkouts read the canonical `backend/drizzle`; there is no second checked-in SQL history.
The CLI retains Core's exact ledger validation, transaction and concurrency semantics; no API startup runs it.
Production migration ownership and execution remain separately authorized operations.

Run the external install check with `SPELLBOOK_TEST_WHEEL=1 uvx --from uv==0.12.23 uv run --directory backend/api --no-sync pytest tests/test_installed_wheel.py`.
It builds a wheel directly and through the sdist, installs frozen runtime dependencies in a temporary environment, compares every bundled asset hash, and verifies configuration and substituted no-op/override calls from an external working directory.
It starts no PostgreSQL connection and establishes no real migrator integration.

The installed API also provides the prepared operator commands:

```sh
spellbook-operator-password ACCOUNT_ID USERNAME < /secure/path/password-file
spellbook-demo-seed
spellbook-demo-replace-inventory
```

These commands invoke `operators.local_password`, `operators.seed` and `operators.replace_inventory` directly.
Use the protected caller environment for `DATABASE_URL`; the commands do not load `.env`.
Password recovery reads bounded stdin and revokes sessions atomically.
Demo commands retain the `_demo`/`_design` database guard, explicit reset/apply options and read-only replacement preview.
The existing build hook includes unchanged `cards.json`, `upgrades-unleashed.json`, the versioned Catalog manifest and its `.jsonl.gz` from `backend/scripts/demo` under `spellbook_api/operators/assets` in wheels and sdists.
Source checkouts keep that canonical fixture owner; `--fixtures-dir` remains available.
The external wheel test checks all three installed `--help` commands and entrypoint mappings, exact fixture hashes, actual fixture discovery and complete streaming bundle validation after rebuilding from the sdist.
It performs no database operation.

With `DATABASE_URL`, the host constructs `ScanStorageConfiguration`, `create_scan_storage`, `HttpScanWorker` and Core `create_scan`, then registers `create_scan_routes` once.
`SCAN_STORAGE_DRIVER`, `SCAN_LOCAL_STORAGE_DIR`, all existing `S3_*` settings and `SCAN_WORKER_URL` retain their current meanings and defaults.
The worker URL defaults to `http://scan-worker:8080`; local storage defaults to `/app/storage/scans`.
No-DB Discovery startup constructs neither adapter.
Request settlement precedes adapter close, and both adapters close before the request pool, including after startup or close failures.
Tests exercise local storage, Boto3 against a task-owned HTTP protocol fixture, the actual scaffold source over TCP, timeout and shutdown.
Real Scan PostgreSQL, proxy, independently installed worker and S3 target acceptance remain with Root.

`COMMANDER_SPELLBOOK_ENABLED` retains the existing strict `true`/`false` switch and defaults to `false`.
The host configures the optional local Combo adapter on its owned pool before constructing Categories.
API and state images install system ICU for the existing Node-compatible Unicode witness ordering; no Python ICU binding or new service is introduced.
The separate [state worker](../workers/state/README.md) owns ValueHistory and WholeDeckCategory scheduling.
API startup does not create either scheduler.
Default Compose and launchers select API and independent State ownership together after the Python migrator.
