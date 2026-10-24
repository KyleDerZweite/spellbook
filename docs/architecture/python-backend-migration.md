# Python backend migration contract

- Status: Implemented unmerged candidate; owner testing and production operations pending
- Last Reviewed: 2026-10-24
- Source of Truth: ADR-0025, ADR-0026, ADR-0027, existing code/tests/contracts and Kyle's accepted migration and interface-removal direction
- Update Triggers: ADR-0029 immediate interface removal, ADR-0028 versioned API and MTG module ownership, Python source activation and server contraction, functional migration acceptance, component interfaces, assembled Categories/state, Dashboard/Scan and packaged migrator/operators, compatibility transfer, migrator rehearsal, source activation, Node server removal, production authority
- Related Docs: [ADR-0025](../decisions/0025-python-api-and-workers.md), [ADR-0026](../decisions/0026-python-migration-contract.md), [ADR-0027](../decisions/0027-python-functional-migration-acceptance.md), [Independent applications](./independent-applications.md), [Application contract](./application-contract.md), [Valuation](./valuation.md), [Migration evidence](./python-migration-evidence-baseline.md), [Postgres](./postgres.md), [Auth](./auth.md), [Worker](./worker.md), [Deployment](../operations/deployment.md), [Verification](../operations/github-automation.md), [Issue 211](https://github.com/KyleDerZweite/spellbook/issues/211)

## Scope and status

Finish the Python API and all server workers using the existing Python foundation.
Kyle's 2026-10-23 direction supersedes strict P01 performance/resource gates and Linux/kernel/Collector proof prerequisites through [ADR-0027](../decisions/0027-python-functional-migration-acceptance.md).
Modest performance variance, long asynchronous jobs and ordinary controlled retries are acceptable.
Functional domain implementation may proceed without #248 matched-resource proof.
The unselected `linux_owned_lifecycle_v1`/PARKED proposal is superseded and supplies no implementation requirement.
No kernel research, resource-verifier package or formal ownership/receipt layer is required.
Existing application mutation receipts remain part of functional compatibility.

Historical foundation and Node extraction evidence remain in Git history.
Current acceptance exercises the installed Python implementation and canonical interfaces under ADR-0029.

Complete the candidate on `integration/python-backend-migration` and leave it unmerged for review.
Authorized source work includes Python migrator preparation/rehearsal, Python default activation and removal of the replaced TypeScript server and obsolete server tests after their functional coverage transfers.
Preserve the Svelte/TypeScript frontend, shared client DTOs/validators, Android, database data and existing SQL migration history.
Production cutover, productive migrator rollout and ending the real production rollback window remain separate operations.

## Framework, modules and resources

Use FastAPI/Uvicorn and Psycopg 3, explicit typed application/SQL modules, no ORM and no new broker.
HTTP adapters parse existing inputs, authenticate into a trusted actor and map the existing DTOs/errors.
Shared Core owns Auth, identity preferences, database, password, QR and SavedState infrastructure.
`spellbook_core.mtg` owns Catalog, Inventory/Groups, Decks, Categories/Library, Valuation/History, Dashboard, Scan and MTG projections.
Shared Profile retains its existing wire body and an explicit dependency on `mtg.profile`.
HTTP game adapters live in `spellbook_api.http.mtg`; Auth, account preferences and transport remain shared.
SQL modules own parameterized queries, transactions, isolation, lock order and exact numeric decoding.
Core imports neither FastAPI nor clients; HTTP and workers depend on Core.
Workers share relevant application/SQL modules without importing HTTP.
Catalog ingestion retains its independent transactional publication implementation.
Enforce these dependency directions with the existing Python boundary checks.

```text
backend/
  api/                  # FastAPI host, HTTP adapters and operator entrypoints
  core/                 # Typed application/SQL modules and migration helpers
  workers/
    catalog/            # Catalog, Price, Oracle Tags and Combo publishers
    scan/               # Existing no_match compatibility scaffold
    state/              # Separate ValueHistory and WholeDeckCategory runners
  drizzle/              # Preserved SQL, journal and historical snapshots
```

Each runnable package owns its project/lock, image and start command.
Core is a local dependency with no process or global resources.
API and workers retain independent process lifetimes and deployment ownership.
Move ValueHistory and WholeDeckCategory scheduling out of HTTP while preserving synchronous effects, enqueue operations, advisory leases, generation/token/revision fencing and transactions.
Keep one active mutation/publisher/scheduler owner for each responsibility.
Bulk/CPU work runs outside HTTP; bounded pools, password offload, request/body limits and SavedState queues remain practical safeguards.
Existing foundation limits are reusable settings, not mandatory comparative performance gates.
Correct disconnect, rollback, listener recovery and graceful shutdown behavior still require functional tests.
Do not reuse a connection with an unfinished transaction or retry an ambiguous mutation without its original idempotency identity.
A cancellation alone does not prove rollback or failed commit.

### Planned P06/P15 query and capture interfaces

Retain the established P06/P15 responsibility split and query interface where reused by the port.
P06 [#252](https://github.com/KyleDerZweite/spellbook/issues/252) owns reference SQL, projections, selection, exact estimates and complete frozen outcomes.
P15 owns private history, the real Dashboard, capture policy and its standalone runner.
P06 imports no P15 policy or runner; HTTP and state workers depend on Core.
[Valuation](./valuation.md) and [value tracking](../product/value-tracking.md) own the functional behavior.

`Valuation.freeze_in_transaction(tx, input, as_of, *, query=None)` accepts the actual Psycopg transaction and an optional query callable.
The callable receives the same transaction, SQL and parameters and returns complete tuple rows; commands return an empty list after successful completion.
Query errors propagate, and the helper opens no transaction or resource.
P15 controls capture queries and sequential per-account transactions on its leased connection without a nested pool checkout.
Preserve confirmed commits, rollback recoverable failures and discard unusable connections before further work.
Ordinary controlled retries are allowed when receipts, leases and transaction state make them safe.
A later leased observation may recover an uncertain capture outcome without deleting accepted history or inventing a rollback.
No D2 measurement envelope, physical-settlement proof protocol or additional numeric watchdog contract blocks this implementation.
Domain dependencies such as Auth, Inventory and Scan remain necessary where consumed; #248 resource proof is not a transitive prerequisite.

## Wire schema and SQL ownership

Backend owns wire semantics; the checked-in [OpenAPI 3.1 artifact](../../contracts/openapi.json) is the language-neutral structural owner.
The [Python adapter](../../backend/api/src/spellbook_api/http/application.py) serves that artifact with the configured origin.
Reconcile Python handlers against it, actual routes/consumers and the retained synthetic JSON/raw-HTTP fixtures.
Framework-generated OpenAPI is not a competing source of truth.
Keep client presentation helpers and TypeScript validators in `contracts/src/`; Python cannot import them.
Initially retain handwritten TypeScript/Kotlin clients and test them against the neutral fixtures.
Code generation is deferred until a concrete reviewed need exists.

Fixtures preserve absent fields, explicit null, empty strings, unknown-key policy, coercion, Unicode lengths, finite safe JSON numbers, decimal/revision strings and ISO timestamps.
They include statuses, error bodies, headers, limits and raw forms, not only successful DTOs.
Explicit parsing/error adapters prevent FastAPI's default coercion and 422 bodies from changing behavior.
Existing route-specific validation remains authoritative where OpenAPI alone cannot express it.

During the API port, Drizzle remains the sole schema/migration owner and runner.
Keep `backend/drizzle/0000` through `0024`, journal, snapshots and deployed ledger unchanged, and avoid DDL changes for a language-only port.
If an unavoidable additive migration occurs, update stored-data compatibility and current Python evidence before dependent work resumes.
Never recreate tables from Python models, reset data, squash SQL history or run parallel Alembic/Drizzle ownership.

Prepare one Python one-shot migrator using Psycopg and ordered SQL in `backend/drizzle/` after the complete candidate is integrated.
Current API functional evidence and safe migration/recovery rehearsal must pass before the source ownership handoff.
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
The port preserves current application behavior, closed web commands and browser forms without a new response envelope.
[ADR-0028](../decisions/0028-versioned-game-api.md) supersedes path/module immutability for the accepted canonical versioned API and explicit MTG modules.
Its mapping and ownership contract live in [independent applications](./independent-applications.md#selected-versioned-game-api).
[ADR-0029](../decisions/0029-remove-replaced-interfaces.md) removes the previous API paths, alias adapters and obsolete route/transfer inventories.
Compare the complete current registry with canonical OpenAPI and exercise current interfaces.

- Preserve bearer-before-cookie selection without fallback after any invalid explicit Authorization, cookie-only SSR/forms, Origin exceptions, trusted client addresses and `APP_ORIGIN` authority.
  Count credential-form attempts exactly once before decoding; preserve password rotation's replacement cookie and request-bound credential.
  Retain QR requester/device separation, HttpOnly secrets, original-session/approval-marker binding, one-use redemption, expiry under lock waits, revocation and separate ordered Set-Cookie headers.
- Preserve existing scrypt hashes and token digests without re-enrollment.
  Golden vectors cover Node's textual hex salt passed as UTF-8, scrypt parameters and JavaScript UTF-16 password-length rules from [passwords.py](../../backend/core/src/spellbook_core/passwords.py).
- Preserve normalized intent and exact fingerprint bytes from [fingerprint.py](../../backend/core/src/spellbook_core/fingerprint.py), including Unicode, omitted/null fields, JSON number/escaping rules and array order.
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

The candidate host composes only the canonical versioned API and unchanged Discovery, including nineteen canonical Deck routes and the closed nine-command MTG endpoint.
Web commands preserve original Core receipts, revisions and absent optional fields, reject caller authority and retain direct API Bearer-before-cookie selection and cookie-mode Origin protection.
SSR/forms select only the browser cookie before forwarding.
Dashboard uses account-scoped aggregates and exact-first Deck allocation in one read-only repeatable-read snapshot, passing the same transaction and database clock to current/history value reads.
`VALUE_HISTORY_TIMEZONE` configures its calendar and private value routes.
The build hook bundles unchanged canonical SQL, journal and snapshots in API wheels/sdists; the explicit `spellbook-migrate` command discovers installed assets or honors `--migrations-dir`.
Three explicit Python operator entrypoints use unchanged bundled canonical Demo fixtures, with external `--fixtures-dir` support.
The API owns Scan storage/worker construction from existing environment variables, request settlement and adapter close before its pool.
Boto3 supplies S3/SigV4, python-multipart supplies upload parsing and the existing httpx2 dependency supplies the worker client.
No-DB Discovery creates neither adapter.
The independently packaged `spellbook-state-worker` owns WholeDeckCategory and ValueHistory scheduling on its own Core-configured pool.
HTTP enqueues and performs synchronous effects but starts neither runner.
API and state images use system ICU for Combo witness collation.
Default Compose, `./dev.sh` and `pnpm start` use installed Python API and independent workers after successful one-shot Python migration.
The temporary Python Compose override is removed.
The API normally binds loopback port 3001, supports explicit container IP addresses and requires database configuration unless schema-only mode is explicitly selected.
The replaced Node server, build/operator tooling and coupled domain tests are removed; Python Core/API functional and opt-in PostgreSQL tests own those responsibilities.
Frontend unit/browser/external HTTP tests remain, with installed Python as the fixed API target.
The unchanged SQL/journal/snapshots, four canonical Demo assets, contracts and Android remain in source.
The private retained Node rollback artifact is untouched.
Source activation establishes neither complete integration acceptance nor production cutover.

## Delivery, evidence and rollback

The [implementation epic #245](https://github.com/KyleDerZweite/spellbook/issues/245) and P00 through P20 remain implementation context.
Their existing bodies do not override this accepted direction.
Delivery uses the existing unmerged [integration draft PR 276](https://github.com/KyleDerZweite/spellbook/pull/276) against `main`.
Root integrates isolated source commits sequentially and owns final runtime verification.
Root assigns shared CI, manifests, launchers, route registry and host integration to one writer before parallel implementation.
Keep writers isolated and start dependent work after their functional prerequisites integrate.
Migration-specific CI/start/packaging updates are required with their owning source slices; no general CI rewrite is selected.

1. Reconcile this contract and retain the current OpenAPI, useful synthetic fixtures and implemented API/Core boundaries.
   Port domain modules and HTTP adapters now, respecting their actual interfaces and data dependencies.
2. Complete all routes, operators and workers, including controlled retry/failure behavior and real scheduled effects.
   Transfer functional tests to Python and exercise real PostgreSQL transactions, races, account isolation and idempotency.
3. Integrate direct API, same-origin web proxy, actual workers/storage/providers, two-process SavedState and rendered client journeys.
   Exercise current Python process/database integration and receipt replay on retained disposable data after writes.
4. Prepare/rehearse the one-shot Python migrator, make Python the candidate default and remove replaced Node server source and obsolete tests after consumer and coverage transfer.
   Refresh affected checks on the complete integration head and leave the artifact unmerged.
5. Separately authorize production API cutover, productive migrator rollout and the eventual end of the real rollback window.
   Source preparation does not close those operations.

### Practical acceptance contract

Preserve the wire schema and route-specific behavior, including malformed input, raw forms, headers, cookies and proxy streaming.
Preserve authentication/account isolation, stored credentials, data, exact numbers, original receipts, atomic effects and publication correctness.
Prove these with Python application tests and real PostgreSQL/HTTP integration, including conflicts, lost replies, retries and worker failures.
Jobs may take longer, but must eventually produce the correct effects, recover safely and avoid duplicate publication or mutation.
Exercise listener recovery, revoked sessions, slow consumers, transaction rollback and graceful shutdown with ordinary functional scenarios.
No matched latency/CPU/RSS/storage threshold, Collector validation or kernel proof is an acceptance prerequisite.
Observe performance when useful and report functional failures honestly; modest variance and long background jobs do not block the port.

The [migration evidence](./python-migration-evidence-baseline.md) owns current functional evidence responsibilities and retained fixture ownership.
Use [repository verification](../operations/github-automation.md#python-api-and-core) for package and integration checks.
Route counts, mocks and schema equality alone do not prove current Python functional correctness.
Record the tested revision/build, command, actual provider/runtime, result, skips and missing evidence with its owner.
Verify direct API and proxy separately, actual Scan/storage/provider paths and genuine scheduled observations.
Substitutes do not establish real integration, rendered clients or physical Android/Keystore acceptance.
Heavy application integration and Android checks remain manually triggered.
Refresh affected evidence after migrator, packaging, default activation and server removal changes.

Retained production artifacts, configuration references, migration state, storage paths and data remain under their operational owner.
Current source acceptance requires no Node API runtime or old-path comparison.
Stop only verified task-owned processes gracefully.
Before a production switch, settle in-flight writes and disable old admission/runners before enabling replacement ownership.
Resolve uncertain writes through persisted receipts; retry mutations with their original frozen body and request ID.
Any separately authorized production recovery must preserve accepted writes and must not overwrite them from a pre-cutover dump.
Do not rewind private history; public Catalog/Price recovery retains its existing paired-pointer procedure.
Record release observation and recovery conditions with the operational owner before production readiness.
Source removal authorizes neither production artifact deletion nor destructive SQL.
Distinguish implemented code, passed/failed/unexecuted checks, owner acceptance and production operations.

### Tracker reconciliation

Withdraw obsolete performance-only blockers and any readiness claim based on the former P01/P02 strict gates, including #248 and transitive resource-proof dependencies.
These blockers no longer prevent domain implementation under this contract while ticket reconciliation is pending.
No GitHub ticket was changed by this documentation reconciliation.
Reconcile affected ticket bodies/dependencies to functional outcomes, interfaces and evidence before treating their old Ready labels as authoritative.
Retain genuine domain dependencies and unexecuted functional acceptance; do not mark them complete.
P13 worker relocation needs publication compatibility and shared-file coordination, without a P01 benchmark prerequisite.
P17 owns integrated current-Python functional and same-data receipt acceptance.
ADR-0029 supersedes old-route parity and dual-runtime HTTP prerequisites.
P19/P20 source preparation uses integrated P16 code and initial P17 functional evidence, followed by final-head verification.
P18 production cutover is not a prerequisite for source preparation.
P19 productive rollout and P20 operational rollback retirement stay open until separately authorized and executed.

## Review record

The 2026-10-19/20 contract and independent Sol/Astra reviews are retained in Git history.
They identified credential encoding, fingerprints, embedded runners, publication locks, dependency checks and CI ownership as migration risks.
They do not verify the completed Python artifact or establish acceptance of this later reconciliation.
[ADR-0027](../decisions/0027-python-functional-migration-acceptance.md) records Kyle's 2026-10-23 supersession of strict resource/performance blockers.
The evidence baseline distinguishes scoped observed runtime results from unexecuted final-head integration and production operations.
