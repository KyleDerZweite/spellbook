# Python migration evidence baseline

- Status: Canonical compatibility baseline and verification references
- Last Reviewed: 2026-10-24
- Source of Truth: frozen compatibility fixtures, current Python code/tests, PR 276 and ADR-0027
- Update Triggers: completed source activation and server contraction, current verification references, compatibility inventory and functional test ownership
- Related Docs: [Migration contract](./python-backend-migration.md), [ADR-0027](../decisions/0027-python-functional-migration-acceptance.md), [Contracts](../../contracts/README.md), [Independent applications](./independent-applications.md), [Auth](./auth.md), [Postgres](./postgres.md), [Verification](../operations/github-automation.md), [Deployment](../operations/deployment.md), [Issue 247](https://github.com/KyleDerZweite/spellbook/issues/247)

## Scope and authorization

P01 extracted the Node compatibility baseline from `b835eee87ff0e92e99df18ab384602e48183a88d`.
The existing neutral schema, inventories and fixtures remain useful inputs to the Python port.
The unmerged candidate activates Python API/Core and workers by default; owner testing and production operations remain separate.
The [migration contract](./python-backend-migration.md) owns practical acceptance and delivery.

[ADR-0027](../decisions/0027-python-functional-migration-acceptance.md) retires P01 numeric rejection gates, matched-resource cohorts, the D2 measurement envelope and Linux/kernel/Collector proof as prerequisites.
Modest performance variance, slow background jobs and controlled retries are acceptable when functional behavior is correct.
No benchmark, resource-verifier implementation or #248 strict proof is required before domain porting.
The unselected lifecycle/PARKED proposal supplies no requirement.
Historical protocols and review details remain in the [pre-reconciliation revision](https://github.com/KyleDerZweite/spellbook/blob/1bae6638e9bb521630401a74e6eaeab3eac371f9/docs/architecture/python-migration-evidence-baseline.md).
They are history, not current acceptance gates.

## Frozen artifact and implementation contract

[`contracts/openapi.json`](../../contracts/openapi.json) owns the language-neutral structural schema.
The Python [adapter](../../backend/api/src/spellbook_api/http/application.py) reads the bundled artifact and changes only `servers` for the public origin.
The original builder's `JSON.stringify(openapi('/'))` SHA-256 is `2278d5ffc597f59dde47974b9d4835a849be9abe5f023870c2ccbde801ce6979`.
That extraction hash records the original Node schema provenance.
Python response serialization and golden fixtures preserve the accepted wire semantics.

Backend owns validation and wire semantics.
Contracts contains schemas and sanitized data, while existing TypeScript helpers and handwritten TypeScript/Kotlin clients remain.
The API HTTP adapter depends on application modules; persistence, workers and domain validation do not depend on the schema adapter.
No new runtime dependency, generic fixture engine, generated client or duplicate framework schema owner is introduced.
The activation writer owns route assembly, application lifetime, CI, root manifests and launchers.

## Complete ownership inventory

The canonical [machine-readable inventory](../../contracts/compatibility/inventory.json) enumerates every method/path separately with its frozen Node owner and migration slice.
The assembled Python registry is compared directly with every API operation in this neutral baseline.
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
The Python router preserves one trailing slash and decodes named path segments after matching.
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

All ten runtime responsibilities have explicit inventory rows, including the API host, dedicated SavedState LISTEN owner, formerly embedded ValueHistory and WholeDeckCategory runners, independent Catalog scheduler, Catalog/paired Price publisher, optional prices, Oracle Tags, Combo and Scan scaffold.
The four publisher responsibilities run serially under the Catalog scheduler's existing process, not four new processes.
ValueHistory polls every 10 seconds under advisory lease `78173020462008`.
WholeDeckCategory polls every second, debounces for 250 ms and uses a 30-second lease with generation/token/revision fences and up to 60-second backoff.
The independent State package now owns both scheduled runners; synchronous transaction effects remain with their Core application owners.
P13 preserves publisher locks, COPY/publication/pointers/pruning and source-specific limits without changing schema ownership.
P16 owns password/Demo operator entrypoints and packaging; P19 owns the later one-shot migrator handoff.
The default one-shot Python migrator retains the exact 25-entry Drizzle ledger and SQL history.

## Compatibility and evidence transfer

The [golden data](../../contracts/compatibility/golden.json) contains only synthetic public values.
The [transfer map](../../contracts/compatibility/transfer.json) explicitly lists every case ID and its Node-direct executor, required dual-runtime HTTP scenario and required Python application transfer.
Its completeness check rejects unmapped or duplicate fixture IDs.
The targeted tests use existing production decoders, conflict serializers, Auth selection, command handlers and Inventory replay/normalization seams.
The original baseline used the Node HTTP bridge; current host checks execute installed Python on owned TCP ports.
HTTP adapter tests use the real router with stubbed application methods.
The original Node receipt unit tests established replay decisions only; current Python PostgreSQL and retained-artifact HTTP checks exercise actual transactions and persisted acknowledgements.

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
Replaced TypeScript server tests and direct-import consumers were removed after transfer to Python Core/API suites and external HTTP tests.
Frontend product, window, native-action and browser tests remain.
P03 transfers Auth/session/Profile/QR transaction/race tests; P04/P05 transfer Catalog, Inventory, Groups, receipt and conflict tests.
P06/P15 transfer public/private Valuation/history/Dashboard/capture; P07/P09/P11/P12 transfer entry/Library/whole/Combo evaluation and jobs.
P08/P10 transfer Deck reads/availability/metadata/composition/imports; P14 transfers Scan persistence/storage/commit cleanup; P16 transfers operators.
Record transferred test names, commands and tested revisions in the existing PR change record.
P17 runs the existing built HTTP suites against both endpoints, actual PostgreSQL, Scan worker and two-process SavedState, plus Node-to-Python-to-Node replay after Python writes.
A test name containing HTTP does not prove Python if the fixture still constructs or launches Node.

## Verification and handoff

[Repository verification](../operations/github-automation.md#python-api-and-core) owns reproducible setup, package checks, installed-wheel checks and guarded PostgreSQL commands.
[Deployment](../operations/deployment.md#local-development) owns normal Python startup commands.
Use [integration PR 276](https://github.com/KyleDerZweite/spellbook/pull/276) for tested revisions, exact commands, results, skipped coverage and remaining target checks.
Keep transient run totals in that change record instead of parallel per-slice logs here.

At source `3bcaf54e38e791d100259ec48b13aef7334c7d3f`, all domain implementations, Deck assembly, closed web commands, default Python launchers, independent workers and replaced Node source/test contraction are integrated.
Independent Standards and Spec reviews accepted the domain and activation changes after correcting native Catalog storage, successful manual completion and the retained operator forwarder.
SQL history, canonical Demo assets, shared contracts and Android source remain unchanged.
The separate password success-reload correction preserves the existing SavedState architecture.

Executed integration includes disposable PostgreSQL transactions, conflicts, account isolation, jobs and publications; installed migrator/operator rehearsal; original receipts and Node-to-Python-to-Node writes on the same data; two Python replicas, proxy SSE and listener recovery.
Root exercised registration, Catalog search, Inventory addition, Deck creation/composition and Dashboard through the built web/API containers at desktop and narrow layouts.
A real multipart upload reached local storage and the actual Scan scaffold over TCP.
The built State container completed an enqueued job and exited cleanly on SIGTERM.
These are functional observations, not production deployment or provider-target acceptance.

## Remaining target evidence

Operator-owned S3 and live external-provider refreshes, a naturally scheduled daily value observation and physical Android/Keystore journeys remain unexecuted in this session.
Local storage, protocol fixtures and PostgreSQL capture/DST tests do not establish those target results.
Scan recognition intentionally retains the existing `no_match` scaffold.
Owner review of the completed candidate remains separate from technical checks.

Production API cutover, productive migrator rollout and ending the real rollback window require separate operations.
The tested Node rollback artifact and current protected PostgreSQL runtime remain available.
Obsolete local benchmark, Collector, review and remedy corpuses were removed; they are no longer execution inputs.
Historical baseline results and superseded protocols remain in Git history at the linked pre-reconciliation revision.
