# Repository verification and GitHub automation

- Status: Canonical
- Last Reviewed: 2026-10-19
- Source of Truth: package scripts, Python project files, CI workflow, contribution policy
- Update Triggers: independent API/web ownership and relocated code references, native initial Deck Search publication regression, conditional CI scope, manual-only heavy workflows and consolidated jobs, native Inventory measurement regression, portable opt-in browsing performance evidence and artifact provenance, PWA worker build harness and tsconfig, QR integration/HTTP and pending target acceptance, Dev launcher lifecycle tests, test commands, workflow coverage, runtime pins, browser verification, tool output and evidence handling, child-task context, PR policy, Dependabot policy, engineering skill tracker and domain layout, Wayfinder sub-issues and native dependencies, self-contained planning evidence, proposed runtime/evidence manifests and integration closeout, optional account-summary and Inventory scale fixtures, integration file serialization and graceful HTTP child shutdown, recorded Category Catalog fixture isolation and range fixtures, optional local Combo fixtures and source-fenced HTTP evidence, SavedState two-process HTTP and Python socket prerequisites, Scan actual-worker tests and replay fixtures, private value observation/calendar/API and invalidation checks, application/transport lifecycle and native operator persistence checks
- Related Docs: [Operations](./README.md), [Product acceptance](../product/specification.md#interface-acceptance), [Frontend](../architecture/frontend.md), [Deployment](./deployment.md), [Contributing](../../CONTRIBUTING.md), [Docs maintenance](../README.md#maintenance), [Application boundaries](../architecture/application-contract.md#implementation-status)

This document owns repository check commands, CI coverage, and verification evidence.
Product and integration documents own behavior and acceptance criteria.
Run checks appropriate to the changed behavior; do not treat a passing command as proof of requirements it does not exercise.

## Local checks

Use the Node version in [`frontend/.node-version`](../../frontend/.node-version) and the package manager in [root package.json](../../package.json).
Root [workspace policies](../../pnpm-workspace.yaml) and [pnpm-lock.yaml](../../pnpm-lock.yaml) own the frozen install across frontend/backend/contracts.
Commands run from `frontend/` resolve this same root workspace.
Before building for browser review, set `APP_ORIGIN` to the origin the browser will use.
[Deployment configuration](./deployment.md#configuration) owns the build-time origin and rebuild procedure.
From `frontend/`, run:

Lint, builds and Vitest regenerate SvelteKit files, including environment configuration.
Run them in an isolated worktree or stop that checkout's dev server first.
Restart the shared preview with `./dev.sh` from the repository root after the checks, so test configuration cannot enter the running app through HMR.

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm test:unit
pnpm --dir ../backend test
pnpm --dir .. test:tooling
pnpm --dir .. build
pnpm --dir ../backend db:check
```

`pnpm --dir .. test:tooling` runs boundary, CI routing/workflow ownership, root launcher and packaging regression tests.
Frontend `pnpm test:dev` imports the root launcher suite, so running it or standalone packaging tests again adds no coverage.
Automatic CI runs the tooling aggregate alongside frontend lint and unit tests.
These fixtures verify process ownership and cleanup paths; actual Podman and PostgreSQL startup require separate local integration evidence.

`lint` includes the root TypeScript import-boundary checker and forbidden-import tests, Prettier, independent backend type checking, SvelteKit synchronization, the TypeScript 7 check and Svelte checking.
`check:ts` includes the separate [service-worker TypeScript configuration](../../frontend/src/service-worker/tsconfig.json).
Root `build` builds API and web independently.
Frontend `build` also checks built client output for backend/persistence leakage and runs `node --test tests/pwa-worker.test.ts` after producing the worker output.
Running those nested checks again adds no coverage unless isolating a failure.
Backend `db:check` checks Drizzle migration consistency; frontend database scripts forward there.
It does not apply migrations or exercise transactions.

For frontend integration tests, set `DATABASE_URL` and `TEST_DATABASE_URL` to the same disposable PostgreSQL 18 database, then run from `frontend/`:

```sh
pnpm --dir ../backend db:migrate
pnpm test:integration
APP_ORIGIN=http://127.0.0.1:5191 pnpm --dir .. build
pnpm test:http
```

The [HTTP runtime fixture](../../frontend/tests/http-runtime.ts) starts the built Node API and web application separately and verifies public Catalog DTOs and browser/API Auth/Profile/Dashboard journeys against the same disposable database.
The default origin is `http://127.0.0.1:5191`; when setting `TEST_HTTP_PORT`, rebuild web with matching `APP_ORIGIN`.
`TEST_API_PORT` defaults to 5193 and must be a different free loopback port.
API public Origin matches web, while `API_INTERNAL_URL` points to the owned API child.
Web receives no database or storage secrets.
The suite rejects a configured origin/port mismatch and an occupied port before publishing fixtures.
It requires listening confirmation from both owned child processes before sending requests.
Direct API and same-origin proxy parity are separate acceptance scenarios.
The suite also fails without matching `DATABASE_URL` and `TEST_DATABASE_URL`.
It temporarily publishes a catalog fixture, so do not run it against a shared database or concurrent catalog publisher.

`test:http` also runs the [proxy upload regression](../../frontend/tests/remote-proxy-upload-http.test.mjs) through the backend test-only TypeScript loader.
It uses the actual production web handler and backend Node bridge/parser on owned ephemeral loopback ports, without a database.
The default 512 KiB web cap verifies source-limit 413 propagation; repeat with `TEST_PROXY_WEB_BODY_LIMIT=12M` for the normal configured allowance.
Known-length and chunked uploads, early replies, raw credentials, separate cookies, SSE cancellation and upload aborts are separate assertions.
This parser/transport fixture does not replace the real PostgreSQL application suites.

The integration project in [vite.config.ts](../../frontend/vite.config.ts) uses `fileParallelism: false` because its files publish one shared Catalog generation in the disposable database.
Explicit concurrent transactions within a test still run through `Promise.all`.
[Category preview tests](../../frontend/tests/integration/category-previews.integration.test.ts) and [Library HTTP tests](../../frontend/tests/category-library-http.test.ts) publish their own 1000-printing subset from the tracked versioned public Catalog bundle through the [fixture owner](../../frontend/tests/fixtures/category-catalog.ts).
The native bundle verifier checks the complete compressed and decoded payload digests and manifest counts before publication.
Selected printings retain recorded English documents, raw identities and known type facts, including genuine Artifact and Creature printings.
Preview tests retain their complete 150-entry and 1000-entry/500-definition assertions and run independently of a preseeded Catalog on freshly migrated PostgreSQL.
Cleanup restores the full previous Catalog state after owned-account cleanup and deletes only the fixture generation.
The bundle date identifies recorded fixture content, not verified upstream freshness.
Deck range fixtures use genuine Catalog printings and valid signed 32-bit per-entry quantities; the beyond-safe canonical aggregation boundary is covered by [unit cases](../../frontend/tests/unit/deck-availability.test.ts), without an invalid PostgreSQL quantity fixture.

For SavedState transport verification, use the same migrated disposable database and origin/port rules, then run `pnpm test:sync` from `frontend/`.
[saved-state-http.test.ts](../../frontend/tests/saved-state-http.test.ts) builds two origin-matched production artifacts, copies them under ignored `.local/saved-state-http/` and runs two web/API pairs.
Its build subprocess uses the already selected `pnpm` on PATH, without requiring a local Node version manager on CI runners.
The primary web uses `TEST_HTTP_PORT` or default 5191; replica web uses the next port.
API uses `TEST_API_PORT` or default 5193 and its next port.
Set `APP_ORIGIN` to the primary origin and keep all four ports free and distinct.
Runtime guards require each owned child's listening confirmation before fixtures.

HTTP test cleanup sends SIGTERM only to its owned API and web children, closing API streams first.
Cleanup allows fifteen seconds for natural exit, including the PostgreSQL pool's default ten-second idle drain.
If the child has not exited by then, cleanup fails and leaves it running without force termination.

The test requires the existing Node/pnpm toolchain, `python3` and the Linux `ss` socket-inspection tool on PATH.
The [paused socket fixture](../../frontend/tests/fixtures/paused-sse-client.py) uses only Python 3 standard-library `socket`, `json` and `sys`; no Python packages or worker environment are required.
It exercises real TCP backpressure.
Tests cover commit/rollback, account isolation, recovery, revocation, slow consumers and controlled proxy streaming.
They do not establish rendered Profile behavior or the deployed proxy/tunnel.
Record current-head results separately from owner browser and deployment acceptance.

The database role needs schema and extension creation privileges.
Integration cases write fixtures and remove test data or schemas.
Without `TEST_DATABASE_URL`, database suites skip; a successful process with skipped suites is not a database verification result.

For optional account-summary scale checks, set `TEST_SCALE_CATALOG_PATH` to an existing transformed public-catalog JSONL file to enable the large-account cases in [account-profile.integration.test.ts](../../frontend/tests/integration/account-profile.integration.test.ts) and [http-application.test.ts](../../frontend/tests/http-application.test.ts).
The [fixture helper](../../frontend/tests/fixtures/account-scale.ts) requires exactly 10,000 actual printing records.
Each line has `document` matching the Catalog card contract and `supportedInventoryFinishes` containing a supported finish for that printing.
Use distinct valid printing IDs and real canonical identities; retain source generation and fixture provenance with the evidence.

The helper creates 50,000 distinct entries by assigning each printing its first supported finish and each of the five allowed conditions, with quantity one.
It writes only disposable fixture accounts.
The Dashboard HTTP case makes its eight recent entries deterministic with the longest stored names.
Its UTF-8 response budgets retain the legacy account summary below 30,000 bytes, separately require successful 30-day Value/history data within 3500 bytes, and cap the combined response at 33,500 bytes.
These separate budgets account for the approved Value DTO extension without relaxing the original summary bound.
After the usual isolated database migration/build, run:

```sh
TEST_SCALE_CATALOG_PATH=/absolute/path/to/public-catalog.jsonl pnpm test:integration
TEST_SCALE_CATALOG_PATH=/absolute/path/to/public-catalog.jsonl pnpm test:http
```

Use the same source fixture for both runs.
Those cases verify aggregate identities, account isolation, bounded recent entries and Dashboard response size.
They do not establish virtualized Inventory loading or general latency targets.
Without the variable, optional scale cases skip; normal CI requires no local catalog file.
Record skipped scale coverage explicitly.

The opt-in [Inventory scale script](../../backend/scripts/inventory-scale.ts) is a local disposable evidence harness, not a normal CI prerequisite.
Its source declares the isolated database name, public JSONL/manifest path and fixture checks.
Provision that exact isolated database, apply current migrations, and supply matching `TEST_DATABASE_URL` and `DATABASE_URL` through the existing protected environment.
From the repository root run `node backend/scripts/inventory-scale.ts`; `--analyze` captures analyzed plans and `--measure-only --final` remeasures existing fixture accounts.
The script creates accounts with 1,000, 10,000 and 50,000 entries and writes machine/source/implementation hashes, plans and raw timings under ignored `.local/inventory-evidence/`.
Keep its protected credential file local.
These query measurements require separate final-head HTTP and rendered scrolling/focus acceptance; they are not a deployment or scalability claim.

For each changed Python package, run the following from `worker/` or `scan-worker/`.
The [CI workflow](../../.github/workflows/ci.yml) owns the pinned Python and uv versions.

```sh
uv python install 3.14.8
uv lock --check --python 3.14.8
uv sync --frozen --extra dev --python 3.14.8
uv run --no-sync ruff check
uv run --no-sync ruff format --check
uv run --no-sync pytest
```

Set `WORKER_TEST_DATABASE_URL` to a disposable PostgreSQL 18 database when checking catalog publication.
Those cases create isolated schemas and skip without the variable.
The scan-worker tests do not require PostgreSQL.
A frozen install preserves locked packages; the separate lock check detects a manifest that no longer matches its lockfile.

For Markdown changes, install frontend dependencies and run from the repository root:

```sh
frontend/node_modules/.bin/prettier --check README.md GLOSSARY.md AGENTS.md CONTRIBUTING.md docs
```

Follow [documentation maintenance](../README.md#maintenance) for links, ownership, metadata, and stale claims.
Documentation-only changes do not need application tests unless they also change executable behavior.

### Portable browsing performance evidence

The independently reviewed follow-up to [PR 231](https://github.com/KyleDerZweite/spellbook/pull/231) adds opt-in `test:performance` in an isolated Vitest `performance` project.
Normal unit/integration commands do not select it.
An additional explicit environment guard prevents fixture access when all projects are selected accidentally.
The project uses the existing Vitest transform to execute actual InventoryWindow and CatalogWindow production classes, and the existing HTTP runtime owner to start built application children.
No copied window algorithm, new compiler or dependency is selected.
The [fixture owner](../../frontend/tests/fixtures/browsing-performance.ts) and [runner](../../frontend/tests/browsing-performance.test.ts) own this procedure.

Require matching `DATABASE_URL`/`TEST_DATABASE_URL`, explicit disposable database-name confirmation, matching origin/port and an unoccupied port before fixture writes.
Require the owned child's listening confirmation.
The fixture consumes and verifies the complete tracked English Catalog bundle, including compressed/decoded hashes and manifest counts.
It publishes only its own generation under the existing advisory lock.
Cleanup restores the full previous Catalog state and deletes only owned accounts/generation.
A foreign publication blocks restoration rather than being overwritten.
Do not use a shared database or concurrent Catalog publisher.

The existing account-scale fixture gains a records entry point while retaining its path interface and 10000-real-printing requirement.
Deterministic supported finishes and five valid Conditions produce distinct Inventory entries for accounts of 1000, 10000 and 50000 entries.
Include repeated Canonical cards, overlapping/empty Groups, selective filters and analyzed fixture tables.
Never change existing Demo accounts.
Separate protected credentials from normal reports, and make retained fixtures and their owned cleanup explicit.

Measure first, deep and final 200-result Inventory ranges and Search against the same generation.
Deep addresses must not load earlier prefix ranges.
Preserve API defaults and maximum 500.
Assert DTO shape, counts, identity, revision/generation coherence and bounded read/receipt content; report actual UTF-8 payload sizes.
Retain existing limits of three physical requests including unsettled aborts, four contexts, 1000 resident records, twenty pages, 200 mounted rows and eight active DTO snapshots.
Existing byte targets retain their documented overflow rules.
Do not invent a response-byte cap or hardware-independent latency gate.

Reports distinguish runner Head from the tested build's Head/digests and dirty state.
Include fixture hashes/date/counts, generation, machine, Node/PostgreSQL/migrations, parameters, UTC time, raw latencies and directly observable decode/update timings.
Mark SQL or other unobserved segments unmeasured.
Client-cold means empty client caches; it does not establish PostgreSQL buffer-cold.
Identical fixtures, parameters, machine and origin are required for before/after claims.

Rendered acceptance uses the native browser, fixture manifest and production metrics for continuous loading, deep entry, revisit, Load earlier, Back/Forward, context changes, remote invalidation and anchor restoration.
Exercise affected Inventory Group labels and Deck drafts at desktop/narrow sizes, with keyboard, light/dark and native fallbacks.
Node-only results cannot establish DOM bounds.
Record unavailable physical touch/zoom separately.
This recorded-English fixture does not satisfy the separate current-full-Catalog gate in [ADR-0021](../decisions/0021-hybrid-browsing-and-contextual-card-dialog.md).
Keep the historical full-Catalog suite and existing mutation/SQL-scale evidence unchanged.

Build from a known revision with the intended `APP_ORIGIN`, and write that exact full commit SHA to a separate build-stamp file.
Keep its build log and source cleanliness evidence.
The stamp attributes source; the runner independently hashes the executed artifact tree and cannot infer source dirtiness from a commit-only stamp.
With the protected database environment already loaded, run from the repository root:

```sh
TEST_BROWSING_PERFORMANCE=1 \
TEST_PERFORMANCE_DISPOSABLE_DB=spellbook_perf_disposable \
TEST_HTTP_PORT=5191 APP_ORIGIN=http://127.0.0.1:5191 \
TEST_PERFORMANCE_BUILD_STAMP=/absolute/path/to/artifact-head.txt \
TEST_PERFORMANCE_OUTPUT=.local/browsing-performance/my-run \
fnm exec --using 26.10.0 pnpm --dir frontend test:performance
```

Replace the database confirmation with the exact disposable target name.
Use a new output directory for every run.
`TEST_PERFORMANCE_ENTRYPOINT` defaults to frontend `build/index.js` and accepts an absolute saved-artifact entrypoint for comparison runs.
`TEST_PERFORMANCE_REPETITIONS` defaults to three and permits 1 through 20.
The runtime fixture also starts `backend/dist/main.js` using `TEST_API_PORT` or default 5193.
A saved web `TEST_PERFORMANCE_ENTRYPOINT` does not select a matching API artifact; record its source revision and artifact digest separately.
Existing reports that hash only web output do not establish API artifact provenance.
Without `TEST_BROWSING_PERFORMANCE=1`, the suite skips before fixtures.

Set `TEST_PERFORMANCE_KEEP_FIXTURES=1` to retain data for browser work.
The runner still stops its owned API and web children.
The output contains `report.json`, `manifest.json` and a mode-0600 `credentials.json`.
Start the same tested web artifact and separately attributed API artifact at the manifest origin/private API target, sign in using the protected local credentials and exercise each account's first/deep/end `browser[].inventoryURLs` plus `searchURLs`.
Observe the existing Inventory/Catalog metric attributes and actual mounted rows while scrolling, revisiting and changing contexts.
Record focus, drafts and errors separately from Node metrics.
Stop both owned browser-review processes before running the manifest's `cleanupCommand` with the original protected database environment.
Cleanup removes the credentials file after success.
Inspect a failed cleanup manifest before any recovery; never replace foreign Catalog state.

## PWA and QR verification

Use the existing isolated-worktree, disposable PostgreSQL and origin-matched build procedure above.
From `frontend/`, run:

```sh
pnpm check
pnpm test:unit
pnpm --dir ../backend db:migrate
pnpm test:integration
APP_ORIGIN=http://127.0.0.1:5191 pnpm --dir .. build
pnpm test:http
```

`check:ts`, reached through `pnpm check`, also checks the separate service-worker tsconfig.
`test:unit` covers QR input parsing and PWA cache/state helpers.
The built [worker harness](../../frontend/tests/pwa-worker.test.ts) requires build output, so `build` runs `node --test tests/pwa-worker.test.ts` after compilation; it does not belong to `test:unit`.
The harness executes worker behavior with controlled platform doubles, without a server or database.
It verifies the cache allowlist, private/auth/API exclusions, network-error fallback and explicit update activation; it is not browser installation evidence.

[QR integration tests](../../frontend/tests/integration/qr-auth.integration.test.ts) exercise backend QR transactions with real PostgreSQL.
[Backend HTTP tests](../../backend/tests/http-core.test.ts) cover framework-independent transport behavior; built HTTP coverage remains separate.
The [QR HTTP suite](../../frontend/tests/qr-auth-http.test.ts) runs through `test:http` against the actual built application.
Cover browser cookies and device bearer issuance, explicit decisions, wrong credentials, expiry after lock waits, same-session repeated approval including after consumption, conflicting decisions/approvers, revocation and concurrent one-use redemption.
Failed or skipped cases do not establish those guarantees.
The command wiring is part of the accepted PWA integration; final current-head results remain the implementation owner's evidence.

Rendered desktop and narrow journeys must cover password fallback, QR pending/expiry/denial/retry, sign-in return to approval, manual input and foreign-instance rejection, camera denial/unavailability and stream cleanup.
Verify installation from `/app`, standalone/narrow-only App, Search, Inventory, Decks and Connect bottom navigation, offline navigation without cached private data, and a waiting update that reloads only on explicit action.
Check draft retention before reload and no unsolicited reload when another window activates an update.
Use deployed same-origin HTTPS for physical phone camera/install acceptance.

Attempt Android Studio/emulator checks only with already installed tools.
If those tools are absent or the target check fails, record the limit without alternate tooling.
Physical Android acceptance belongs to the owner.
Record browser and emulator results with the change; those results do not establish physical Android acceptance.
Record the final head/base/diff, commands, skipped checks and target owner with the change, separately from deployment.

## Native Android verification

The [independent Android contract](../architecture/independent-applications.md#android-delivery) owns toolchain pins and native acceptance.
From the integrated `android/` Gradle project, the selected producer/CI command is:

```sh
./gradlew --no-daemon :app:lintDebug :app:testDebugUnitTest :app:assembleDebug
```

The integrated Android source passed this command in the parent checkout.
Build/JVM/lint evidence does not establish install, UI, real account journeys or cross-client SSE.
On 2026-10-19, the root-owned emulator attempt exited 139 before boot.
The maintainer requested no workaround, so installation, native guest Search and authenticated Inventory-add journeys, keyboard/Back and website-to-app refresh remain unexecuted.
Physical Honor, camera, hardware and production deployment acceptance are also absent.
The parent integration owner records final revision, commands and target evidence in [issue 244](https://github.com/KyleDerZweite/spellbook/issues/244).

The manually dispatched [Android Build workflow](../../.github/workflows/android.yml) uses [setup-android v4.0.4](https://github.com/android-actions/setup-android/tree/v4.0.4) to install command-line tools, put `sdkmanager` on PATH and provision platform 37.0 and build-tools 36.0.0 with JDK 21.
This explicit setup avoids relying on the runner image's SDK installation.
SDK license acceptance is authorized for this delivery; accepted license text is omitted from logs.

## Application and native operator checks

[Construction cases](../../frontend/tests/unit/application-construction.test.ts), [lifetime cases](../../frontend/tests/unit/application-lifetime.test.ts) and [transport import cases](../../frontend/tests/unit/transport-lifetime.test.ts) run through `pnpm test:unit`.
They cover configuration validation before acquisition, cleanup after construction failure, build analysis, idempotent start/close, close before start, restart rejection and pool closure after cleanup failure.
Transport imports require no database configuration and start no resources.
The [boundary tests](../../scripts/check-boundaries.test.mjs) reject frontend persistence/internal imports and runtime access to operator wrappers.
Real API development restart, production shutdown and two-replica HTTP behavior require separate runtime checks.
Web owns no backend lifecycle hooks.

Integration tests consume the [test-only backend database fixture](../../frontend/tests/fixtures/database.ts) and backend schema directly.
Native operator checks run from `backend/` with the pinned Node toolchain:

```sh
node --test scripts/demo/operators.test.mjs scripts/demo/precon.test.mjs
node --test scripts/demo/operators.integration.test.mjs scripts/demo/precon.integration.test.mjs
```

Set `TEST_DATABASE_URL` for the second command to an empty migrated disposable database ending in `_demo` or `_design`.
Without it, native database coverage skips.
These cases cover guarded Demo preservation/replacement, transactional rollback, password recovery and session revocation.
The disposable target is a verification requirement, not a production restriction on the password recovery command.
Check results at the aggregate head; existing fixture/provider tests do not establish normal-database refresh, rendered acceptance or deployment.

## CI coverage

[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) runs on pull requests, pushes to `main` and manual dispatch.
It has three jobs.
The short `CI Scope` job runs the native [routing/workflow ownership tests](../../scripts/ci-changes.test.mjs) and [change classifier](../../scripts/ci-changes.mjs), without installing application dependencies.
The two substantive jobs depend on successful classification and can run in parallel:

| Job                | Checks                                                                                                                         | Automatic scope                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Application Checks | Web/backend types and boundaries through `lint`, web unit tests, root `test:tooling`, backend unit/native tests and `db:check` | App/shared source and Scan worker changes                               |
| Python Workers     | Lock consistency, Ruff lint/format and pytest for each affected Python project                                                 | Catalog worker, Scan worker, or migrations used by Catalog worker tests |

Migration consistency runs in Application Checks using the existing frozen workspace install.
Root `test:tooling` includes launcher and packaging tests, so CI does not invoke those suites separately.
Python projects share one job/toolchain setup, retaining separate project environments; its PostgreSQL service starts only when Catalog worker tests are selected.
The scope job has a five-minute timeout; Application Checks and Python Workers each have fifteen minutes.

[Application Integration](../../.github/workflows/application-integration.yml) and [Android Build](../../.github/workflows/android.yml) are separate workflows triggered only by `workflow_dispatch`.
Neither has an automatic trigger or a `workflow_call` entry point, and automatic CI never invokes them.
Each manual workflow has one job with a thirty-minute timeout and no concurrency cancellation of another manual run.
Application Integration retains disposable PostgreSQL 18, the actual locked Scan worker, migrations, `test:integration`, the independent API/web build, `test:http`, `test:scan` and `test:sync`.
Android Build retains explicit SDK 37.0, build-tools 36.0.0, setup-android v4.0.4, JDK 21 and `:app:lintDebug :app:testDebugUnitTest :app:assembleDebug`.
GitHub requires the workflow file to exist on the default branch before manual dispatch is available.
Before integration into `main`, use the documented local checks.
Once available, dispatch the required workflow against the revision being verified, for example:

```sh
gh workflow run application-integration.yml --ref <branch-or-tag>
gh workflow run android.yml --ref <branch-or-tag>
```

Automatic CI trades full application builds and PostgreSQL/HTTP/Scan/SavedState integration plus Android verification for shorter feedback.
A green automatic run establishes only the selected lightweight checks.
It does not establish that either manual workflow passed, and moving a failing suite to manual dispatch does not resolve its failure.
Run the relevant manual or documented local checks before claiming their coverage, and record their revision, result and skipped cases separately.

PR scope uses the complete local Git merge-base diff between event base/head SHAs; main pushes use the pushed `base..head` diff.
Paths are NUL-delimited and rename detection is disabled so additions and deletions both count.
`frontend/`, `backend/`, shared `contracts/` and other `scripts/` select Application Checks.
Migration paths under `backend/drizzle/`, including the legacy frontend path, select Application Checks and Catalog worker tests.
`worker/` selects Catalog tests; `scan-worker/` selects Application Checks and Scan worker tests.
Android-only changes and known documentation alone select no substantive automatic job.
JS workspace/lockfile changes select Application Checks without forcing Python.
CI/workflow files, unknown paths, manual lightweight CI runs or unavailable comparisons select every automatic suite.
The classifier has no Android output because Android is always an explicit manual check.
The automatic workflow has no path filter and avoids GitHub's path-filter limits.
New pushes cancel obsolete runs of the same PR or main branch; manual CI dispatches use unique concurrency groups and remain independent.

If repository protection later requires status checks, include `CI Scope` alongside Application Checks and Python Workers.
A failed classifier skips dependent jobs, and [GitHub accepts skipped jobs as successful checks](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-jobs-with-conditions).
Requiring descendants alone does not establish successful classification.
This workflow change does not alter repository protection settings.

For isolated worktrees, set the existing `TEST_SCAN_DATABASE_NAME` to the assigned disposable database and `SCAN_WORKER_URL` to the assigned real loopback worker before PG/HTTP Scan checks.
The suite verifies that explicit loopback port and actual worker health without a fixed local port.
`test:scan` uses the actual built application, PostgreSQL and configured local storage; [Mobile and Scan](../architecture/mobile-and-scan.md#scan-uploads) owns its evidence limits.
The workflows are the source of truth for job names, environment variables and tool versions.

Automatic CI does not run the root Markdown command.
Backend `test` includes standalone native/operator suites under `backend/scripts/`; database-dependent operator cases skip without their explicitly guarded disposable target.
The manual application workflow's database name does not satisfy the `_demo`/`_design` guard, so those transaction checks require separate local evidence.
Android Build assembles/tests/lints; it does not boot an emulator or establish installation/native journeys.
Browser workflows, container builds, image publication and deployment also remain explicit checks when relevant.
[Deployment](./deployment.md) owns container startup and operator verification; [database upgrades](./postgres-upgrade.md) owns restore rehearsal and rollback checks.

## Proposed workflow improvements

The [Wayfinder map](https://github.com/KyleDerZweite/spellbook/issues/194) tracks unresolved recommendations for protected runtime ownership and graceful recovery, CI wiring for existing operator/Markdown checks, one acceptance evidence manifest per integration and verified worktree closeout.
Concise Agent instructions and targeted tool output were selected for [PR 220](https://github.com/KyleDerZweite/spellbook/pull/220); the rules below own evidence handling.
No common manifest, stop helper, CI change or automatic cleanup is selected by this planning record.
Existing process-safety constraints apply now.
Worktree closeout requires the runtime-ownership and evidence contracts to be settled; unfinished and user-owned work remains preserved.
The CI proposal initially reuses existing tests rather than adding new cases.

## Tool output and evidence

Request the fields and scope needed for the current question.
For browser work, use focused snapshots and their locators; capture a wider view when layout or missing context requires it.
For CI, inspect check names, status and run URLs first, then failed jobs and relevant log excerpts.
Read additional context until the failure is understood.

When a tool returns both structured data and serialized text, inspect one representation.
Summarize findings instead of printing both or repeating full payloads.
Retain necessary full logs in the existing evidence location, keep credentials and private payloads protected, and record the command or artifact URL plus the relevant commit, base and working diff.
Short output does not replace required checks or establish skipped acceptance evidence.

Give child tasks the accepted outcome, responsibilities, interfaces, dependencies, unresolved objections and exact workspace/revision.
Link required canonical owners and request concise findings with evidence references instead of repeating the full parent context.

## Browser verification and evidence

For UI changes, exercise the affected workflows against the [interface acceptance criteria](../product/specification.md#interface-acceptance).
Use representative account data, narrow and desktop viewports, keyboard input, and error states.
Component tests and production builds do not establish correct focus, touch interaction, contrast, or composed page behavior.
Asset changes also follow the specific [brand verification rules](../reference/website-icons.md).

For Inventory measurement regression, evaluate the contents of [inventory-measurement.browser.js](../../frontend/tests/fixtures/inventory-measurement.browser.js) in the native browser on the actual signed-in `/mtg/inventory` route with a nonempty disposable fixture.
Use the retained portable fixture procedure above for 50k evidence.
The expression scrolls seven times with 400-millisecond settling intervals, returns to the beginning and fails on Window errors, unhandled rejections or existing resource-bound violations.
It leaves the report at `window.__inventoryMeasurementResult`, including when its assertion fails, and removes its listeners.
Run it against attributed before/after production artifacts at wide and narrow widths.
This browser expression is separate from the unit suite; SSR and mocked observers cannot establish native ResizeObserver delivery behavior.
Evaluate [inventory-prepend.browser.js](../../frontend/tests/fixtures/inventory-prepend.browser.js) on a deep fixture range to assert the same visible entry position after Load earlier settles.
It waits for measured rows and the current enabled control, makes the control visible and prepares an anchor.
Click Load earlier through the native browser interaction tool; a capture listener records that same entry immediately before the application handles the actual click.
Then evaluate `await window.__inventoryPrependVerify()`.
The verification waits for the changed span and settled geometry, then leaves its prepared/click/after report at `window.__inventoryPrependResult`, comparing only the click and settled positions.
Repeating setup removes its previous capture listener.
Verify variable-height content, query replacement, navigation/disposal and focus separately.

For initial Deck Search publication, use the native browser with an owned disposable account, selected Deck and real nonfoil Catalog Printing matching a successful query.
Start on the authenticated Dashboard at Desktop width.
Set `window.__deckSearchStartupConfig` to `{ accountId, deckId, query, catalogCardId, canonicalCardId, allowInventoryWrite: true }`, then evaluate [deck-search-startup.browser.js](../../frontend/tests/fixtures/deck-search-startup.browser.js).
The account must match the active cookie session.
Click the primary Decks link through the native interaction tool; the fixture prepares its actual selected-Deck/search URL for client navigation.
`await window.__deckSearchStartup.verify('invalidate')` adds one copy through the real Inventory API, observes the actual Inventory SSE event, releases the held initial Search Response and asserts that it cannot end loading.
It then releases current work and waits for the actual fresh Owned count.
For the separate counted-write case, repeat setup from Dashboard, click Decks, evaluate `await window.__deckSearchStartup.ready()`, then activate the result's Add button through the native browser before `await window.__deckSearchStartup.verify('write')`.
This holds the genuine enhanced POST before transmission, after the route begins its write, and releases the initial Search while the write remains pending.
Completing cleanup sends that authorized test POST and adds one card to the disposable Deck.

The fixture preserves real response bodies and records results at `window.__deckSearchStartupResult`.
Both cases restore fetch, listeners and pending gates on completion/failure; repeated setup cleans the previous fixture.
Invoke `window.__deckSearchStartup.cleanup()` if an interactive run is abandoned.
Remove the owned disposable account after testing.
This is browser acceptance of the actual mount order, not coverage from the Node helper tests.

Record the commands run, results, skipped coverage, and remaining limits with the change.
Keep test counts and screenshots in the change record, rather than repeating transient results across canonical docs.
Distinguish automated checks from browser observations and requirements that remain untested.
Follow [contribution disclosure](../../CONTRIBUTING.md#pull-request-expectations) when preparing the PR.

## Dependabot

[`.github/dependabot.yml`](../../.github/dependabot.yml) opens dependency updates for GitHub Actions, root-workspace npm packages, and both Python workers.
These pull requests require passing CI and manual review and merge.
No repository workflow auto-merges them.

## Engineering skill configuration

### Issue tracker

GitHub Issues in `KyleDerZweite/spellbook` are the repository's issue tracker.
Use `gh` from this clone.
When a skill says to publish to the issue tracker, create a GitHub issue.
When it says to fetch a ticket, read its body, labels, comments, and linked work with `gh issue view`.

Read the [issue label policy](../ISSUE_LABELS.md) before triage.
Keep multi-line issue bodies in a temporary file and pass `--body-file`.
A tracker operation needs authorization from the current request or invoked workflow.
This configuration does not authorize unsolicited issues, comments, priority changes, merges, or releases.

PRs as a request surface: no.

### Wayfinding operations

An explicitly invoked Wayfinder effort uses one GitHub issue labelled `wayfinder:map`.
Its body owns the destination, standing notes, links to resolved decisions, remaining unspecified areas and exclusions.
Open decision tickets are native sub-issues, not a second list maintained in the map body.
Write repository documentation and durable issue context in English.
Issues must contain enough context to resume work without a local-only branch, worktree or temporary evidence file.
Use published sources and commits for supplementary links; keep unpublished decisions and essential experiment findings in the issue itself.
Follow the [planning label policy](../ISSUE_LABELS.md#wayfinder-planning-labels).

Create each decision issue with its question and appropriate `wayfinder:<type>` label, then add it through `POST /repos/KyleDerZweite/spellbook/issues/{mapNumber}/sub_issues` with the child's numeric `sub_issue_id`.
After all relevant issues exist, add native blocking through `POST /repos/KyleDerZweite/spellbook/issues/{childNumber}/dependencies/blocked_by` with the blocker's numeric `issue_id`.
Numeric database IDs come from `gh api repos/KyleDerZweite/spellbook/issues/{number} --jq .id`; issue numbers and GraphQL node IDs are not interchangeable with them.

Read children with `GET /repos/KyleDerZweite/spellbook/issues/{mapNumber}/sub_issues`, using pagination.
The frontier is the open, unassigned children whose `issue_dependencies_summary.blocked_by` is zero.
Preserve child order when choosing the next ticket.
A decision session first claims its chosen ticket with `gh issue edit {number} --add-assignee @me`, before resolving it.
Charting creates questions without claiming or resolving them.
A human decision remains open until the maintainer answers it.

Read the current map, child and relevant comments before any update.
Record a resolved answer as an issue comment, close that child, and add a short named link to the map's Decisions so far.
Significant accepted contracts also belong in their canonical document or ADR; the map is an index, not their duplicate owner.
Do not turn proposed answers into implementation readiness.

If GitHub explicitly reports native sub-issues or dependencies unavailable, record that limitation and use a map task list plus a named parent link, or a named blocking line, respectively.
Do not fall back merely because a request used the wrong endpoint or ID.
This configuration grants no authority beyond the invoked planning effort.

### Domain docs

Spellbook uses one domain context.
Start with [the docs index](../README.md), then read the root [glossary](../../GLOSSARY.md) and relevant [decision records](../decisions/README.md) before domain exploration.
Use the glossary's canonical terms.
Keep definitions in the glossary and behavior in its existing product or architecture owner.

ADRs live in `docs/decisions/`; preserve their numbering, filenames, template, and supersession rules.
Check the status of a decision before applying it.
Surface a conflict with an accepted decision and resolve it with the maintainer before changing its contract.
A proposal or superseded decision does not describe implemented behavior.

Skills that default to `docs/agents/` or `docs/adr/` must use these existing owners.
Edit this configuration and the label mapping directly when they change; rerun setup only to change the tracker or reconsider the layout.

Workspace sync unit checks exercise the public transport/lease seam, including hidden resume, terminal activation, deferred publication, counted writes and coalesced probes.
InventoryWindow held actual HTTP responses verify physical admission under ordinary invalidation.
`test:sync` also drives the production workspace lease module against two built processes and PostgreSQL for Inventory/Deck/Profile totals and actual-worker Scan result invalidation.
Those checks establish HTTP/resource behavior, not browser draft/focus/anchor acceptance; record rendered and deployment evidence separately.

## Value history verification

[History integration tests](../../frontend/tests/integration/inventory-value-history.integration.test.ts), [value summaries](../../frontend/tests/integration/value-summary.integration.test.ts), [value events](../../frontend/tests/integration/inventory-value-events.integration.test.ts) and [value HTTP tests](../../frontend/tests/value-history-http.test.ts) own checkpoint, summary, notification and route evidence.
Run these against the migrated disposable database using the existing integration/HTTP isolation rules.
[Scale integration](../../frontend/tests/integration/inventory-value-scale.integration.test.ts) requires `TEST_VALUE_SCALE_ACCOUNT_ID` naming a disposable account already populated with 50,000 real Catalog holdings.
It uses `TEST_DATABASE_URL`, changes that account's checkpoint fixtures and skips without both variables.
Record Catalog/fixture provenance and absent coverage.

Record head, migration state and fixture provenance with results.
Controlled-clock captures prove eligibility and consistency, not an actual scheduled midnight observation.
Provider refresh, rendered presentation, owner acceptance and deployment remain separate evidence.
[Valuation](../architecture/valuation.md#reviewed-personal-history-contract) lists relevant failure and lifecycle scenarios.

## Local combo verification

[Matcher cases](../../frontend/tests/unit/combo-matcher.test.ts), [native editor/proof cases](../../frontend/tests/unit/combo-category-ui.test.ts), [transaction cases](../../frontend/tests/integration/combo-categories.integration.test.ts) and [built HTTP cases](../../frontend/tests/combo-http.test.ts) own local Combo evidence.
The transaction and HTTP fixtures consume the complete verified public Demo bundle and publish the recorded Oak/Denizen subset with proven raw Oracle identities.
The source fixture retains the recorded official `2850-4186` variant; an explicitly synthetic commander variant tests role authority.
Fixture cleanup restores the exact preceding Catalog/Combo state.
These subset fixtures establish semantics, not full-source import compatibility or candidate-query resource use.

The HTTP suite explicitly enables the adapter only for its owned built application child.
Deployment defaults remain disabled.
Run it through the existing disposable-database, origin and graceful-cleanup rules.
Full-source evidence separately records the actual official bulk transfer, embedded timestamp/version, hashes, counts, publication resources and analyzed candidate plans for Oak-only, Oak/Denizen and the recorded Upgrades Unleashed Deck.
Native wide/360px and no-JavaScript journeys remain separate from HTTP/source tests.
Preserve publication provenance with those results; never present a new source's metadata as a prior recorded export.
