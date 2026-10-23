# Scan worker

Independent HTTP scaffold with its own lock, environment, image and process.
The ASGI entrypoint remains `scan_worker.main:app`; responses remain `no_match` with `stub-v1`.
Recognition and local recognition are unchanged.

From the repository root, using Python 3.14.8 and uv 0.12.23:

```sh
uv sync --project backend/workers/scan --frozen --extra dev --python 3.14.8
uv run --project backend/workers/scan --no-sync uvicorn scan_worker.main:app --host 127.0.0.1 --port 8087
podman build -t spellbook-scan-worker backend/workers/scan
```

Use an explicit task-owned loopback port for local verification.
The root `./dev.sh` launcher starts the Scan scaffold by default alongside Python API, State, Catalog and web, after successful migration.
It owns and gracefully stops its Scan child; `--scan` remains an accepted compatibility flag.
Compose retains the `scan-worker` service, internal port 8080 and existing storage configuration.
The Scan process uses no database connection.
Native commands do not load the root `.env` automatically.

[Scan architecture](../../../docs/architecture/mobile-and-scan.md) owns the request protocol and artifact lifecycle.
[Deployment](../../../docs/operations/deployment.md) owns runtime configuration and storage.
[Verification](../../../docs/operations/github-automation.md) owns package checks and the manually invoked `test:scan` suite.
The accepted [P13 experiment contract](https://github.com/KyleDerZweite/spellbook/issues/260) defines external measurement gates, without adding request admission limits.
