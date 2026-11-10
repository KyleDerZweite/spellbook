# Python state worker

`spellbook-state-worker` owns ValueHistory scheduling in one independent process.

HTTP owns synchronous reads and mutations; it imports neither this package nor its schedulers. Core
owns ValueHistory transactions and advisory leases. This package imports Core, never API, frontend
or other workers.

ValueHistory starts immediately when `VALUE_HISTORY_ENABLED=true`, default, and keeps the existing
ten-second cadence without overlapping captures. Core's advisory lease and reporting calendar
restrict observations to the accepted pre-midnight window; startup never backfills missing dates.
`VALUE_HISTORY_TIMEZONE` defaults to `Europe/Berlin` and must match API history reads.

The runtime uses Python 3.14.8 and uv 0.12.23 with an independent frozen lock. Psycopg Pool is the
only runtime dependency besides Core and owns at most four connections with finite acquisition
waiting. There is no HTTP listener, password executor, broker, schema migration or environment-file
loader.

From the repository root:

```sh
uvx --from uv==0.12.23 uv sync --project backend/workers/state --frozen --extra dev --python 3.14.8 --reinstall-package spellbook-core
uvx --from uv==0.12.23 uv run --directory backend/workers/state --no-sync spellbook-state-worker --help
```

Actual startup requires `DATABASE_URL` in the protected caller environment and an already migrated
database. SIGTERM/SIGINT stop the process-owned scheduler, await transaction cleanup and close the
pool last. Startup failure also closes the runner and pool; repeated or cancelled close waiters
retain cleanup ownership.

Production Compose and `pnpm start` start this independent scheduler after the one-shot Python
migrator. API starts no scheduled runner. The previous Python Compose override is folded into the
normal topology. Actual scheduled daily ValueHistory observation, container acceptance and
production cutover remain separate checks.

Run package Ruff/format, strict Mypy and pytest from this package's working directory using the
frozen environment. For external production installation, run
`SPELLBOOK_TEST_STATE_WHEEL=1 uvx --from uv==0.12.23 uv run --directory backend/workers/state --no-sync pytest`.
The test builds from the sdist, installs locked production dependencies outside the checkout,
verifies console help and configuration failures and constructs/closes unopened resources without
database access. Unit tests check enabled/disabled history composition, retries, concurrent close,
cancellation, startup failure and pool ordering. Mocks and installation checks do not establish
scheduled real-database effects.
