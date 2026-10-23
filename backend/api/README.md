# Dormant Python API candidate

The candidate assembles Auth/QR, Account/Profile/Dashboard, all seven Catalog adapters, fourteen Inventory/Groups adapters, five Valuation adapters and SavedState.
Node remains the active default in root scripts, Compose and deployment until the remaining domains and operators integrate.
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
This assembly adds no dependency or version change.

From the repository root:

```sh
uvx --from uv==0.12.23 uv sync --project backend/api --frozen --extra dev --python 3.14.8 --reinstall-package spellbook-core
APP_ORIGIN=http://localhost:5173 API_HOST=127.0.0.1 API_PORT=3002 \
  uvx --from uv==0.12.23 uv run --directory backend/api --no-sync spellbook-api
```

Supply `DATABASE_URL` through the existing protected environment to start the assembled API.
Without it, the original resource-free Discovery foundation remains available.
No command implicitly loads `.env`.
The candidate accepts only literal loopback bind addresses; port 3002 preserves Node's default port 3001.
Send SIGTERM only to a verified task-owned candidate.
Use `spellbook-api`, rather than bare Uvicorn, to retain pre-drain stream shutdown.
After changing Core, frozen-reinstall `spellbook-core` because its local path dependency is installed as a wheel.

The [neutral artifact](../../contracts/openapi.json) owns the complete structural schema; Discovery replaces only `servers` with APP_ORIGIN.
Generated framework docs/schema are disabled.
The host uses `create_catalog_routes`, `create_inventory_routes` and `create_valuation_routes` without singleton or item-handler duplicates.
Auth/Account/session/SavedState remain registered once.
Inventory imports, Categories, Decks, Scan and the closed web command endpoint await their owning slices.

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
`GET /api/account/dashboard` authenticates and computes account-scoped totals, distributions, recent entries, Deck availability and optional Scan counts in one read-only repeatable-read transaction.
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
A raw TCP comparison covers fragmented CONNECT requests against both installed Python and built Node.

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

Shutdown closes admission and SSE before Uvicorn drain, then settles listener/Core/native work, joins the dedicated executor and closes the request pool last.
All host shutdown phases share the 15-second deadline, including partial startup cleanup.
A deadline failure is not permission to force termination.
Cancellation never establishes that a mutation did not commit.

Build from the repository root:

```sh
uvx --from uv==0.12.23 uv build --project backend/core
uvx --from uv==0.12.23 uv build --project backend/api
podman build -f backend/api/Dockerfile -t localhost/spellbook-python-candidate .
```

The image uses the repository context for local Core, the schema and preserved migration assets, and retains only the installed noneditable runtime environment.
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
