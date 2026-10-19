# Dormant Python API foundation

P02a provides only Discovery and host/lifetime construction for [issue 248](https://github.com/KyleDerZweite/spellbook/issues/248).
Node remains the active API in root scripts, Compose and deployment.
This package implements no session, SQL, mutation, SavedState or scheduler behavior and establishes no complete P02 acceptance.

Use Python 3.14.8 and uv 0.12.23, matching CI and the image.
The exact direct dependency pins and independent `uv.lock` make installation reproducible.
FastAPI/Uvicorn reuse the selected HTTP framework, Psycopg Pool supports the later bounded async resource owner, and the local `../core` package owns future application/SQL behavior.
Core pins Psycopg 3 separately.
Ruff owns lint/format; strict Mypy checks source and tests without requiring a Node-based checker.
Mypy 2.4.0 is verified with Python 3.14.8.
Pytest and httpx2 provide host tests and the upstream Starlette TestClient transport already used by Scan.
Hatchling is the existing worker build backend, pinned here for reproducible package builds.

From the repository root, run:

```sh
uvx --from uv==0.12.23 uv sync --project backend/api --frozen --extra dev --python 3.14.8
APP_ORIGIN=http://localhost:5173 API_HOST=127.0.0.1 API_PORT=3002 \
  uvx --from uv==0.12.23 uv run --directory backend/api --no-sync spellbook-api
```

This explicit candidate command reads no `.env` file and accepts only literal loopback bind addresses.
Port 3002 keeps the default Node API port 3001 available.
Send SIGTERM only to the verified task-owned candidate to stop it gracefully.
Do not invoke bare `uvicorn` for this host because that bypasses the pre-drain shutdown owner.

`GET /openapi.json` loads the [canonical structural artifact](../../contracts/openapi.json).
Only `servers` changes for `APP_ORIGIN`.
Hatch's small build hook embeds that artifact in the sdist and wheel; no duplicate schema is checked in.
Editable source installs read the same repository artifact directly.
GET-derived HEAD, OPTIONS with ordered Allow, the original 405 body and one trailing slash are tested for Discovery.
Missing business routes return 404; they do not claim readiness.
Framework-generated public schema and documentation routes are disabled.

Build from the repository root:

```sh
uvx --from uv==0.12.23 uv build --project backend/core
uvx --from uv==0.12.23 uv build --project backend/api
podman build -f backend/api/Dockerfile -t localhost/spellbook-python-candidate .
```

The API image uses the repository build context to resolve local Core and the neutral schema.
Its runtime contains only the installed non-editable environment, including both packages and the bundled schema.
It has no Compose service or default launcher integration.
For an explicit local Linux container run, host networking permits its loopback-only listener:

```sh
podman run --rm --network=host --name spellbook-python-candidate \
  -e APP_ORIGIN=http://localhost:5173 -e API_PORT=3002 \
  localhost/spellbook-python-candidate
```

`main.CandidateServer` calls `ApplicationLifetime.close_streams()` before Uvicorn drains requests and `close()` afterward, under a 15-second shutdown deadline.
Startup failures also call bounded cleanup.
The callbacks are idempotent and await owned work; Discovery currently owns no external resources.
P02b will supply actual finite admission/pool/LISTEN construction through this shared writer.
The Core writer owns the private actors, explicit transactions, SQL, receipts and subscription behavior.
The shared lifetime owns the sole autocommit LISTEN connection, consumer/reconnect tasks and resource teardown.
No resource is allocated at import, and Core never owns a process or module-global pool.

Reserved P02b Core modules are `db.py`, `models.py`, `errors.py`, `validation.py`, `fingerprint.py`, `auth.py`, `catalog.py`, `inventory.py` and `saved_state.py` under `backend/core/src/spellbook_core/`.
Reserved HTTP adapters are `auth.py`, `parsing.py`, `errors.py`, `routes_auth.py`, `routes_catalog.py`, `routes_inventory.py`, `routes_saved_state.py` and `sse.py` under `src/spellbook_api/http/`.
Their domain/adapter tests stay with that writer.
This shared writer retains manifests, host, `application.py`, `http/application.py`, `http/router.py`, `http/types.py`, registry/lifetime tests and shared CI/packaging.
Exact listener callback signatures remain subject to the reviewed P02b contract; no speculative listener abstraction is implemented here.

The [verification owner](../../docs/operations/github-automation.md#python-api-and-core) lists focused checks.
Full PostgreSQL/session/receipt/SSE behavior, dual-runtime replay and every P01 measurement remain unexecuted by this foundation.
