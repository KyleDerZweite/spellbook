# Python backend migration contract

- Status: Accepted execution contract, implementation authorized; production cutover pending
- Last Reviewed: 2026-10-20
- Source of Truth: ADR-0025, issue 211, baseline code, independent design analysis and Kyle's 2026-10-20 execution direction
- Update Triggers: execution scope, integration ownership, source preparation versus production operations, contract acceptance, independent review, framework or schema ownership, delivery gates, parity evidence, rollback
- Related Docs: [ADR-0025](../decisions/0025-python-api-and-workers.md), [ADR-0026](../decisions/0026-python-migration-contract.md), [Independent applications](./independent-applications.md), [Application contract](./application-contract.md), [Postgres](./postgres.md), [Auth](./auth.md), [Worker](./worker.md), [Deployment](../operations/deployment.md), [Verification](../operations/github-automation.md), [Issue 211](https://github.com/KyleDerZweite/spellbook/issues/211)

## Scope and status

The reviewed runtime baseline is `main` at `7d886780c78f1b017d0affa9c77d7069173b20f3` on 2026-10-19.
The execution starting point is `b835eee87ff0e92e99df18ab384602e48183a88d`, after accepted documentation PR 259 was squash-merged into `main`.
The TypeScript/Node API remains the production baseline; this contract amendment claims no implemented Python parity, benchmark or deployment.
ADR-0025 already selects Python for the HTTP API and every server worker under `backend/`.
Svelte/TypeScript and Kotlin/Compose remain the clients; phone/Jetson recognition stays local under ADR-0023.
Kyle accepted this direction on 2026-10-20 subject to an additional GPT-6 Astra Medium review, which found no blockers.
This document owns the accepted migration choices and delivery order.
On 2026-10-20, Kyle authorized complete end-to-end Python API and all server-worker implementation by GPT-6.1-Sol High subagents, including necessary reversible candidate experiments and manually invoked validation.
This accepted scope includes preparing and rehearsing the Python migrator and completing source activation and Node server source contraction on `integration/python-backend-migration`.
The final complete integration artifact remains unmerged for review.
Its server runtime and migrator use Python only; Svelte/TypeScript client code and its Node build/runtime requirements remain supported.
Production cutover, production migrator rollout and ending the real production rollback window remain separately authorized operations.
Implementation authorization establishes neither runtime parity nor production acceptance.
An implementation ticket becomes Ready only after its own prerequisites, reviewed contract and evidence requirements are settled.

## Framework, modules and resources

Use FastAPI with Uvicorn and Psycopg 3, without an ORM or a new job broker.
The existing Scan scaffold already uses FastAPI/Uvicorn; Catalog ingestion already uses Psycopg.
This reuses maintained dependencies while keeping PostgreSQL queries, transaction scopes and publication code explicit.
[FastAPI async guidance](https://fastapi.tiangolo.com/async/) and [Psycopg pools](https://www.psycopg.org/psycopg3/docs/advanced/pool.html) support this arrangement; they do not prove Spellbook compatibility.
Pin compatible versions and record dependency rationale in the implementing package; this planning change installs no new runtime dependency.

HTTP modules parse bounded input, authenticate credentials into a private trusted actor and map existing DTOs/errors.
Application modules own Auth/Profile/Dashboard, Catalog, Inventory/Groups, Decks, Categories/Library, Valuation/History and Scan.
They accept concrete dependencies and an explicit transaction for composed writes.
PostgreSQL modules own parameterized SQL, isolation, lock order and exact number decoding.
Application modules import neither FastAPI nor clients; the HTTP adapter depends on the application modules.
Workers call the same relevant application/SQL modules without importing the HTTP adapter.
Catalog ingestion retains its existing independent publication implementation.
No generic RPC, repository framework or caller-supplied actor authority is introduced.
Extend boundary checks to Python imports and test forbidden dependency directions before the first API/core/worker implementation slice is accepted.
The existing TypeScript boundary checker does not inspect Python.

Accepted target packages, not current paths:

```text
backend/
  api/                  # FastAPI host, HTTP adapters and operator CLI entrypoints
  core/                 # Typed application/SQL modules, transaction and migration helpers
  workers/
    catalog/            # Existing Catalog, Price, Oracle Tags and Combo publishers
    scan/               # Existing HTTP compatibility scaffold, still no_match
    state/              # Separate ValueHistory and WholeDeckCategory runner entrypoints
  drizzle/              # Preserved SQL, journal and historical snapshots
```

Each runnable package has its own `pyproject.toml`, uv lock/environment, image and start command.
`core/` is a local package dependency for API/state, with no process or global resources of its own.
API, Catalog, Scan and each state runner have separate process lifetimes and CPU, memory, connection and temporary-storage budgets.
Today ValueHistory and WholeDeckCategory runners start inside [the Node application](../../backend/src/application.ts); move their scheduling to state workers during migration.
Keep synchronous mutation effects, checkpoint consistency, enqueue operations and receipts inside their existing transactions.
Retain ValueHistory advisory leases and WholeDeck job generation, lease-token and revision fencing.
Only scheduling changes process ownership; domain decisions and publication authority do not change.

Use one Uvicorn process per API instance initially, a bounded async request pool, and one separate SavedState LISTEN connection per process.
The listener uses autocommit and one notification consumer; its reconnect/delivery behavior must pass real PostgreSQL tests.
Each ticket records numeric pool size, admission queue/wait, SQL deadlines, process count, CPU/RSS and temporary-storage limits before Ready.
Preserve existing SSE deadlines and worker/provider limits as minimum requirements; extra replicas multiply the connection and memory budget.
Password derivation retains its bounded executor and attempt limits; blocking storage work uses bounded offload, and bulk/CPU jobs stay outside HTTP.
On disconnect, timeout or shutdown, settle owned work and roll back unfinished transactions before releasing connections.
Cancellation never proves that a commit did not happen.
The host must close SSE before draining requests, then workers/listeners and pools; FastAPI lifespan teardown alone does not establish this order.

## Wire schema and SQL ownership

Backend owns wire semantics; a checked-in OpenAPI 3.1 document under `contracts/` becomes the language-neutral structural owner.
Extract it from [the current OpenAPI builder](../../backend/src/http/openapi.ts), reconcile it against routes and consumers, and add executable JSON/raw-HTTP compatibility fixtures before Python handlers.
During extraction, Node must serve the same contract without changing behavior.
Framework-generated OpenAPI is not a competing source of truth.
Keep client presentation helpers and TypeScript validators in `contracts/src/`; Python cannot import them.
Initially retain handwritten TypeScript/Kotlin clients and test them against the neutral fixtures.
Code generation is deferred until a concrete reviewed need exists.

Fixtures preserve absent fields, explicit null, empty strings, unknown-key policy, coercion, Unicode lengths, finite safe JSON numbers, decimal/revision strings and ISO timestamps.
They include statuses, error bodies, headers, limits and raw forms, not only successful DTOs.
Explicit compatibility parsing/error adapters prevent FastAPI's default coercion and 422 bodies from changing behavior.
Existing route-specific validation remains authoritative where OpenAPI alone cannot express it.

During the API port, Drizzle remains the sole schema/migration owner and runner.
Keep `backend/drizzle/0000` through `0024`, journal, snapshots and deployed ledger unchanged, and avoid DDL changes for a language-only port.
If an unavoidable additive migration occurs, update both runtime compatibility and baseline evidence before dependent work resumes.
Never recreate tables from Python models, reset data, squash SQL history or run parallel Alembic/Drizzle ownership.

Prepare one Python one-shot migrator using Psycopg and ordered SQL in `backend/drizzle/` after the complete candidate is integrated.
API parity and rollback rehearsal evidence must pass before the source ownership handoff.
P19 preparation is part of the authorized unmerged integration artifact and does not depend on executing the P18 production cutover.
Drizzle remains the production migration owner until the separately authorized migrator rollout.
It must recognize and validate the existing Drizzle ledger, exact SQL hashes, journal order and statement breakpoints without replaying applied SQL or stamping assumed history.
Unknown, changed or noncontiguous history fails closed; no API/worker auto-migrates on startup.
The prepared source handoff freezes Drizzle generation in the integration artifact, makes SQL the future schema owner and retains `schema.ts` only until its consumers are replaced.
No second live schema definition remains afterward; historical snapshots stay historical.
The prepared one-shot job owns migration execution and concurrency exclusion; its production execution remains a separate operation.
Verify fresh install, upgrade of a retained database copy, second-run no-op and interrupted/concurrent runner recovery.
Compare extensions, ICU collation/indexes, generated columns, constraints, functions and notification triggers as well as tables and retained data.
Worker tests that apply selected SQL subsets do not establish this handoff.

## Compatibility invariants

The existing [application](./application-contract.md), [HTTP/Auth](./independent-applications.md#authority-and-compatibility), [Postgres](./postgres.md), [Catalog](./catalog.md) and [Worker](./worker.md) documents retain behavioral ownership.
The port preserves every existing route, method, closed web command and browser form without a new response envelope or product change.
The documented inventory is 88 API method/path pairs and 95 OpenAPI pairs including seven web-owned browser-auth methods; extract and compare the actual registry instead of trusting counts.

- Preserve bearer-before-cookie selection without fallback after any invalid explicit Authorization, cookie-only SSR/forms, Origin exceptions, trusted client addresses and `APP_ORIGIN` authority.
  Count credential-form attempts exactly once before decoding; preserve password rotation's replacement cookie and request-bound credential.
  Retain QR requester/device separation, HttpOnly secrets, original-session/approval-marker binding, one-use redemption, expiry under lock waits, revocation and separate ordered Set-Cookie headers.
- Preserve existing scrypt hashes and token digests without re-enrollment.
  Golden vectors cover Node's textual hex salt passed as UTF-8, scrypt parameters and JavaScript UTF-16 password-length rules from [password.ts](../../backend/src/auth/password.ts).
- Preserve normalized intent and exact fingerprint bytes from [request-fingerprint.ts](../../backend/src/decks/request-fingerprint.ts), including Unicode, omitted/null fields, JSON number/escaping rules and array order.
  Mutation, revisions, original receipt and related effects commit atomically; replay returns the original receipt after later edits/deletion/recreation.
  Legacy null hashes/acknowledgements keep their documented treatment and receive no fabricated backfill.
  Preserve Profile/session fencing, Scan-session-before-Inventory, Inventory-before-entry-before-group and Deck/Category lock order, read snapshots and revision behavior on no-ops.
- Preserve Notes, Description, Quantity, Category and merge conflicts with their exact latest-value/revision fields, including `latestQuantity: null`.
  Preserve bounded reads, Catalog generation coherence, Inventory query resets, Classification/Library filters, optional local Combo matching, daily ValueHistory/frozen evidence and Scan storage/commit cleanup.
  Keep native/enhanced web forms, retained drafts and explicit recovery after an ambiguous save.
- Preserve SavedState events and account isolation, no durable replay, bounded queues and delivery-time session checks.
  Retain 10-second revalidation, 15-second heartbeats, 30-second slow-consumer disposal, 5-second operation/setup deadlines, listener recovery, cancellation and unbuffered web/proxy forwarding.
- Reuse streaming COPY and atomic Catalog/Price publication, raw Oracle facts, pointer/pruning transaction, original advisory keys and paired recovery.
  Optional prices keep their shared Catalog lock; Oracle Tags and Combo retain their own locks and independent retention/provenance.
  Publication failure leaves the last complete snapshot active; `state.json` remains operator status.
  Preserve opt-ins, resource limits and all existing private data and Scan objects.

## Delivery, evidence and rollback

The [implementation epic](https://github.com/KyleDerZweite/spellbook/issues/245) owns the native sub-issues, blocking relationships and per-slice readiness/evidence.
[P00](https://github.com/KyleDerZweite/spellbook/issues/246) publishes this documentation; issue 211 retains the original design discussion.
The existing breakdown contains twenty documentation/code slices and the separate P18 operational cutover gate.
P19 and P20 each distinguish source preparation from their later operational acceptance.
Use PRs per useful verified slice against current `main`; explicitly based stacks are allowed.
Root orchestrates delegation, review and sequential integration without writing implementation files.
Root may merge verified dormant slice PRs and reviewed safe Dependabot PRs.
Keep final source activation, Python migrator source handoff, Node server source contraction and the complete integration artifact on `integration/python-backend-migration`, unmerged for review.
These source changes may be built, run and rehearsed against disposable resources before any production operation.
Node keeps all production API mutation ownership until the separately authorized complete API switch.
Do not route production subsets between runtimes or shadow writes.
Worker relocation code can merge separately while preserving the production baseline and exactly one active publisher/scheduler per responsibility.
Isolate delegated writers and runtime resources, integrate sequentially, then refresh dependent evidence.
Before API/worker parallelism starts, root appoints and records one named shared-file integration writer, distinct from root.
That writer alone owns shared CI/path classification, root manifests, launchers, route registry and application lifetime construction, including the first API package and worker relocation.
Package/domain writers use isolated worktrees and disjoint files; the shared-file writer integrates their shared changes sequentially and refreshes affected evidence.
Start dependent work only after prerequisite integration has been verified on its declared base, either `main` or the integration branch for final-only work.

| Step | Reviewable result and acceptance evidence                                                                                                                                                                 | Prerequisite                                                                                  |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 0    | Publish this accepted, independently reviewed contract and ADR-0026. Each future ticket names outcome, owner, interface, dependencies, numeric resource limits and checks.                                | Design accepted; integrate documentation before dependent work.                               |
| 1    | Freeze route/command/runner inventory, neutral schema and executable Node fixtures. Record same-data SQL, fixture hashes, versions, limits and measurement protocol.                                      | Accepted contract; Node remains operational.                                                  |
| 2    | Build the authorized isolated candidate for one bounded read, authenticated receipt mutation/readback and SSE. Compare against Node sequentially on equivalent disposable data.                           | Step 1 and reviewed numeric rejection limits.                                                 |
| 3    | Complete dormant API domain clusters, auth/QR, storage/operators, all mutations and state runners. Enforce Python import rules and test cross-runtime replay, conflicts and legacy receipts.              | Successful step 2; cluster-specific dependencies integrated.                                  |
| 4    | Relocate existing Python workers and wire separate state-worker entrypoints. Update packaging, Docker contexts, launcher, operators, fixture paths, CI path classification, Dependabot and docs together. | Relevant core modules integrated; no duplicate active jobs.                                   |
| 5    | Manually trigger full PostgreSQL/HTTP/Scan/two-process SSE and rendered-client acceptance, resource measurements and Node-to-Python-to-Node rollback rehearsal after real candidate writes.               | Steps 3 and 4; exact candidate/build/base recorded.                                           |
| 6    | Prepare/rehearse the Python migrator, activate Python in candidate source and remove replaced Node server source on the integration branch. Reverify the complete artifact and leave it unmerged.         | Step 5 API parity/rollback evidence, verified migrator preparation and transferred consumers. |
| 7    | Separately authorize and execute P18 production cutover, P19 production migrator rollout and P20 end of the real rollback window in operational order.                                                    | Applicable acceptance evidence, concrete release authority and operational observation.       |

Step 2 and necessary manually invoked validation are authorized by Kyle's complete implementation request; they have not been executed by this documentation amendment.
Measure p95/p99, RSS/CPU, event-loop responsiveness, connections, build/CI time and change effort using identical data, SQL, hardware, concurrency and limits.
There is no accepted numeric performance threshold at this baseline.
P01 must record reviewed numeric thresholds before P02 Ready; the existing implementation authorization requires no repeated experiment permission.
Do not invent a measured gain or use better averages to excuse tail/resource regressions.
Any unexplained wire difference, duplicate effect, changed original receipt, leaked authority, partial publication or unbounded resource is a rejection.

Reuse [repository verification](../operations/github-automation.md) and existing real PostgreSQL, QR race, receipt, conflict, operator, worker-publication, Scan and two-process SavedState suites.
Map every acceptance case to its tested runtime and revision.
Existing tests that import the TypeScript backend directly remain Node evidence until ported; run HTTP cases against both runtimes and transfer direct application cases to Python tests.
Extend coverage for cross-runtime fingerprints/hashes, Unicode/numbers, lost replies, rollback after Python writes, slow readers, cancellation and shutdown.
Verify direct API and same-origin proxy, raw/malformed forms and chunked uploads, listener failure/revocation and real configured storage/provider paths.
Record missing full-Catalog, scale, S3, proxy, scheduled-observation or native-target evidence with its owner; substitutes do not establish those integrations.
Automatic checks stay scoped; Android and heavy application integration remain exclusively manually triggered.
The first Python API/core package must immediately add lock, lint, type, test and negative import checks plus CI path selection for that package.
Do not wait for worker relocation to enable Python API/core checks.
Worker relocation must teach [CI path selection](../../scripts/ci-changes.mjs) the new Python paths in the same slice, including edits after old paths disappear.
Android builds, physical-device journeys/Keystore and website-to-app SSE remain separate evidence; prior native acceptance is still pending.

Before cutover, retain the Node image/build, configuration references, migration state, storage paths and a verified backup for disaster recovery.
Pause new admission, settle in-flight writes, close SSE and stop only owned runners gracefully before enabling the replacement owner.
Rollback on any correctness/security invariant failure or the pre-agreed resource/error/latency thresholds.
Stop Python admission and its runners, settle uncertain commits through persisted receipts, restore Node routing and its runners on the same compatible database/storage, then verify auth, replay, reads and SSE.
Retry ambiguous mutations only with their frozen body and original request ID.
Never restore a pre-cutover dump over subsequently accepted writes as routine rollback.
Do not rewind personal history or private state; public Catalog/Price recovery uses the existing paired-pointer procedure separately when needed.
Keep Node-readable data and additive schema compatibility throughout the rollback window.
Record the observation window, operational thresholds and owner before release readiness.
The authorized P20 source contraction removes replaced Node server implementation/tooling from the unmerged integration artifact after consumer transfer and current-head verification.
Retain the tested Node rollback build/image, configuration references and compatible SQL/data outside that source contraction for rollback rehearsals and later production recovery.
Source contraction ends no real rollback window and authorizes no production artifact deletion or destructive SQL.
Record implementation complete, required evidence unavailable, owner acceptance and production operations separately.
P18, P19 rollout and P20 operational acceptance remain open until actually authorized and executed; preparing the complete source artifact must not mark them complete.

### Tracker reconciliation

Reconcile issue bodies and native dependencies before affected downstream implementation; this accepted execution direction adds no approval gate.
The source-delivery outcome for epic 245 is the complete verified, unmerged integration artifact; operational completion remains separately tracked and prevents premature epic closure.
P00 is complete through merged PR 259; refresh contract links to the integrated amendment and execution base without rewriting its historical evidence.
P01/P02 retain their numeric resource/rejection and parity gates, with experiment and manual-validation authorization already supplied by the implementation request.
P13 retains its P01 prerequisite and the shared-file writer requirement.
Existing domain dependencies and operational acceptance criteria remain in force.

P19/P20 preparation has P16 as its native integrated-code prerequisite.
Replace the P19 native blocker on P18 with P16, and the P20 native blocker on P19 with P16.
Their issue bodies carry phase-specific evidence dependencies because an open issue awaiting production acceptance must not block authorized source preparation.
P19 source handoff additionally requires initial P17 API parity/rollback evidence and the reviewed migrator contract; keep P18 as an explicit production-rollout prerequisite in the body.
P20 source preparation depends on verified P19 preparation and current candidate parity, rather than elapsed production observation.
Keep P19 production rollout, accepted observation and explicit end-of-rollback authorization as separate P20 operational prerequisites in the body.
Neither issue closes while its operational acceptance remains pending.
P17 initial candidate acceptance precedes the source handoff; final-head revalidation follows migrator preparation and source activation/contraction.
Record that revalidation as final integration evidence rather than a prerequisite for beginning P19/P20 preparation.
Earlier candidate evidence alone does not verify the final artifact.

## Review record

Three independent GPT-6.1-Sol analyses with Extra High Reasoning examined API/Auth, data/workers and delivery/verification against the fixed baseline.
They identified textual scrypt salts/UTF-16 limits, exact JSON fingerprints, embedded state runners, shared publication locks and CI path selection as explicit migration risks.
Two fresh GPT-6.1-Sol reviewers with Extra High Reasoning independently checked all seven documentation changes against issue 211, ADR-0025, code, SQL and tests.
Both reported no blocking findings on 2026-10-19.
Their follow-ups added explicit Python import-check evidence and dedicated-listener autocommit/notification ownership.
The reviewed initial contract had SHA-256 `9003545d8c022e9cd0704ab8598877209a51ec4c6f9341bea112b3417a9a62d2`; proposed ADR-0026 had SHA-256 `fc3b00b32894e18b5bbfa04a1172e7776e04a589ba5697f37b9f102ad2ffa211`.
On 2026-10-20, an independent GPT-6 Astra review with Medium Reasoning confirmed no blockers against the same baseline and final Sol-reviewed contract.
Its two follow-ups require explicit test-to-runtime mapping and Python CI from the first API/core package, now included above and in the slice contracts.
The concrete slice plan also passed Astra Medium review after adding required Catalog/parser blockers, early shared integration ownership and explicit partial Category/Combo evidence limits.
Numeric resource/rejection limits remain prerequisites for the relevant future tickets; architecture acceptance does not settle unmeasured limits.
Markdown formatting, local documentation links and `git diff --check` pass for this planning change.
No parity test, experiment, Android/heavy workflow, cutover or deployment is claimed by this planning change.
The 2026-10-20 execution amendment records Kyle's subsequent complete implementation scope and preserves those historical reviews as evidence of the earlier design.
It distinguishes authorized source preparation from unexecuted production gates; prior reviews do not establish verification of the completed Python artifact.
