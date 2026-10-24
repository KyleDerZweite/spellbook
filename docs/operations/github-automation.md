# Repository verification and GitHub automation

- Status: Canonical
- Last Reviewed: 2026-10-25
- Source of Truth: package scripts, Python project files, CI workflow, contribution policy
- Update Triggers: raw Web header rejection and deterministic Category recovery, native FastAPI HTTP contract and pre-release receipt scope, State history scheduling ownership, Core-owned PostgreSQL test environment, canonical root operator commands, explicit Application checks and conditional Python boundary ownership, ADR-0029 immediate removal of replaced API interfaces, canonical-only API operation checks and MTG imports, installed Python activation, Node source/test contraction and transferred HTTP consumers, Python source activation and server contraction, functional Python migration acceptance and retired P01 proof requirements, setup-java v6 compatibility, Python Category/state packaging, host/Dashboard/Scan assembly and installed migrator/operator checks, manual native acceptance and import boundaries, independent API/web ownership and relocated code references, native initial Deck Search publication regression, conditional CI scope, manual-only heavy workflows and consolidated jobs, native Inventory measurement regression, portable opt-in browsing performance evidence and artifact provenance, PWA worker build harness and tsconfig, QR integration/HTTP and pending target acceptance, Dev launcher lifecycle tests, test commands, workflow coverage, runtime pins, browser verification, tool output and evidence handling, child-task context, PR policy, Dependabot policy, engineering skill tracker and domain layout, Wayfinder sub-issues and native dependencies, self-contained planning evidence, proposed runtime/evidence manifests and integration closeout, optional account-summary and Inventory scale fixtures, integration file serialization and graceful HTTP child shutdown, recorded Category Catalog fixture isolation and range fixtures, optional local Combo fixtures and source-fenced HTTP evidence, SavedState two-process HTTP and Python socket prerequisites, Scan actual-worker tests and replay fixtures, private value observation/calendar/API and invalidation checks, application/transport lifecycle and native operator persistence checks
- Related Docs: [Operations](./README.md), [Product acceptance](../product/specification.md#interface-acceptance), [Frontend](../architecture/frontend.md), [Deployment](./deployment.md), [Contributing](../../CONTRIBUTING.md), [Docs maintenance](../README.md#maintenance), [Application boundaries](../architecture/application-contract.md#implementation-status)

This document owns repository check commands, CI coverage, and verification evidence.
Product and integration documents own behavior and acceptance criteria.
Run checks appropriate to the changed behavior; do not treat a passing command as proof of requirements it does not exercise.

## Local checks

Use Node 26.10.0, pnpm 12.8.1, Python 3.14.8 and uv 0.12.23.
The pnpm workspace owns frontend/contracts; independently locked Python packages own API/Core and workers.
Run from the repository root in an isolated worktree:

```sh
pnpm install --frozen-lockfile
pnpm setup:python
pnpm lint
pnpm check:boundaries
pnpm --dir frontend check
pnpm --dir frontend test:unit
pnpm test:tooling
APP_ORIGIN=http://127.0.0.1:5191 pnpm build
```

`setup:python` installs the current packages and local Core dependency as wheels with frozen dependencies.
Rerun it after source changes before testing installed entrypoints.
`lint` runs the complete Prettier check only.
`check:boundaries` scans source import directions; `test:tooling` runs its forbidden-import fixtures.
`pnpm --dir frontend check` runs frontend TypeScript/Svelte checks without the root `check` command's Python Mypy checks.
Python package checks remain independent below.
`build` produces Python Core/API/State distributions and the origin-matched Svelte artifact, including client leakage and PWA checks.
Adapter-node 6 takes `paths.origin` from build-time `APP_ORIGIN`; runtime `ORIGIN` cannot change that artifact.

`test:tooling` covers boundary fixtures, launcher ownership/failures, Python launcher commands and web packaging.
Its lifecycle fixtures substitute executables and do not establish real container/database operation.
Run each affected package's ordinary checks once, then broaden only for changes or unresolved failures.

For local routing or workflow changes, run `node --test scripts/ci-changes.test.mjs` directly.
Run `CI_EVENT_NAME=pull_request CI_BASE_SHA=<base-sha> CI_HEAD_SHA=<head-sha> node scripts/ci-changes.mjs` to inspect selected scopes.

For genuine client/API acceptance, supply matching `DATABASE_URL` and `TEST_DATABASE_URL` for an exclusively assigned disposable PostgreSQL 18 database.
Apply migrations explicitly before tests; never let a fixture silently select a live target.
With installed Python packages and a web build for the exact test Origin, run from the root:

```sh
pnpm db:migrate
APP_ORIGIN=http://127.0.0.1:5191 pnpm --dir frontend build
pnpm --dir frontend test:http
pnpm --dir frontend test:scan
pnpm --dir frontend test:sync
```

`test:integration` is an aggregate of those retained external HTTP suites.
It replaces the removed direct Node domain integration project.
Tests require their explicit disposable database guards and fail for unavailable configured databases/services.
A missing optional guard is unexecuted evidence, not a database pass.
`TEST_HTTP_PORT` defaults to 5191 and `TEST_API_PORT` to 5193; rebuild web when changing its Origin.
Tests verify free ports before starting children or publishing fixtures.
The [runtime fixture](../../frontend/tests/http-runtime.ts) launches the installed `backend/api/.venv/bin/spellbook-api` directly, with no Node API fallback, and built web independently.
Only API receives database/storage credentials.
Direct API, same-origin proxy, SSR/native actions, original receipts and account isolation retain separate assertions.

The [raw-header regression](../../frontend/tests/remote-proxy-headers-http.test.mjs) uses the built Web handler, standalone production entrypoint and a local mock upstream without a database.
It sends repeated Authorization, Origin and Content-Type lines over HTTP and verifies safe rejection before any upstream work, with a normal bearer/JSON-body control.
The [proxy upload regression](../../frontend/tests/remote-proxy-upload-http.test.mjs) uses the actual built web handler and installed Python native host, dependencies and request policy without a database.
Its small [Python fixture](../../frontend/tests/fixtures/proxy-api.py) supplies transport-only responses; it establishes no domain acceptance.
Known-length/chunked limits, early 413, forwarded credentials/Origin, separate cookies, SSE cancellation and upload abort remain covered.
The default web cap is 512 KiB for that regression; `TEST_PROXY_WEB_BODY_LIMIT=12M` selects normal allowance.

Category Library recovery injects SQLSTATE `57014` at receipt insertion to verify 503, rollback and retained retry state; it does not require a fixed transaction duration limit.
The Category and Combo HTTP fixtures verify the complete canonical public bundle, publish owned subsets and restore previous Catalog pointers.
Do not run them with another publisher on the same target.
The [WholeDeckCategory HTTP test](../../frontend/tests/whole-deck-http.test.ts) starts and closes its own installed State worker independently of API.
[SavedState HTTP](../../frontend/tests/saved-state-http.test.ts) builds two origin-matched web artifacts and uses two installed Python API replicas.
Its listener queries use each API PID's Python application name.
It covers actual TCP delivery, account isolation, session revocation, listener recovery and graceful shutdown; rendered journeys remain separate.
Its paused-client fixture requires Python 3 and Linux `ss`.
The Scan suite requires the actual configured worker and local storage; mocks do not establish S3 or recognizer integration.

The retained [account-scale fixture](../../frontend/tests/fixtures/account-scale.ts) requires `TEST_SCALE_CATALOG_PATH` with 10,000 genuine Catalog printings for optional large-account HTTP scenarios.
Without that input, report the scale scenarios skipped.
The separate portable browsing suite below retains actual client window algorithms and the installed Python HTTP target.

### Python API and Core

Run Ruff, format, Mypy and pytest from each owning package directory.
`--project` alone does not change pytest discovery or Mypy's configuration directory.
From the repository root:

```sh
pnpm setup:python
uvx --from uv==0.12.23 uv lock --project backend/core --check --python 3.14.8
uvx --from uv==0.12.23 uv run --directory backend/core --no-sync ruff check
uvx --from uv==0.12.23 uv run --directory backend/core --no-sync ruff format --check
uvx --from uv==0.12.23 uv run --directory backend/core --no-sync mypy
uvx --from uv==0.12.23 uv run --directory backend/core --no-sync pytest
uvx --from uv==0.12.23 uv lock --project backend/api --check --python 3.14.8
uvx --from uv==0.12.23 uv run --directory backend/api --no-sync ruff check
uvx --from uv==0.12.23 uv run --directory backend/api --no-sync ruff format --check
uvx --from uv==0.12.23 uv run --directory backend/api --no-sync mypy
uvx --from uv==0.12.23 uv run --directory backend/api --no-sync pytest
uvx --from uv==0.12.23 uv run --project backend/api --no-sync python scripts/check_python_boundaries.py
uvx --from uv==0.12.23 uv run --project backend/api --no-sync python -m unittest discover -s scripts -p test_python_boundaries.py
```

Apply the same lock/Ruff/format/build/pytest checks to each changed worker package; State also uses strict Mypy.
API tests exercise the complete native route assembly, all nine closed web commands, strict wire parsing, headers/cookies, errors, request/stream/password/adapter/pool ownership and partial startup cleanup.
The actual no-database host tests use owned ephemeral TCP ports and graceful SIGTERM.
The native operation-set test compares every API method/path with OpenAPI; that structural comparison does not establish functional correctness by itself.
Run `SPELLBOOK_TEST_WHEEL=1` for the external installed API wheel/sdist check and `SPELLBOOK_TEST_STATE_WHEEL=1` for State.
These tests verify bundled assets, console commands and installed production dependencies without connecting to PostgreSQL.

Run Core's real PostgreSQL tests from its own frozen development environment with `uvx --from uv==0.12.23 uv run --directory backend/core --no-sync pytest <selected-tests>`.
Core's development extra includes `psycopg-pool` for test fixtures; runtime pools remain owned by API and State.
Read each selected file's explicit target guard before execution.
The existing `P02B_CORE_NATIVE_DATABASE`, `P02B_INVENTORY_NATIVE_DATABASE` and `P02B_SCAN_NATIVE_DATABASE` cases retain their exclusive assigned target.
Categories use `CATEGORY_NATIVE_DATABASE` and `CATEGORY_JOB_NATIVE_DATABASE`; Deck uses `DECK_NATIVE_DATABASE`; Catalog/Valuation uses `SPELLBOOK_DOMAIN_TEST_DATABASE`.
Operator and migration suites have separate guarded disposable-target/reset requirements.
Selecting a suite without its opt-in reports skipped coverage and establishes no database result.

`test_host_assembly.py::test_composed_value_literals_and_inventory_detail_dispatch_to_their_owners` verifies both literal Value reads and genuine Inventory detail through the same composed app.
`test_native_policy.py` covers predecode authority/throttling, byte limits, safe failures and native method/slash behavior.
Obsolete Node method/CONNECT/TRACE emulation, raw-path/dot normalization, deep JSON, binary64/number spelling and Fetch Multipart differential tests are retired.
The former registry assembly/discovery modules are replaced by native-policy/discovery acceptance; meaningful domain, cookie, receipt, file cleanup and SSE scenarios remain.
Canonical native route assertions compare complete method/path sets with OpenAPI and reject extra operations.
Representative removed API paths must return 404.
QR cookie-jar flows, Origin/cache policy, raw forms, method handling and SSE receive/close regressions and HEAD/OPTIONS rejection cover current routes.
The Python boundary checker rejects retired generic MTG module paths; internal imports use `spellbook_core.mtg` and `spellbook_api.http.mtg`.

Manual `backend/api/tests/native_host_acceptance.py` remains outside ordinary pytest discovery.
It exercises the installed Python production app, real process/database behavior, stored receipts and SSE.
It requires the existing exclusive sse target, matching protected DSNs, `P02B_SHARED_NATIVE_DATABASE`, `P02B_PUBLIC_ORIGIN` and external `P02B_INSTALLED_PYTHON`.
`P02B_NODE_EXECUTABLE` selects Node only for built web; no Node rollback entrypoint is required.
Run `test_installed_python_original_receipts_and_direct_proxy_wire_acceptance` and `test_installed_replicas_proxy_revocation_and_physical_listener_reconnect` through this manual module.
It does not launch a Node API or compare removed routes; Node is used only for built web where required.
The obsolete direct Node-source replay driver is removed; guarded Python HTTP fixtures remain shared in `native_inventory.py`.
Root owns those real runtime checks, scheduled state observations, actual Scan/storage/providers and current-head rendered acceptance.
Production deployment and rollback retirement remain separately authorized operations.

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
The runtime fixture also starts the installed `backend/api/.venv/bin/spellbook-api` using `TEST_API_PORT` or default 5193.
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
pnpm --dir .. db:migrate
pnpm test:integration
APP_ORIGIN=http://127.0.0.1:5191 pnpm --dir .. build
pnpm test:http
```

`check:ts`, reached through `pnpm check`, also checks the separate service-worker tsconfig.
`test:unit` covers QR input parsing and PWA cache/state helpers.
The built [worker harness](../../frontend/tests/pwa-worker.test.ts) requires build output, so `build` runs `node --test tests/pwa-worker.test.ts` after compilation; it does not belong to `test:unit`.
The harness executes worker behavior with controlled platform doubles, without a server or database.
It verifies the cache allowlist, private/auth/API exclusions, network-error fallback and explicit update activation; it is not browser installation evidence.

[QR integration tests](https://github.com/KyleDerZweite/spellbook/blob/87cc4a3d153616bcce46fad046246b6a3271e563/frontend/tests/integration/qr-auth.integration.test.ts) exercise backend QR transactions with real PostgreSQL.
[Backend HTTP tests](../../backend/api/tests/test_http_wire.py) cover framework-independent transport behavior; built HTTP coverage remains separate.
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
Java provisioning uses [setup-java v6](https://github.com/actions/setup-java/tree/v6) with Temurin 21 on `ubuntu-latest`.
Its Node 24 action runtime retains the v5 minimum runner version `v2.327.1`; local JDK checks do not verify execution of the GitHub action.
This explicit setup avoids relying on the runner image's SDK installation.
SDK license acceptance is authorized for this delivery; accepted license text is omitted from logs.

## Application and native operator checks

Python API lifecycle/resource tests cover validated configuration, unopened construction, partial startup, concurrent close, request settlement, stream drain, Scan adapter cleanup, password work and final pool closure.
Core owns Demo fixtures/operators and actual credential/session behavior; installed API CLI tests cover argument/stdin handling and bundled asset discovery.
Run guarded `backend/core/tests/test_operators_postgres.py` from the Core development environment against an empty migrated disposable `_demo` or `_design` target, setting `SPELLBOOK_OPERATORS_NATIVE_DATABASE` to its exact name.
Those scenarios verify guarded preservation/replacement, rollback, password recovery and session revocation.
They do not restrict authorized password recovery to disposable targets in actual operations.
The TypeScript and Python boundary checks enforce frontend/Core/HTTP/worker responsibilities.
Rendered acceptance and real deployment remain separate evidence.

## CI coverage

[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) runs on pull requests, pushes to `main` and manual dispatch.
It has four jobs.
The short `CI Scope` job runs the native [routing/workflow ownership tests](../../scripts/ci-changes.test.mjs) and [change classifier](../../scripts/ci-changes.mjs), without installing application dependencies.
The three substantive jobs depend on successful classification and can run in parallel:

| Job                | Checks                                                                                                                                   | Automatic scope                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Application Checks | Prettier, explicit source boundaries and frontend TypeScript/Svelte checks, web unit tests and root `test:tooling`                       | App/shared source and Scan worker changes                               |
| Python API/Core    | Independent lock/frozen install, Ruff, strict Mypy, Core/API unit/host/Discovery tests, package builds and negative Python import checks | API, Core, neutral contracts, migrations and shared Python tooling      |
| Python Workers     | Lock consistency, Ruff lint/format and pytest for each affected Python project                                                           | Catalog worker, Scan worker, or migrations used by Catalog worker tests |

Migration asset/ledger consistency runs in Python Core/API tests.
Root `test:tooling` includes launcher and packaging tests, so CI does not invoke those suites separately.
The two worker projects share their existing job/toolchain setup, retaining separate project environments; its PostgreSQL service starts only when Catalog worker tests are selected.
Python API/Core runs the repository Python import checker and six negative unittest cases.
The worker job runs the same checker and fixtures with the pinned interpreter only when Python API/Core is unselected.
Worker-only edits therefore enforce dependency rules without depending on the API/Core job.
Scope tests run only in CI Scope, and Node boundary fixtures run only through Application Checks tooling.
The scope job has a five-minute timeout; Application Checks, Python API/Core and Python Workers each have fifteen minutes.

[Application Integration](../../.github/workflows/application-integration.yml) and [Android Build](../../.github/workflows/android.yml) are separate workflows triggered only by `workflow_dispatch`.
Neither has an automatic trigger or a `workflow_call` entry point, and automatic CI never invokes them.
Each manual workflow has one job with a thirty-minute timeout and no concurrency cancellation of another manual run.
Application Integration retains disposable PostgreSQL 18, the actual locked Scan worker, Python migration and guarded Category/Deck PostgreSQL checks, the independent Python/API and web build, `test:http`, `test:scan` and `test:sync`.
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
`backend/api/`, `backend/core/`, `backend/workers/state/` and the Python boundary scripts select Python API/Core.
State package, Core and SQL changes also select the state package step in that existing job.
API-only edits keep state checks unselected.
The job installs ordinary ICU before Core Combo tests and retains all other existing CI ownership; broader CI audit proposals remain unselected.
Shared `contracts/` select both Application Checks and Python API/Core, including Discovery compatibility.
Other `frontend/`, `backend/` and `scripts/` source paths select Application Checks.
Migration paths under `backend/drizzle/`, including the legacy frontend path, select Application Checks, Python API/Core, the state package step and Catalog worker tests.
`backend/workers/catalog/` selects Catalog tests; `backend/workers/scan/` selects Application Checks and Scan worker tests.
Android-only changes and known documentation alone select no substantive automatic job.
JS workspace/lockfile changes select Application Checks without forcing Python.
CI/workflow files, unknown paths, manual lightweight CI runs or unavailable comparisons select every automatic suite.
The classifier has no Android output because Android is always an explicit manual check.
The automatic workflow has no path filter and avoids GitHub's path-filter limits.
New pushes cancel obsolete runs of the same PR or main branch; manual CI dispatches use unique concurrency groups and remain independent.

If repository protection later requires status checks, include `CI Scope` alongside Application Checks, Python API/Core and Python Workers.
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

Core `test_value_capture.py`, `test_valuation.py`, `test_dashboard_postgres.py` and `test_catalog_valuation_postgres.py` own capture, reference/summary and real-database coverage.
State package tests own scheduler lifetime/retry behavior.
The retained Dashboard and Inventory HTTP suites use the installed API.
Run real guarded cases against the assigned migrated target and record skipped coverage explicitly.
Controlled-clock captures establish eligibility and consistency; an actual scheduled midnight observation remains a separate Root-owned check.
Provider refresh, rendered presentation, owner acceptance and deployment remain separate evidence.
[Valuation](../architecture/valuation.md#reviewed-personal-history-contract) owns relevant failure scenarios.

## Local combo verification

[Core matcher cases](../../backend/core/tests/test_categories_combo.py), [native editor/proof cases](../../frontend/tests/unit/combo-category-ui.test.ts), [transaction cases](https://github.com/KyleDerZweite/spellbook/blob/87cc4a3d153616bcce46fad046246b6a3271e563/frontend/tests/integration/combo-categories.integration.test.ts) and [built HTTP cases](../../frontend/tests/combo-http.test.ts) own local Combo evidence.
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
