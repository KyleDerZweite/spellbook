# Repository verification and GitHub automation

- Status: Canonical
- Last Reviewed: 2026-10-08
- Source of Truth: package scripts, Python project files, CI workflow, contribution policy
- Update Triggers: test commands, workflow coverage, runtime pins, browser verification, PR policy, Dependabot policy, engineering skill tracker and domain layout, optional account-summary and Inventory scale fixtures, integration file serialization and graceful HTTP child shutdown, recorded Category Catalog fixture isolation and range fixtures, SavedState two-process HTTP and Python socket prerequisites, Scan actual-worker tests and replay fixtures, private value observation/calendar/API and invalidation checks
- Related Docs: [Operations](./README.md), [Product acceptance](../product/specification.md#interface-acceptance), [Frontend](../architecture/frontend.md), [Deployment](./deployment.md), [Contributing](../../CONTRIBUTING.md), [Docs maintenance](../README.md#maintenance), [Application boundaries](../architecture/application-contract.md#implementation-status)

This document owns repository check commands, CI coverage, and verification evidence. Product and integration documents own behavior and acceptance criteria. Run checks appropriate to the changed behavior; do not treat a passing command as proof of requirements it does not exercise.

## Local checks

Use the Node version in [`frontend/.node-version`](../../frontend/.node-version) and the package manager in [root package.json](../../package.json). Root [workspace policies](../../pnpm-workspace.yaml) and [pnpm-lock.yaml](../../pnpm-lock.yaml) own the frozen install across frontend/backend/contracts. Commands run from `frontend/` resolve this same root workspace. Before building for browser review, set `APP_ORIGIN` to the origin the browser will use. [Deployment configuration](./deployment.md#configuration) owns the build-time origin and rebuild procedure. From `frontend/`, run:

Lint, builds and Vitest regenerate SvelteKit files, including environment configuration. Run them in an isolated worktree or stop that checkout's dev server first. Restart the shared preview with `./dev.sh` from the repository root after the checks, so test configuration cannot enter the running app through HMR.

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm test:unit
pnpm build
pnpm db:check
```

`lint` includes the root TypeScript import-boundary checker and forbidden-import tests, Prettier, SvelteKit synchronization, the TypeScript 7 check, and Svelte checking. `build` also checks built client output for backend/persistence leakage. Running those nested checks again adds no coverage unless isolating a failure. `db:check` checks Drizzle migration consistency; it does not apply migrations or exercise transactions.

For frontend integration tests, set `DATABASE_URL` and `TEST_DATABASE_URL` to the same disposable PostgreSQL 18 database, then run from `frontend/`:

```sh
pnpm db:migrate
pnpm test:integration
APP_ORIGIN=http://127.0.0.1:5191 pnpm build
pnpm test:http
```

The HTTP suite starts the built Node application and verifies public Catalog DTOs and browser/API Auth/Profile/Dashboard journeys against the same disposable database. The default origin is `http://127.0.0.1:5191`; when setting `TEST_HTTP_PORT`, rebuild with matching `APP_ORIGIN`. The suite rejects a configured origin/port mismatch and an occupied port before publishing fixtures. It requires listening confirmation from its own child process before sending requests. The suite also fails without matching `DATABASE_URL` and `TEST_DATABASE_URL`. It temporarily publishes a catalog fixture, so do not run it against a shared database or concurrent catalog publisher.

The integration project in [vite.config.ts](../../frontend/vite.config.ts) uses `fileParallelism: false` because its files publish one shared Catalog generation in the disposable database. Explicit concurrent transactions within a test still run through `Promise.all`. [Category preview tests](../../frontend/tests/integration/category-previews.integration.test.ts) and [Library HTTP tests](../../frontend/tests/category-library-http.test.ts) publish their own 1000-printing subset from the tracked versioned public Catalog bundle through the [fixture owner](../../frontend/tests/fixtures/category-catalog.ts). The native bundle verifier checks the complete compressed and decoded payload digests and manifest counts before publication. Selected printings retain recorded English documents, raw identities and known type facts, including genuine Artifact and Creature printings. Preview tests retain their complete 150-entry and 1000-entry/500-definition assertions and run independently of a preseeded Catalog on freshly migrated PostgreSQL. Cleanup restores the full previous Catalog state after owned-account cleanup and deletes only the fixture generation. The bundle date identifies recorded fixture content, not verified upstream freshness. Deck range fixtures use genuine Catalog printings and valid signed 32-bit per-entry quantities; the beyond-safe canonical aggregation boundary is covered by [unit cases](../../frontend/tests/unit/deck-availability.test.ts), without an invalid PostgreSQL quantity fixture.

For SavedState transport verification, use the same migrated disposable database and origin/port rules, then run `pnpm test:sync` from `frontend/`. [saved-state-http.test.ts](../../frontend/tests/saved-state-http.test.ts) builds two origin-matched production artifacts, copies them under ignored `.local/saved-state-http/` and runs two application processes. The primary uses `TEST_HTTP_PORT` or default 5191; the replica uses the next port. Set `APP_ORIGIN` to the primary origin and keep both ports free. Runtime guards require each owned child's listening confirmation before fixtures.

HTTP test cleanup sends SIGTERM only to its owned application child. Cleanup allows fifteen seconds for natural exit, including the PostgreSQL pool's default ten-second idle drain. If the child has not exited by then, cleanup fails and leaves it running without force termination.

The test requires the existing Node/pnpm toolchain, `python3` and the Linux `ss` socket-inspection tool on PATH. The [paused socket fixture](../../frontend/tests/fixtures/paused-sse-client.py) uses only Python 3 standard-library `socket`, `json` and `sys`; no Python packages or worker environment are required. It exercises real TCP backpressure. Tests cover commit/rollback, account isolation, recovery, revocation, slow consumers and controlled proxy streaming. They do not establish rendered Profile behavior or the deployed proxy/tunnel. Record current-head results separately from owner browser and deployment acceptance.

The database role needs schema and extension creation privileges. Integration cases write fixtures and remove test data or schemas. Without `TEST_DATABASE_URL`, database suites skip; a successful process with skipped suites is not a database verification result.

For optional account-summary scale checks, set `TEST_SCALE_CATALOG_PATH` to an existing transformed public-catalog JSONL file to enable the large-account cases in [account-profile.integration.test.ts](../../frontend/tests/integration/account-profile.integration.test.ts) and [http-application.test.ts](../../frontend/tests/http-application.test.ts). The [fixture helper](../../frontend/tests/fixtures/account-scale.ts) requires exactly 10,000 actual printing records. Each line has `document` matching the Catalog card contract and `supportedInventoryFinishes` containing a supported finish for that printing. Use distinct valid printing IDs and real canonical identities; retain source generation and fixture provenance with the evidence.

The helper creates 50,000 distinct entries by assigning each printing its first supported finish and each of the five allowed conditions, with quantity one. It writes only disposable fixture accounts. The Dashboard HTTP case makes its eight recent entries deterministic with the longest stored names. Its UTF-8 response budgets retain the legacy account summary below 30,000 bytes, separately require successful 30-day Value/history data within 3500 bytes, and cap the combined response at 33,500 bytes. These separate budgets account for the approved Value DTO extension without relaxing the original summary bound. After the usual isolated database migration/build, run:

```sh
TEST_SCALE_CATALOG_PATH=/absolute/path/to/public-catalog.jsonl pnpm test:integration
TEST_SCALE_CATALOG_PATH=/absolute/path/to/public-catalog.jsonl pnpm test:http
```

Use the same source fixture for both runs. Those cases verify aggregate identities, account isolation, bounded recent entries and Dashboard response size. They do not establish virtualized Inventory loading or general latency targets. Without the variable, optional scale cases skip; normal CI requires no local catalog file. Record skipped scale coverage explicitly.

The opt-in [Inventory scale script](../../backend/scripts/inventory-scale.ts) is a local disposable evidence harness, not a normal CI prerequisite. Its source declares the isolated database name, public JSONL/manifest path and fixture checks. Provision that exact isolated database, apply current migrations, and supply matching `TEST_DATABASE_URL` and `DATABASE_URL` through the existing protected environment. From the repository root run `node backend/scripts/inventory-scale.ts`; `--analyze` captures analyzed plans and `--measure-only --final` remeasures existing fixture accounts. The script creates accounts with 1,000, 10,000 and 50,000 entries and writes machine/source/implementation hashes, plans and raw timings under ignored `.local/inventory-evidence/`. Keep its protected credential file local. These query measurements require separate final-head HTTP and rendered scrolling/focus acceptance; they are not a deployment or scalability claim.

For each changed Python package, run the following from `worker/` or `scan-worker/`. The [CI workflow](../../.github/workflows/ci.yml) owns the pinned Python and uv versions.

```sh
uv python install 3.14.8
uv lock --check --python 3.14.8
uv sync --frozen --extra dev --python 3.14.8
uv run --no-sync ruff check
uv run --no-sync ruff format --check
uv run --no-sync pytest
```

Set `WORKER_TEST_DATABASE_URL` to a disposable PostgreSQL 18 database when checking catalog publication. Those cases create isolated schemas and skip without the variable. The scan-worker tests do not require PostgreSQL. A frozen install preserves locked packages; the separate lock check detects a manifest that no longer matches its lockfile.

For Markdown changes, install frontend dependencies and run from the repository root:

```sh
frontend/node_modules/.bin/prettier --check README.md GLOSSARY.md AGENTS.md CONTRIBUTING.md docs
```

Follow [documentation maintenance](../README.md#maintenance) for links, ownership, metadata, and stale claims. Documentation-only changes do not need application tests unless they also change executable behavior.

## CI coverage

[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) runs on pull requests and pushes to `main`. Its jobs use the root package-manager pin and cache lockfile, then run the application commands above with frozen workspace installs. The frontend integration job starts the actual locked Python Scan scaffold, then builds and runs `test:http`, `test:scan` and `test:sync` after migration and repository integration tests. For isolated worktrees, set the existing `TEST_SCAN_DATABASE_NAME` to the assigned disposable database and `SCAN_WORKER_URL` to the assigned real loopback worker before PG/HTTP Scan checks. The suite verifies that explicit loopback port and actual worker health without a fixed local port. `test:scan` uses the actual built application, PostgreSQL and configured local storage; [Mobile and Scan](../architecture/mobile-and-scan.md#scan-uploads) owns its evidence limits. Frontend and catalog-worker integration jobs provision separate PostgreSQL services. The workflow is the source of truth for job names, environment variables, and tool versions.

CI does not run the root Markdown command, browser workflows, container builds, image publication, or deployment. These remain explicit checks when relevant. [Deployment](./deployment.md) owns container startup and operator verification; [database upgrades](./postgres-upgrade.md) owns restore rehearsal and rollback checks.

## Browser verification and evidence

For UI changes, exercise the affected workflows against the [interface acceptance criteria](../product/specification.md#interface-acceptance). Use representative account data, narrow and desktop viewports, keyboard input, and error states. Component tests and production builds do not establish correct focus, touch interaction, contrast, or composed page behavior. Asset changes also follow the specific [brand verification rules](../reference/website-icons.md).

Record the commands run, results, skipped coverage, and remaining limits with the change. Keep test counts and screenshots in the change record, rather than repeating transient results across canonical docs. Distinguish automated checks from browser observations and requirements that remain untested. Follow [contribution disclosure](../../CONTRIBUTING.md#pull-request-expectations) when preparing the PR.

## Dependabot

[`.github/dependabot.yml`](../../.github/dependabot.yml) opens dependency updates for GitHub Actions, root-workspace npm packages, and both Python workers. These pull requests require passing CI and manual review and merge. No repository workflow auto-merges them.

## Engineering skill configuration

### Issue tracker

GitHub Issues in `KyleDerZweite/spellbook` are the repository's issue tracker. Use `gh` from this clone. When a skill says to publish to the issue tracker, create a GitHub issue. When it says to fetch a ticket, read its body, labels, comments, and linked work with `gh issue view`.

Read the [issue label policy](../ISSUE_LABELS.md) before triage. Keep multi-line issue bodies in a temporary file and pass `--body-file`. A tracker operation needs authorization from the current request or invoked workflow. This configuration does not authorize unsolicited issues, comments, priority changes, merges, or releases.

PRs as a request surface: no.

### Domain docs

Spellbook uses one domain context. Start with [the docs index](../README.md), then read the root [glossary](../../GLOSSARY.md) and relevant [decision records](../decisions/README.md) before domain exploration. Use the glossary's canonical terms. Keep definitions in the glossary and behavior in its existing product or architecture owner.

ADRs live in `docs/decisions/`; preserve their numbering, filenames, template, and supersession rules. Check the status of a decision before applying it. Surface a conflict with an accepted decision and resolve it with the maintainer before changing its contract. A proposal or superseded decision does not describe implemented behavior.

Skills that default to `docs/agents/` or `docs/adr/` must use these existing owners. Edit this configuration and the label mapping directly when they change; rerun setup only to change the tracker or reconsider the layout.

Workspace sync unit checks exercise the public transport/lease seam, including hidden resume, terminal activation, deferred publication, counted writes and coalesced probes. InventoryWindow held actual HTTP responses verify physical admission under ordinary invalidation. `test:sync` also drives the production workspace lease module against two built processes and PostgreSQL for Inventory/Deck/Profile totals and actual-worker Scan result invalidation. Those checks establish HTTP/resource behavior, not browser draft/focus/anchor acceptance; record rendered and deployment evidence separately.

## Value history verification

[History integration tests](../../frontend/tests/integration/inventory-value-history.integration.test.ts), [value summaries](../../frontend/tests/integration/value-summary.integration.test.ts), [value events](../../frontend/tests/integration/inventory-value-events.integration.test.ts) and [value HTTP tests](../../frontend/tests/value-history-http.test.ts) own checkpoint, summary, notification and route evidence. Run these against the migrated disposable database using the existing integration/HTTP isolation rules. [Scale integration](../../frontend/tests/integration/inventory-value-scale.integration.test.ts) requires `TEST_VALUE_SCALE_ACCOUNT_ID` naming a disposable account already populated with 50,000 real Catalog holdings. It uses `TEST_DATABASE_URL`, changes that account's checkpoint fixtures and skips without both variables. Record Catalog/fixture provenance and absent coverage.

Record head, migration state and fixture provenance with results. Controlled-clock captures prove eligibility and consistency, not an actual scheduled midnight observation. Provider refresh, rendered presentation, owner acceptance and deployment remain separate evidence. [Valuation](../architecture/valuation.md#reviewed-personal-history-contract) lists relevant failure and lifecycle scenarios.
