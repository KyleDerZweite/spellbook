# Dormant Python API candidate

P02b hosts the representative session, singleton Catalog Printing, Inventory add/detail and SavedState workflow for [issue 248](https://github.com/KyleDerZweite/spellbook/issues/248).
Node remains the active API in root scripts, Compose and deployment.
This candidate establishes no complete P02 acceptance, full API parity or P01 performance result.
Login, registration, QR, complete browsing and other domain routes remain with later slices.
There are no schedulers or ingestion jobs in this process.

Use Python 3.14.8 and uv 0.12.23, matching CI and the image.
The exact direct dependency pins and independent `uv.lock` preserve reproducible installation.
FastAPI/Uvicorn own HTTP, Psycopg Pool owns finite connection acquisition, and the local `../core` package owns typed application/SQL behavior.
Core pins Psycopg 3 separately.
Pydantic's pinned URL parser validates trusted startup origins, without framework request-body coercion.
Ruff owns lint/format; strict Mypy checks source and tests.
Pytest and httpx2 provide component/host tests and Starlette TestClient transport.
Hatchling embeds the canonical schema in both distributions.
P02b adds no dependency or version change.

From the repository root:

```sh
uvx --from uv==0.12.23 uv sync --project backend/api --frozen --extra dev --python 3.14.8 --reinstall-package spellbook-core
APP_ORIGIN=http://localhost:5173 API_HOST=127.0.0.1 API_PORT=3002 \
  uvx --from uv==0.12.23 uv run --directory backend/api --no-sync spellbook-api
```

Supply `DATABASE_URL` through the existing protected environment to start the real representative workflow.
Without it, the original resource-free Discovery foundation remains available.
No command implicitly loads `.env`.
The candidate accepts only literal loopback bind addresses; port 3002 preserves Node's default port 3001.
Send SIGTERM only to a verified task-owned candidate.
Use `spellbook-api`, rather than bare Uvicorn, to retain pre-drain stream shutdown.
After changing Core, frozen-reinstall `spellbook-core` because its local path dependency is installed as a wheel.

The [neutral artifact](../../contracts/openapi.json) owns the complete structural schema; Discovery replaces only `servers` with APP_ORIGIN.
Generated framework docs/schema are disabled.
Only these business adapters are installed:

- `GET /api/auth/session`
- `GET /api/catalog/printings/{printingId}`
- `POST /api/mobile/v1/mtg/inventory`
- `GET /api/mobile/v1/mtg/inventory/{entryId}`
- `GET /api/account/events`

Missing business handlers return404.
Declared literal paths cannot fall through into a named entry parameter.
For implemented paths, OPTIONS and ordered Allow retain the neutral method inventory, including later-slice methods without fabricated business handlers.
The router normalizes URL dot segments, matches RAW literals, validates named encoding before form-Origin/Cookie SQL and passes the unchanged RAW segment to each adapter.
Duplicate headers, absent/null fields, body framing, the 1-MiB JSON decoder and 12-MiB outer cap retain explicit compatibility handling.
Cookie cleanup precedes handler cookies, including bearer and public Catalog requests.
Auth/account/singleton-Catalog responses retain no-store on errors; these Inventory routes receive no additional Cache-Control policy.
API responses retain Robots headers.
GET-derived HEAD awaits SSE response closure and creates a separate bodyless response.
The actual host also retains Node HTTP-parser method rejection and the HTTP-to-Fetch TRACE failure before router dispatch; direct router method tests remain separate.

One API instance owns a request pool with min 0/max 10, at most 32 pending acquisitions and a 2-second acquisition timeout.
Non-SSE admission allows 32 active plus 32 waiting requests, waits at most 2 seconds and rejects excess before SQL.
Core transactions set5-second statements,2-second locks and10-second transaction/idle-transaction limits.
SavedState allows 32 subscriptions with 5-second setup,10-second revalidation,15-second heartbeat and30-second slow disposal.
One separately owned autocommit LISTEN connection has one notification consumer and one externally owned authorization barrier.
Generations fence stale callbacks; recovery settles the old barrier/consumer/connection before the 500-ms retry.
Unproven connection closure fails closed, without replacement overlap.
The SSE adapter owns the sole downstream receive consumer and awaited sends, with no prefetch queue.

The lifetime owns one dedicated four-thread password executor.
Core reserves at most four actual native futures, without backlog, retaining occupancy after waiter cancellation until native completion.
`create_application` and `main.serve` accept a private optional `VerificationPlan` plus report sink.
They expose no public route, environment toggle or login port for verification.
The unchanged public Golden lanes and10-ms scheduling probe run in the same API process only when privately injected.
The60/180-second plan remains fixed; interrupted hook tests establish wiring only.

Shutdown closes admission and SSE before Uvicorn drain, then settles listener/Core/verification/native work, joins the dedicated executor and closes the request pool last.
All host shutdown phases share the 15-second deadline, including partial startup cleanup.
A deadline failure is not permission to force termination.
Cancellation never establishes that a mutation did not commit.

Build from the repository root:

```sh
uvx --from uv==0.12.23 uv build --project backend/core
uvx --from uv==0.12.23 uv build --project backend/api
podman build -f backend/api/Dockerfile -t localhost/spellbook-python-candidate .
```

The image uses the repository context for local Core and the schema, and retains only the installed noneditable runtime environment.
It has no default launcher or Compose service.
For explicit local Linux use, host networking permits its loopback listener; pass only the assigned protected environment reference and task-owned ports.

The shared writer owns manifests, host, registry, resource construction, listener supervisor, admission and their tests.
Core/domain and direct HTTP adapters retain their separate ownership.
[Repository verification](../../docs/operations/github-automation.md#python-api-and-core) owns commands and manual native-host prerequisites.
Full matched P01 cohorts and validated resource peaks remain separate pending acceptance.
