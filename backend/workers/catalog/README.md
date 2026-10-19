# Catalog worker

Independent ingestion package with its own lock, environment, image and process.
The import and executable entrypoint remains `worker.main`.
The Node API remains the active baseline; this relocation does not activate the Python API.

From the repository root, using Python 3.14.8 and uv 0.12.23:

```sh
uv sync --project backend/workers/catalog --frozen --extra dev --python 3.14.8
uv run --project backend/workers/catalog --no-sync python -m worker.main
podman build -t spellbook-catalog-worker backend/workers/catalog
```

Supply configuration through the existing protected environment.
Native commands do not load the root `.env` automatically.
Keep `WORKER_DATA_DIR` absolute when preserving an existing native data directory across this source relocation.
Compose retains `worker_data:/app/data` and `WORKER_DATA_DIR=/app/data`; ignored files in the former root `worker/` directory are not moved or deleted.
Run only one Catalog publisher against a database.
No scheduler or ingestion task runs inside the API process.

[Worker architecture](../../../docs/architecture/worker.md) owns ingestion, publication and recovery.
[Deployment](../../../docs/operations/deployment.md) owns runtime configuration and storage.
[Verification](../../../docs/operations/github-automation.md) owns frozen install, lint and native PostgreSQL checks.
The accepted [P13 experiment contract](https://github.com/KyleDerZweite/spellbook/issues/260) defines external measurement gates, without changing runtime limits or positive overrides.
