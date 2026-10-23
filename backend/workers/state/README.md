# Python state worker

`spellbook-state-worker` owns ValueHistory scheduling and the durable WholeDeckCategory job runner in one independent process.
HTTP owns synchronous reads/mutations and enqueue operations; it imports neither this package nor its schedulers.
Core owns transactions, leases, receipts, generation/revision fencing and evaluation.
This package imports Core, never API, frontend or other workers.

WholeDeckCategory starts immediately, claims coalesced durable work and polls after each completed attempt using the existing one-second interval.
Core retains the thirty-second lease, generation/token/revision fences and controlled backoff.
ValueHistory starts immediately when `VALUE_HISTORY_ENABLED=true`, default, and keeps the existing ten-second cadence without overlapping captures.
Core's advisory lease and reporting calendar restrict observations to the accepted pre-midnight window; startup never backfills missing dates.
`VALUE_HISTORY_TIMEZONE` defaults to `Europe/Berlin` and must match API history reads.
`COMMANDER_SPELLBOOK_ENABLED` defaults to `false` and configures the process-owned pool's optional local Combo adapter.
The worker reads existing published facts and never downloads Combo data.

The runtime uses Python 3.14.8 and uv 0.12.23 with an independent frozen lock.
Psycopg Pool is the only runtime dependency besides Core and owns at most four connections with finite acquisition waiting.
There is no HTTP listener, password executor, broker, schema migration or environment-file loader.
The API and state images include the ordinary system ICU library for Node-compatible `en-US` ordering of opaque Unicode Combo witness IDs.
This is a collation dependency, not a resource-proof requirement.

From the repository root:

```sh
uvx --from uv==0.12.23 uv sync --project backend/workers/state --frozen --extra dev --python 3.14.8 --reinstall-package spellbook-core
uvx --from uv==0.12.23 uv run --directory backend/workers/state --no-sync spellbook-state-worker --help
```

Actual startup requires `DATABASE_URL` in the protected caller environment and an already migrated database.
SIGTERM/SIGINT stop the process-owned schedulers, await both transaction cleanup paths and close the pool last.
Startup failure also closes both runners and the pool; repeated or cancelled close waiters retain cleanup ownership.
Only the ValueHistory enable flag disables a runner; WholeDeckCategory remains active as in Node.

The default Compose file still starts Node and its embedded schedulers.
The explicit `podman-compose.python.yml` override selects the Python API and this sole state-process owner together.
Do not run this worker beside an active Node scheduler owner for the same deployment.
Default activation, production operations and actual scheduled PostgreSQL acceptance remain separate work.

Run package Ruff/format, strict Mypy and pytest from this package's working directory using the frozen environment.
For external production installation, run `SPELLBOOK_TEST_STATE_WHEEL=1 uvx --from uv==0.12.23 uv run --directory backend/workers/state --no-sync pytest`.
The test builds from the sdist, installs locked production dependencies outside the checkout, verifies console help and configuration failures, checks ICU ordering and constructs/closes unopened resources without database access.
Unit tests check both enabled/disabled history composition, retries, concurrent close, cancellation, startup failure and pool ordering.
Mocks and installation checks do not establish scheduled real-database effects.
