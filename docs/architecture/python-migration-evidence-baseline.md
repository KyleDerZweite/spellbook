# Python migration evidence baseline

- Status: Canonical compatibility baseline; complete Python functional acceptance pending
- Last Reviewed: 2026-10-23
- Source of Truth: frozen Node code and executable neutral fixtures, historical PostgreSQL results, ADR-0027 and Kyle's 2026-10-23 direction
- Update Triggers: compatibility inventory/transfer, functional integration evidence, tested revisions, host/Dashboard/Scan assembly and installed operator assets, migrator rehearsal and source activation
- Related Docs: [Migration contract](./python-backend-migration.md), [ADR-0027](../decisions/0027-python-functional-migration-acceptance.md), [Contracts](../../contracts/README.md), [Independent applications](./independent-applications.md), [Auth](./auth.md), [Postgres](./postgres.md), [Verification](../operations/github-automation.md), [Deployment](../operations/deployment.md), [Issue 247](https://github.com/KyleDerZweite/spellbook/issues/247)

## Scope and authorization

P01 extracted the Node compatibility baseline from `b835eee87ff0e92e99df18ab384602e48183a88d`.
The existing neutral schema, inventories and fixtures remain useful inputs to the Python port.
The current foundation also includes dormant Python API/Core; its presence establishes no full parity claim.
The [migration contract](./python-backend-migration.md) owns practical acceptance and delivery.

[ADR-0027](../decisions/0027-python-functional-migration-acceptance.md) retires P01 numeric rejection gates, matched-resource cohorts, the D2 measurement envelope and Linux/kernel/Collector proof as prerequisites.
Modest performance variance, slow background jobs and controlled retries are acceptable when functional behavior is correct.
No benchmark, resource-verifier implementation or #248 strict proof is required before domain porting.
The unselected lifecycle/PARKED proposal supplies no requirement.
Historical protocols and review details remain in the [pre-reconciliation revision](https://github.com/KyleDerZweite/spellbook/blob/1bae6638e9bb521630401a74e6eaeab3eac371f9/docs/architecture/python-migration-evidence-baseline.md).
They are history, not current acceptance gates.

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
| Inventory/Groups/imports                      |                         16 | P04 reads/Groups/membership/reorder, P05 item writes/imports      |
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

## Functional evidence and remaining transfer

For each implemented domain, transfer the relevant direct application tests and run real PostgreSQL transaction, conflict, receipt/retry and account-isolation scenarios.
Exercise actual workers and failure/retry paths, correct scheduled effects, direct/proxy HTTP and two-process SavedState.
Preserve current functional limits such as validation caps and session revalidation; removing comparative performance gates changes none of those behaviors.
Record exact revision/build, fixture provenance, commands, actual runtime/provider, results and skipped cases.
Keep secrets in protected stores and report references only.
Do not use schema/route counts, mocked providers or prior Node passes as proof of full Python compatibility.

P17 owns complete candidate integration and same-data rollback after Python writes.
P19 owns fresh/retained-database, no-op, interrupted and concurrent Python migrator rehearsals against unchanged SQL history.
P16/P20 own packaging/default activation and replaced-server removal with consumer and functional-test transfer.
Refresh affected evidence on the final unmerged integration head.
Missing real storage/provider, scheduled observation, rendered client or native-device evidence remains explicitly unexecuted with its owner and consequence.
Production cutover, productive migrator rollout and rollback retirement require separate operations and acceptance.

### Integrated domain evidence, 2026-10-23

Root reports 27 unique real PostgreSQL cases passing at integrated source `6837f7966f95eda48f7a12a743ce040f29494636` with the assigned disposable `api_python` target.
The selected files were `test_auth_profile_postgres.py`, `test_catalog_valuation_postgres.py`, native cases in `test_inventory.py` and `test_inventory_groups.py`, and `test_inventory_groups_postgres.py`.
The cases comprise six Auth/Profile/QR, six Catalog/Valuation including 23/25-hour DST dates, nine existing Inventory/Groups and six new Inventory/Groups cases.
They cover authentication races, account isolation, concurrent original receipts and transactional LISTEN/rollback/no-op notifications.
Six additional pure receipt/validation cases passed in the first 22-case sweep; those six are not native PostgreSQL evidence.
Root released the assigned lease with zero sessions.
Root also reports Core 300, API 264 and state 3 unit cases passing at the same `6837f79` source; these are distinct from the 27 PostgreSQL cases.

Both independent Auth and Catalog Standards reviews were clean.
Their Spec reviews found multipart quoted-printable credential decoding and repeated Catalog query selection respectively; passing database tests did not close those adapter findings.
The shared assembly fixes the multipart behavior against actual Node 26.10.0: `functional=20password` stays literal, exact lowercase `base64` decodes, and `8bit`/uppercase `BASE64` stay literal.
Credential-route tests cover login/registration, first duplicate values and malformed UTF-8/file bytes.
Root integrated the first-query fix as `91f23f281439120ba686bec4e119b11c2108fd24`.
Root and the independent reviewer report 38 fresh passes for that fix; the repeated-query finding is closed.
Root owns final-head review and real Dashboard/direct-host/proxy/worker/rollback integration; this earlier domain run does not establish those results.

The shared assembly based on `6837f7966f95eda48f7a12a743ce040f29494636` passes `SPELLBOOK_TEST_WHEEL=1 uvx --from uv==0.12.23 uv run --directory backend/api --no-sync pytest -q`: 267 passed, four native guards skipped.
Using that API environment after a frozen Core reinstall, `pytest -q ../core/tests` passes 309 cases with 46 guarded skips; the new real Dashboard case is among the unexecuted native checks.
API/Core Ruff and format checks, strict Mypy, both frozen lock checks, Core/API sdist/wheel builds, the dependency checker and all five boundary unit cases pass.
These checks use Python 3.14.8, uv 0.12.23 and the checkout's own environment, without database, service or provider access.
Four pre-existing Core test import blocks and one API test import block were sorted for Ruff without domain behavior changes.

### Scoped retained-runtime compatibility, 2026-10-23

At `91f23f281439120ba686bec4e119b11c2108fd24`, Root reports two real retained-database original-receipt replay cases passing in both Node-to-Python and Python-to-Node directions with Node 26.10.0 and Python 3.14.8.
Root retained the installed Node artifact and production dependencies at `.local/python-migration-node-rollback` in its checkout.
Actual built HTTP Discovery/Catalog smoke passed.
Node logged into Python-created scrypt credentials, Python accepted the Node session, Python password rotation invalidated the old Node session, and Node accepted the replacement session while the old password failed.
The task-owned Node process exited 0 and its account was cleaned up.
These are scoped credential/session/receipt compatibility checks, not complete rollback or workflow acceptance.

The shared follow-up assembles the completed sixteen Inventory routes and seven Scan routes, registers three operator entrypoints and packages the unchanged four-file Demo fixture set in API wheels/sdists.
Source-agent Scan checks cover local file operations, Boto3 HTTP to an owned protocol fixture, actual scaffold source over TCP, timeout and shutdown.
Real Scan PostgreSQL, API proxy, independently installed worker and operator-owned S3 target evidence remain pending with Root.
Categories, Decks, state packaging, closed web commands and default activation remain later integration work.

With those prerequisites cherry-picked after `4ca78ad3`, the shared follow-up passes `SPELLBOOK_TEST_WHEEL=1 uvx --from uv==0.12.23 uv run --directory backend/api --no-sync pytest -q`: 366 passed and five native guards skipped.
That run includes installed operator help/metadata, direct-wheel and sdist-rebuilt fixture hashes, complete packaged bundle validation, Scan protocol/scaffold adapters and host cleanup failure cases.
`pytest -q ../core/tests/test_operator_fixtures.py ../core/tests/test_inventory_import.py ../core/tests/test_scan.py` in the same frozen-reinstalled API environment passes 121 focused Core cases.
API Ruff/format and strict Mypy, the frozen API lock check, API sdist/wheel build, the dependency checker and all five boundary unit cases pass.
Python 3.14.8 and uv 0.12.23 run these checks in this checkout without database or external-provider access; no container build is claimed.

### Python migrator, 2026-10-23

The prepared migrator at `21758fe0f82981d2567be47b4b6cd48b7ca589e3` passed both independent source-review axes with no findings.
Root ran `pytest -q backend/core/tests/test_migrations_postgres.py backend/core/tests/test_migrations.py backend/api/tests/test_migrate.py` against the checkout sources with Python 3.14.8, Psycopg 3.3.6 and disposable PostgreSQL 18.6: 46 passed, no skips.
The ten PostgreSQL cases cover fresh installation, no-op, a populated six-migration upgrade prefix, invalid ledger refusal, rollback/restart, concurrent exclusion, cancellation recovery and caller-transaction refusal.
The populated upgrade preserves a Unicode Profile and legacy null-hash Inventory receipt; it does not establish every retained-data workflow.

Two actual `python -m spellbook_api.migrate` invocations applied all 25 migrations and then reported no pending work.
The resulting 25 ledger rows match the retained Drizzle-created reference exactly.
Schema-only dumps of `public` and `drizzle` match after excluding ownership, privileges, comments and dump session markers.
The checks used an exclusive temporary database through the protected disposable-runtime environment; no production or previous fixture data was changed.
The shared assembly now bundles exact SQL/journal/snapshot bytes in wheels and sdists and registers `spellbook-migrate`.
Its external installed-wheel check passes without a source `PYTHONPATH`, including a wheel rebuilt from the sdist, asset hashes, missing configuration, explicit override and substituted no-op calls.
That packaging check does not connect to PostgreSQL.
Real installed migrator execution and complete retained-data/client integration remain pending with Root.

## Historical verification provenance

The P01 implementation record identifies `224686dec1ee777728f02f76a224b3bc745d3ec3` for its initial Node/schema checks.
The recorded focused compatibility run passed 86 cases and the native OpenAPI run passed five.
Those checks exercised Node, fixtures and structural ownership, not Python transactions or full compatibility.
The PostgreSQL follow-up at `bc9ebc2d69fbead0a0ad660f9b9e5d150e2b276f` recorded 11 native Node HTTP checks and 50 direct TypeScript integration tests passing without skips.
It covered selected receipts, conflicts, Auth/QR and listener behavior on PostgreSQL 18.6 with the 25-entry Drizzle ledger.
It did not establish separate-process SSE, Python execution, actual Scan/storage/provider integration or production acceptance.
The linked pre-reconciliation revision retains the detailed commands, fixture hashes, other historical checks and cleanup record.
These are historical observations, not reruns at the current head.
No new runtime check or resource measurement is claimed by this reconciliation.
