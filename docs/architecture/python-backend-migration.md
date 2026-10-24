# Python backend migration contract

- Status: Implemented unmerged candidate; owner testing and production operations pending
- Last Reviewed: 2026-10-25
- Source of Truth: ADR-0025, ADR-0026, ADR-0027, existing code/tests/contracts and Kyle's accepted migration, native FastAPI/Pydantic and pre-release direction
- Update Triggers: native FastAPI HTTP contract and pre-release receipt scope, ADR-0029 pre-release extension, native FastAPI/Pydantic adoption, persistence/auth evaluation, immediate interface removal, ADR-0028 versioned API and MTG module ownership, Python source activation and server contraction, functional migration acceptance, component interfaces, assembled Categories/state, Dashboard/Scan and packaged migrator/operators, compatibility transfer, migrator rehearsal, source activation, Node server removal, production authority
- Related Docs: [ADR-0025](../decisions/0025-python-api-and-workers.md), [ADR-0026](../decisions/0026-python-migration-contract.md), [ADR-0027](../decisions/0027-python-functional-migration-acceptance.md), [ADR-0029](../decisions/0029-remove-replaced-interfaces.md), [Independent applications](./independent-applications.md), [Application contract](./application-contract.md), [Valuation](./valuation.md), [Migration evidence](./python-migration-evidence-baseline.md), [Postgres](./postgres.md), [Auth](./auth.md), [Worker](./worker.md), [Deployment](../operations/deployment.md), [Verification](../operations/github-automation.md), [Issue 211](https://github.com/KyleDerZweite/spellbook/issues/211)

## Scope and status

Finish the Python API and all server workers using the existing Python foundation.
Kyle's 2026-10-23 direction supersedes strict P01 performance/resource gates and Linux/kernel/Collector proof prerequisites through [ADR-0027](../decisions/0027-python-functional-migration-acceptance.md).
Modest performance variance, long asynchronous jobs and ordinary controlled retries are acceptable.
Functional domain implementation may proceed without #248 matched-resource proof.
The unselected `linux_owned_lifecycle_v1`/PARKED proposal is superseded and supplies no implementation requirement.
No kernel research, resource-verifier package or formal ownership/receipt layer is required.
Application mutation receipts and replay within the current version remain required.

Historical foundation and Node extraction evidence remain in Git history.
Current acceptance exercises the installed Python implementation and current interfaces under [ADR-0029](../decisions/0029-remove-replaced-interfaces.md).
Its 2026-10-25 extension removes backward compatibility and stored-data upgrade guarantees.
Historical Node parsing, serialization and error-body quirks are not acceptance requirements.

Complete the candidate on `integration/python-backend-migration` and leave it unmerged for review.
Authorized source work includes Python migrator preparation/rehearsal, Python default activation and removal of the replaced TypeScript server and obsolete server tests after their functional coverage transfers.
Keep the Svelte/TypeScript frontend and Android, updating affected callers and shared contracts with interface changes.
Schema changes may require reset/reimport; retain SQL needed for fresh installation.
The pre-release policy does not authorize resetting an actual database or deleting unrelated files.
Production cutover, productive migrator rollout and ending the real production rollback window remain separate operations.

## Framework, modules and resources

Use native FastAPI routing and Pydantic request models, replacing custom routing/parsing machinery and its obsolete compatibility tests.
The [native HTTP contract](./independent-applications.md#selected-versioned-game-api) owns APIRouter composition, Pydantic dependencies, validation errors, Multipart limits and method/slash policy.
Valuation is included before Inventory to preserve literal value-read dispatch.
The checked-in OpenAPI artifact remains the published owner; it does not drive dispatch.
HTTP adapters authenticate into a trusted actor and call typed application modules.
Psycopg 3 and explicit SQL remain the implemented persistence stack.
Re-evaluate persistence, ORM/migration ownership and auth/permissions for future internal Admin and ML panels; no replacement library or panel implementation is selected by that evaluation.
Keep Core framework-free and introduce no generic repository or new broker.
Shared Core owns Auth, identity preferences, database, password, QR and SavedState infrastructure.
`spellbook_core.mtg` owns Catalog, Inventory/Groups, Decks, Categories/Library, Valuation/History, Dashboard, Scan and MTG projections.
Shared Profile has an explicit dependency on `mtg.profile`.
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
Keep client presentation helpers and TypeScript validators in `contracts/src/`; Python cannot import them.
Initially retain handwritten TypeScript/Kotlin clients and test them against the neutral fixtures.
Code generation is deferred until a concrete reviewed need exists.

Fixtures and adapter tests verify the selected current contract, including missing fields versus explicit null, exact domain numbers, safe errors, conflicts, cookies and limits.
Native FastAPI/Pydantic behavior may replace historical Node coercion and validation responses; update affected callers, contracts and tests together.
Remove superseded compatibility adapters instead of adding another compatibility layer.
The existing checked-in OpenAPI publication remains implemented until its owning HTTP change reconciles publication with native FastAPI.

The installed Python one-shot migrator consumes bundled ordered SQL, journal and snapshots from `backend/drizzle/`.
Keep a single schema/migration owner and safe execution/concurrency handling.
Verify fresh installation, a second-run no-op and interrupted/concurrent runner recovery.
Existing history may remain where needed for fresh installs; retained-data upgrades, unchanged SQL hashes across versions and same-data Node rollback are not acceptance gates.
Re-evaluate the migration tool with persistence ownership rather than adding a permanent parallel runner.
Production execution and any actual database reset require their own authorization.

## Current behavior and safety

The existing [application](./application-contract.md), [HTTP/Auth](./independent-applications.md#authority-and-compatibility), [Postgres](./postgres.md), [Catalog](./catalog.md) and [Worker](./worker.md) documents retain behavioral ownership.
Keep accepted application effects, current closed commands and browser forms correct while replacing HTTP mechanics.
[ADR-0028](../decisions/0028-versioned-game-api.md) supersedes path/module immutability for the accepted canonical versioned API and explicit MTG modules.
Its mapping and ownership contract live in [independent applications](./independent-applications.md#selected-versioned-game-api).
[ADR-0029](../decisions/0029-remove-replaced-interfaces.md) removes the previous API paths, alias adapters and obsolete route/transfer inventories.
Compare the complete current registry with canonical OpenAPI and exercise current interfaces.

- Preserve bearer-before-cookie selection without fallback after any invalid explicit Authorization, cookie-only SSR/forms, Origin exceptions, trusted client addresses and `APP_ORIGIN` authority.
  Count credential-form attempts exactly once before decoding; preserve password rotation's replacement cookie and request-bound credential.
  Retain QR requester/device separation, HttpOnly secrets, original-session/approval-marker binding, one-use redemption, expiry under lock waits, revocation and separate ordered Set-Cookie headers.
- Keep secure password hashing, token digests and session revocation correct.
  Existing credential formats may change under the pre-release policy; Node password-length and encoding quirks are not mandatory.
- Keep deterministic normalized intent and fingerprints for current-version idempotency.
  Mutation, revisions, original receipt and related effects commit atomically; replay returns the original receipt after later edits/deletion/recreation.
  Preserve Profile/session fencing, Scan-session-before-Inventory, Inventory-before-entry-before-group and Deck/Category lock order, read snapshots and revision behavior on no-ops.
- Preserve Notes, Description, Quantity, Category and merge conflicts with their exact latest-value/revision fields, including `latestQuantity: null`.
  Preserve bounded reads, Catalog generation coherence, Inventory query resets, Classification/Library filters, optional local Combo matching, daily ValueHistory/frozen evidence and Scan storage/commit cleanup.
  Keep native/enhanced web forms, retained drafts and explicit recovery after an ambiguous save.
- Preserve SavedState events and account isolation, no durable replay, bounded queues and delivery-time session checks.
  Retain 10-second revalidation, 15-second heartbeats, 30-second slow-consumer disposal, 5-second operation/setup deadlines, listener recovery, cancellation and unbuffered web/proxy forwarding.
- Reuse streaming COPY and atomic Catalog/Price publication, raw Oracle facts, pointer/pruning transaction, original advisory keys and paired recovery.
  Optional prices keep their shared Catalog lock; Oracle Tags and Combo retain their own locks and independent retention/provenance.
  Publication failure leaves the last complete snapshot active; `state.json` remains operator status.
  Preserve opt-ins, resource limits and safe handling of current private data and Scan objects.

The candidate host composes only the canonical versioned API and unchanged Discovery, including nineteen canonical Deck routes and the closed nine-command MTG endpoint.
Web commands preserve original Core receipts, revisions and absent optional fields, reject caller authority and retain direct API Bearer-before-cookie selection and cookie-mode Origin protection.
SSR/forms select only the browser cookie before forwarding.
Dashboard uses account-scoped aggregates and exact-first Deck allocation in one read-only repeatable-read snapshot, passing the same transaction and database clock to current/history value reads.
`VALUE_HISTORY_TIMEZONE` configures its calendar and private value routes.
The build hook bundles canonical SQL, journal and snapshots in API wheels/sdists; the explicit `spellbook-migrate` command discovers installed assets or honors `--migrations-dir`.
Three explicit Python operator entrypoints use bundled canonical Demo fixtures, with external `--fixtures-dir` support.
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
SQL/journal/snapshots, four canonical Demo assets, contracts and Android remain in source.
Any privately retained Node artifact stays under its operational owner; compatible rollback data is not a source acceptance requirement.
Source activation establishes neither complete integration acceptance nor production cutover.

## Delivery, evidence and rollback

The [implementation epic #245](https://github.com/KyleDerZweite/spellbook/issues/245) and P00 through P20 remain implementation context.
Their existing bodies do not override this accepted direction.
Delivery uses the existing unmerged [integration draft PR 276](https://github.com/KyleDerZweite/spellbook/pull/276) against `main`.
Root integrates isolated source commits sequentially and owns final runtime verification.
Root assigns shared CI, manifests, launchers, native routers and host integration to one writer before parallel implementation.
Keep writers isolated and start dependent work after their functional prerequisites integrate.
Migration-specific CI/start/packaging updates are required with their owning source slices; no general CI rewrite is selected.

1. Reconcile affected contracts, useful synthetic fixtures and implemented API/Core boundaries with native FastAPI/Pydantic.
   Port domain modules and HTTP adapters now, respecting their actual interfaces and data dependencies.
2. Complete all routes, operators and workers, including controlled retry/failure behavior and real scheduled effects.
   Transfer functional tests to Python and exercise real PostgreSQL transactions, races, account isolation and idempotency.
3. Integrate direct API, same-origin web proxy, actual workers/storage/providers, two-process SavedState and rendered client journeys.
   Exercise current Python process/database integration and current-version receipt replay on disposable data after writes.
4. Prepare/rehearse the one-shot Python migrator, make Python the candidate default and remove replaced Node server source and obsolete tests after consumer and coverage transfer.
   Refresh affected checks on the complete integration head and leave the artifact unmerged.
5. Separately authorize production API cutover, productive migrator rollout and the eventual end of the real rollback window.
   Source preparation does not close those operations.

### Practical acceptance contract

Verify the selected current HTTP contract, malformed input, forms, headers, cookies and proxy streaming.
Require authentication/account isolation, exact domain numbers, current-version receipt replay, atomic effects and publication correctness.
No retained Node runtime, perfect historical wire parity or cross-version stored-data upgrade is required.
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
P17 owns integrated current-Python functional and current-version receipt acceptance.
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
