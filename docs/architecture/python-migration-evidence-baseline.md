# Python migration evidence baseline

- Status: Canonical P01 baseline; candidate limits await independent slice review
- Last Reviewed: 2026-10-20
- Source of Truth: b835eee Node code, executable neutral fixtures, issue 247 and maintainer implementation brief
- Update Triggers: route/command/runner ownership, compatibility cases or transfer, measured baseline, experiment limits, independent review, candidate evidence
- Related Docs: [Migration contract](./python-backend-migration.md), [ADR-0026](../decisions/0026-python-migration-contract.md), [Contracts](../../contracts/README.md), [Independent applications](./independent-applications.md), [Auth](./auth.md), [Postgres](./postgres.md), [Verification](../operations/github-automation.md), [Deployment](../operations/deployment.md), [Issue 247](https://github.com/KyleDerZweite/spellbook/issues/247)

## Scope and authorization

P01 freezes the running Node behavior after documentation PR 259.
Its verified base is `b835eee87ff0e92e99df18ab384602e48183a88d`.
The implementation worktree started clean on `t3/python-compatibility-baseline` at that exact commit, matching `origin/main`.
Local `main` still pointed to `7d886780c78f1b017d0affa9c77d7069173b20f3`; it was not reset or changed.

The maintainer's 2026-10-20 implementation brief authorizes completing migration through High subagents, reviewed Slice PR merges and the necessary bounded disposable representative experiment/manual validation.
The complete final integration branch remains unmerged, and production deployment is excluded.
This later authorization supersedes the earlier issue text's separate experiment-authorization prerequisite for this work.
No additional permission question is required for that authorized disposable experiment.
The numeric limits below are explicit engineering choices for independent review, not measurements or a claim that the maintainer individually selected each value.
P02 starts only after this Slice's independent review accepts those choices and its prerequisites integrate.
The orchestrator records that review and acceptance with the Slice PR; this document does not fabricate an approval.

The accepted migration contract and ADR-0026 remain owned by the separate contract writer.
This baseline changes no application ownership, SQL, historical migration, stored data, client contract or active process.
There is no Python API package yet.

## Frozen artifact and implementation contract

[`contracts/openapi.json`](../../contracts/openapi.json) owns the language-neutral structural schema.
The Node [adapter](../../backend/src/http/openapi.ts) imports that artifact into the normal esbuild bundle and changes only `servers` for the existing public origin.
The original builder's `JSON.stringify(openapi('/'))` SHA-256 is `2278d5ffc597f59dde47974b9d4835a849be9abe5f023870c2ccbde801ce6979`.
The executable extraction check pins that exact object and property order.
JSON source formatting is not an HTTP byte change; Node still uses its existing response serializer.

Backend owns validation and wire semantics.
Contracts contains schemas and sanitized data, while existing TypeScript helpers and handwritten TypeScript/Kotlin clients remain.
The API HTTP adapter depends on application modules; persistence, workers and domain validation do not depend on the schema adapter.
No new runtime dependency, generic fixture engine, generated client or duplicate framework schema owner is introduced.
Route registration, application lifetime, CI, root manifests and launchers stay with the later integration writer.

## Complete ownership inventory

The canonical [machine-readable inventory](../../contracts/compatibility/inventory.json) enumerates every method/path separately and assigns each to current source and future Slice.
The check instantiates all ten production route factories rather than relying on historical counts.
Existing OpenAPI checks independently reconcile browser-auth source methods and all local references.

| Registered group                              | Explicit method/path pairs | Migration ownership                                               |
| --------------------------------------------- | -------------------------: | ----------------------------------------------------------------- |
| API Auth, including two original-form bridges |                          9 | P03                                                               |
| Account/Profile/Dashboard/password bridge     |                          6 | P03, Dashboard application extends in P15                         |
| Public and authenticated Catalog              |                          7 | P04                                                               |
| Inventory/Groups/imports                      |                         16 | P04 reads, P05 writes and import preview                          |
| Decks/composition/Library                     |                         19 | P08 metadata/reads, P10 composition/imports, P11 Library browsing |
| Entry/whole Categories and definitions        |                         17 | P07, P09, P11; optional Combo choices P12                         |
| SavedState                                    |                          1 | P02 host/listener, P17 complete integration                       |
| Public prices/private values                  |                          5 | P06 references, P15 private value/history                         |
| Scan                                          |                          7 | P14                                                               |
| Closed web command endpoint                   |                          1 | P05/P08/P10 application owners                                    |
| Web-owned browser Auth                        |                          7 | P03 keeps SvelteKit pages, forms and cookies                      |
| Discovery `/openapi.json`                     |                          1 | P01/P16                                                           |

These are 88 API pairs, seven web-owned browser-auth pairs and one Discovery pair.
OpenAPI retains the same 95 documented pairs; Discovery has never documented itself.
HEAD maps to each registered GET and discards its body.
OPTIONS returns 204 and ordered `Allow` for each API/Discovery path, even when its handler requires authentication.
Unsupported methods return 405 with `{ "message": "Method Not Allowed" }`, without the ordinary error body's `status` field.
Unknown routes return 404 through the ordinary error serializer.
The Node router accepts one trailing slash and decodes named path segments after matching.
These implicit behaviors remain requirements, not extra registered business methods.

The nine closed commands are `inventory.add`, `inventory.patchEntry`, `inventory.remove`, `decks.createRecord`, `decks.addCatalogCard`, `decks.changePrinting`, `decks.updateCard`, `decks.removeCard` and `decks.importInto`.
The inventory assigns each command individually; strict command/input keys reject supplied actor, account, source and application authority.
The adapter supplies `source: web` for Inventory and preserves absent optional input fields.
The web-owned Auth rows cover GET/POST login, register and approve, plus POST logout.
The independent web proxy, SSR/forms and original-form bridge retain their existing cookie-only identity and origin authority.

The inventory also lists the internal Scan worker's two explicitly declared methods, `GET /health` and `POST /v1/scan/process`.
Its existing FastAPI defaults additionally expose internal `/openapi.json`, `/docs`, `/docs/oauth2-redirect` and `/redoc` documentation handlers.
They remain Scan-package framework behavior under P13, outside the public 95-operation schema.
Catalog has no HTTP health/status endpoint.

All ten runtime responsibilities have explicit inventory rows, including the API host, dedicated SavedState LISTEN owner, embedded ValueHistory and WholeDeckCategory runners, independent Catalog scheduler, Catalog/paired Price publisher, optional prices, Oracle Tags, Combo and Scan scaffold.
The four publisher responsibilities run serially under the Catalog scheduler's existing process, not four new processes.
ValueHistory polls every 10 seconds under advisory lease `78173020462008`.
WholeDeckCategory polls every second, debounces for 250 ms and uses a 30-second lease with generation/token/revision fences and up to 60-second backoff.
P11/P15 move only scheduled runner ownership to separate state processes; synchronous transaction effects remain with their application owners.
P13 preserves publisher locks, COPY/publication/pointers/pruning and source-specific limits without changing schema ownership.
P16 owns password/Demo operator entrypoints and packaging; P19 owns the later one-shot migrator handoff.
Drizzle remains the only migration runner throughout the API port.

## Compatibility and evidence transfer

The [golden data](../../contracts/compatibility/golden.json) contains only synthetic public values.
The [transfer map](../../contracts/compatibility/transfer.json) explicitly lists every case ID and its Node-direct executor, required dual-runtime HTTP scenario and required Python application transfer.
Its completeness check rejects unmapped or duplicate fixture IDs.
The targeted tests use existing production decoders, conflict serializers, Auth selection, command handlers and Inventory replay/normalization seams.
The local HTTP Discovery check uses the production Node bridge on an owned ephemeral TCP port.
HTTP adapter tests use the real router with stubbed application methods.
Receipt tests stub only the Drizzle select seam and establish replay decisions, not transactions or PostgreSQL behavior.

| Invariant                  | Baseline case and transfer requirement                                                                                                                                                                                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Existing credentials       | Exact scrypt vectors retain textual hex salt as UTF-8, N=32768, r=8, p=3, 64-byte key and 64 MiB maxmem. Port verification without re-enrollment. Preserve 12..128 UTF-16 code-unit password bounds, dummy work and four active derivations.                                                                                                           |
| Fingerprint bytes          | Vectors pin recursive key ordering, numeric object-key enumeration, array order, omitted/null fields, JS-only undefined, raw Unicode, combining marks, lone surrogates, escaping, negative zero, exponent spelling and safe-number rounding. Actual patch/import normalization must reproduce the stored hash.                                         |
| Original/legacy receipts   | Inventory returns original acknowledgements independently of current target state; null hashes do not invent a hash, and null acknowledgements return `legacy: true`. Deck null-ack fallback reads the live Deck/revision with empty changes. Port distinct branches and execute both-runtime lost-reply replay after later edits/deletion/recreation. |
| Conflict data              | Golden bodies cover Request, Notes, Description, Quantity including `latestQuantity: null`, Category, Merge and Library conflicts, plus private 500 sanitization. Real PostgreSQL stale-revision/lock/race failures must retain no effects and exact original receipts.                                                                                |
| Numbers and strings        | HTTP finite-number parsing is distinct from signed 32-bit quantity validation and exact safe-integer aggregate decoding. Revisions above 2^53 and decimal amounts remain strings. ISO timestamp strings retain their UTC spelling/precision. Never make every number a string or accept framework coercion.                                            |
| Absence and unknown keys   | An absent optional Notes field stays absent; null is rejected where a string is required. General JSON decoding retains unknown keys while closed commands/QR and individual domains reject their own keys. Preserve endpoint-specific policy.                                                                                                         |
| Raw forms and limits       | Preserve first duplicate form value, plus/percent decoding, malformed UTF-8 replacement in forms, strict UTF-8 rejection for JSON, multipart CRLF and invalid media/body errors. Count credential attempts once before body decoding.                                                                                                                  |
| HTTP authority and headers | Invalid or empty explicit Authorization suppresses cookie fallback. Preserve cookie-first duplicate selection, malformed cookie behavior, cookie mutation Origin checks and foreign/null Origin rejection. Cleanup Set-Cookie precedes session replacement, followed by QR cleanup as separate ordered headers.                                        |

The inventory's `bodyBytes` records route decoder caps.
The host default is 12 MiB; ordinary JSON is 1 MiB, QR JSON is 1024 bytes, Category JSON is 16/64 KiB, original forms and multipart Scan requests are 12 MiB.
Scan image validation separately caps an image at 10 MiB and retains accepted formats.
The web host's own limit and streaming proxy rules remain independent; compare direct API and proxy with the existing production 12 MiB configuration and default-cap rejection cases.
Schema declarations do not replace current route-specific validation.

Existing test transfer is larger than the new golden set.
All TypeScript direct-import cases in `backend/tests/`, `frontend/tests/unit/` and `frontend/tests/integration/` remain Node evidence, including application calls inside nominal HTTP suites.
P03 transfers Auth/session/Profile/QR transaction/race tests; P04/P05 transfer Catalog, Inventory, Groups, receipt and conflict tests.
P06/P15 transfer public/private Valuation/history/Dashboard/capture; P07/P09/P11/P12 transfer entry/Library/whole/Combo evaluation and jobs.
P08/P10 transfer Deck reads/availability/metadata/composition/imports; P14 transfers Scan persistence/storage/commit cleanup; P16 transfers operators.
Each implementing Slice must list its transferred test names and exact runtime/head in its own evidence record.
P17 runs the existing built HTTP suites against both endpoints, actual PostgreSQL, Scan worker and two-process SavedState, plus Node-to-Python-to-Node replay after Python writes.
A test name containing HTTP does not prove Python if the fixture still constructs or launches Node.

## Representative experiment protocol

The P02 owner runs the authorized disposable experiment and records raw evidence in the existing ignored `.local/` evidence area.
Keep credentials in the existing protected environment; reports contain only references and sanitized IDs.
Use two new task-owned PostgreSQL 18 databases cloned from one migrated, sanitized fixture dump, with identical SQL 0000..0024 and Drizzle ledger.
Never use a shared database or concurrent publisher.
Record dump SHA-256, ledger rows/SQL hashes, schema-only dump hash and initial data counts before each cohort.
Keep the exact same database after each runtime's writes for cross-runtime replay/rollback checks; clone again only to restart a measurement cohort.

Use the tracked English Catalog bundle and its native verifier, recording compressed/decoded SHA-256, generation and manifest counts.
For the bounded experiment, deterministically publish the existing 1000-Printing real subset and seed one disposable account with 1000 Inventory entries, overlapping/empty Groups and synthetic credentials/receipts.
Record selected printing IDs, supported finishes, conditions, account fixture seed and deterministic request-body hashes.
Use no provider network traffic, unrelated accounts or background publisher.
A subset experiment cannot satisfy later full-Catalog or 50,000-entry acceptance.

Measure one authenticated bounded Inventory read, one receipt-protected quantity mutation plus readback/replay, and SavedState delivery from those writes.
Use the production Node SQL/transaction/query shape as the candidate reference, not an alternative query or cache.
Record normalized SQL and parameter-type manifests, query counts, lock/isolation order and analyzed plans with buffers on both implementations.
Candidate Psycopg placeholders may differ; their SQL semantics, projection, predicates, limits and order may not.
Verify result identities/counts, original receipt bytes and revision changes before timing.
Separate original writes from retries, no-ops, stale conflicts and rejected admission.
Do not hide replay correctness behind average latency.

Record CPU model/core count, RAM, kernel, filesystem/storage, governor, container/cgroup limits, PostgreSQL configuration, locale/ICU, Node/Python/uv/driver versions and build digests.
Pin the API to the same two logical CPUs with a 512 MiB process/cgroup budget; reserve separate fixed CPUs/resources for PostgreSQL and the load generator when available.
Use one process per runtime, equivalent connection limits and the same machine, storage and loopback network.
If affinity/cgroups are unavailable, record that limitation and keep placement unchanged; do not claim controlled resource acceptance without its measurements.
Keep web/proxy, workers, builds and tests outside timed cohorts.
Disable ValueHistory for both experiment configurations; seed no WholeDeck jobs and report Node's idle WholeDeck polling SQL separately rather than changing that running implementation.
Later P11/P15 measures the separate active state runners and total deployment budget.

Run Node then candidate sequentially, never competing on the same database or CPU.
Alternate order across three matched pairs to reduce warm-cache/order bias.
For each runtime/pair/concurrency, reset the clone, run 60 seconds of warmup, then 180 seconds of samples.
Use a 70% bounded-read, 20% original mutation/readback and 10% same-ID replay mix with deterministic unique IDs.
Test closed-loop concurrency 1, 8 and 32, reporting completed/failed operations and achieved throughput.
Keep 32 authenticated SSE clients open in addition to request concurrency, with one write producer.
Record client-cache and PostgreSQL buffer state; do not call a warm run buffer-cold.
Add a separate 128-concurrent-request overload run for 30 seconds, pool exhaustion, disconnect before/after commit, lock wait, slow SSE consumer, listener restart and graceful shutdown scenarios.
Correctness and bounded overload rejection matter even if the normal cohort is faster.

Collect monotonic per-request latency, pool acquisition/queue wait, SQL duration/rows and end-to-end invalidation delivery latency.
Sample process CPU/RSS, runnable work, open descriptors and database sessions/transactions/locks each second.
Capture PostgreSQL statistics deltas and temp-file bytes per isolated cohort, plus peak API temporary-directory bytes.
Measure event-loop lag with the same 10 ms scheduling probe in both hosts and identify that instrumentation in the result.
Report p50/p95/p99/max and raw sample counts, not just averages.
Use nearest-rank percentiles over at least 1000 samples per request class and cohort, and at least 1000 write-to-SSE delivery samples.
Insufficient samples make that gate unexecuted, not passed.
Record clean installation/build/check wall time and maximum RSS separately from runtime cohorts, and record source/change effort without inferring speed from lines of code.

## Numeric rejection limits

These limits bound the representative experiment only.
They are deliberately fixed before measurements and require independent review with P01.
They are not changes to the running Node configuration, promised production SLOs or measured improvements.
The baseline API currently constructs a default `pg.Pool` with max 10 and no general finite acquisition queue/deadline.
Category work already caps pool/lock waits at 2 seconds, statements at 5 seconds and transactions at 10 seconds.
SavedState already uses 5-second setup/operation deadlines, 10-second revalidation, 15-second heartbeats and 30-second slow-consumer disposal.
Those implemented limits ground the candidate choices below; the candidate must not copy the baseline's unbounded general wait.

| Resource or observation   | Candidate experiment rejection condition                                                                                                                                                                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Process/CPU allocation    | More than one Uvicorn API worker or more than two allocated logical CPUs. No in-process publisher, state scheduler or child bulk worker.                                                                                                                                                     |
| PostgreSQL request pool   | More than 10 checked-out/open request connections; initial min 0, max 10. Exactly one additional dedicated autocommit LISTEN connection, no spare reconnect overlap. Maximum 11 API database sessions.                                                                                       |
| Request admission         | More than 32 active non-SSE application requests, 32 queued waiters or 64 total admitted/pending non-SSE requests. Reject excess without starting SQL; queue wait over 2000 ms is failure.                                                                                                   |
| Pool acquisition          | Any acquisition wait over 2000 ms or more than 32 pending acquisitions. A timed-out/cancelled waiter must not later retain a connection.                                                                                                                                                     |
| SQL/locks/transaction     | Read/write statement timeout 5000 ms, lock timeout 2000 ms, complete transaction timeout 10000 ms. No idle transaction beyond 10000 ms; cancellation must settle rollback/receipt before releasing ownership.                                                                                |
| Password work             | More than four active scrypt derivations or any password-work backlog. Keep 20 attempts/address/15 minutes and at most 10000 tracked addresses; preserve QR's existing independent budgets.                                                                                                  |
| SSE admission/queue       | More than 32 experiment subscribers. Keep at most one coalesced invalidation and one reset/recovery control event per subscriber; no document payloads or durable replay. No queued payload over 16 KiB per subscriber.                                                                      |
| SSE deadlines             | Setup/operation over 5000 ms; skipped 10000 ms revalidation or 15000 ms heartbeat; slow consumer still retained after 30000 ms plus 1000 ms timer tolerance. Admission does not retain a request-pool connection for an idle stream.                                                         |
| Bounded-read latency      | Any matched cohort p95 over 250 ms or p99 over 750 ms. Also reject p95 over `max(Node p95 * 1.20, Node p95 + 10 ms)` or p99 over `max(Node p99 * 1.25, Node p99 + 20 ms)`.                                                                                                                   |
| Mutation/readback latency | Any matched cohort p95 over 350 ms or p99 over 1000 ms, including successful original receipt readback. Apply the same relative p95/p99 gates separately to original writes, replays and readbacks.                                                                                          |
| SSE delivery latency      | Write-commit-to-delivery p95 over 250 ms or p99 over 750 ms, or the same relative p95/p99 gates above. Heartbeat latency alone cannot establish invalidation delivery.                                                                                                                       |
| Event-loop responsiveness | Scheduling lag p95 over 20 ms or p99 over 50 ms during ordinary cohorts and concurrent scrypt; identify instrumentation overhead separately.                                                                                                                                                 |
| CPU                       | Average API CPU over 2.0 core-seconds/second or more than 1.25 times matched Node CPU-seconds per completed operation. Reject sustained saturation above 1.9 cores for 30 seconds with growing waiters.                                                                                      |
| Memory                    | API peak RSS over 512 MiB or over `max(Node peak RSS * 1.25, Node peak RSS + 64 MiB)`. Reject post-warmup retained RSS growth over 32 MiB between first and last measured minute, after equivalent settled workload.                                                                         |
| API temporary storage     | Peak over 64 MiB, or more than 1 MiB of task-owned transient data remaining 30 seconds after settled completion. This read/mutation/SSE experiment needs no persistent Scan objects.                                                                                                         |
| PostgreSQL temp/SQL work  | Any spill to PostgreSQL temp files for these bounded requests, any unexplained extra application query per class, or more than 1.25 times matched Node SQL CPU proxy via total execution time per operation. Record actual SQL timing rather than labelling it measured CPU.                 |
| Errors and recovery       | Any unexpected non-2xx in ordinary cohorts, unexplained wire difference, changed original receipt, duplicate effect, stale authority, cross-account event or unbounded queue is immediate rejection. Expected conflict/admission errors are reported separately, never counted as successes. |
| Shutdown                  | SSE admission closes first, then requests/work/listener/pool settle within 15000 ms. No task-owned active SQL, leaked session, accepted-but-unrecorded effect or residual listener afterward. Send only graceful shutdown to verified task-owned processes.                                  |

A gate fails if any matched measured cohort exceeds it; do not average a failing run away.
If Node itself exceeds an absolute threshold, record that baseline failure and revisit the experiment design through review before claiming candidate acceptance.
Do not silently relax a threshold after seeing results.
Baseline measurement, independent numeric-gate acceptance and candidate acceptance are separate evidence.
Worker relocation retains the existing publisher-specific download/parse/publication/import budgets; P13 records those exact defaults and total process/storage budgets without borrowing the API's 64 MiB temporary-space allowance.

## P01 verification and remaining evidence

The focused Node/schema checks exercise the unchanged structural artifact, actual registry and sanitized compatibility cases.
They establish neither Python execution nor measured performance.
The first Python API/core package must add its lock/lint/type/tests/negative import checks and CI path selection immediately, through the designated integration writer.
Automatic CI remains scoped; Android and heavy database/HTTP/SavedState/application runs stay manually triggered.
No shared CI, root manifest, launcher or lifetime-construction edits are needed by P01.

The P01 handoff records exact commands/results, tested base/head and clean working state with the commit.
Transient development failures are retained in the handoff, with their fixes and final checks.
Real PostgreSQL receipt/transaction/race evidence, dual-runtime HTTP, candidate measurements, full Catalog/scale, actual Scan/S3/provider paths, rendered clients, physical Android/Keystore, deployed proxy and scheduled observations remain unexecuted by this Slice.
Their implementing Slice owners collect them; P17 owns integrated acceptance and rollback evidence, and Kyle owns target acceptance and separately authorized production release.
No P01 pass should be recorded as any of those target passes.
