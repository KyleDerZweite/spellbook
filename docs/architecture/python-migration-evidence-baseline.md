# Python migration functional evidence

- Status: Canonical functional evidence responsibilities
- Last Reviewed: 2026-10-24
- Source of Truth: current Python code/tests, OpenAPI, retained synthetic fixtures and PR 276
- Update Triggers: current-route acceptance, installed Python runtime, fixture ownership, stored-data correctness and target evidence
- Related Docs: [Migration contract](./python-backend-migration.md), [ADR-0027](../decisions/0027-python-functional-migration-acceptance.md), [ADR-0029](../decisions/0029-remove-replaced-interfaces.md), [Contracts](../../contracts/README.md), [Independent applications](./independent-applications.md), [Auth](./auth.md), [Postgres](./postgres.md), [Verification](../operations/github-automation.md), [Deployment](../operations/deployment.md)

## Scope and authorization

The unmerged candidate uses Python API/Core and independent workers by default.
The [migration contract](./python-backend-migration.md) owns functional acceptance and delivery; production operations require separate authorization.
[ADR-0027](../decisions/0027-python-functional-migration-acceptance.md) retires strict performance/resource, Linux/kernel and Collector proof prerequisites.
[ADR-0029](../decisions/0029-remove-replaced-interfaces.md) removes replaced interfaces immediately, including old API paths, route inventories, transfer maps and dual-runtime HTTP comparison runners.
Older clients must update.
Historical extraction hashes, Node comparisons and superseded proof protocols remain in Git history, not current acceptance inputs.

## Current contracts and fixture ownership

[`contracts/openapi.json`](../../contracts/openapi.json) is the sole current route inventory and structural wire contract.
The API serves 85 canonical operations plus Discovery; seven browser page methods remain web-owned.
Registry tests compare complete operation sets, reject extra operations and assert representative removed paths return 404.
Route counts alone establish no functional result.
The Python adapter reads the bundled artifact and substitutes the configured public origin.
Backend owns route-specific validation, authorization, limits and error semantics; client helpers and handwritten TypeScript/Kotlin clients retain their owners.

[`contracts/fixtures/wire.json`](../../contracts/fixtures/wire.json) retains synthetic public parsing, fingerprint, password, conflict and receipt vectors.
Raw JSON and form strings preserve lexical spelling, escaping and CRLF.
Fingerprint vectors preserve normalized JSON, exact UTF-8 bytes and SHA-256, including Unicode, omitted/null fields and numeric serialization.
A serializer vector does not authorize an endpoint to accept an otherwise invalid value.
Existing password vectors preserve textual hex salt as UTF-8, scrypt parameters and UTF-16 password-length rules without re-enrollment.
Fixtures contain no copied account credentials or private receipts.

Python Core tests exercise these vectors and production normalization/replay decisions.
API tests exercise current-route parsing, raw forms, ordered cookies, conflicts, strict command keys, first-value query parsing, HEAD/OPTIONS/405, cache/Origin policy and SSE ownership.
Application doubles establish adapter behavior; they do not establish PostgreSQL locks, persisted acknowledgements or atomicity.
Real PostgreSQL tests must retain account isolation, transaction races, original acknowledgements after later edits/deletion/recreation, and distinct Inventory/Deck null-receipt behavior.
Null hashes receive no fabricated backfill; stored acknowledgements retain their existing semantics.
SQL history, credentials, exact numeric values, private history and accepted writes remain preserved.

## Runtime evidence responsibilities

[Repository verification](../operations/github-automation.md#python-api-and-core) owns pinned setup, package checks, installed-wheel checks and guarded database procedures.
Manual `backend/api/tests/native_host_acceptance.py` exercises the installed Python production registry using `P02B_INSTALLED_PYTHON` and the existing exclusive target guard.
It retains actual process, database, receipt and SSE scenarios without launching a Node API or comparing removed paths.
Node is used only where a built web process is required.
Direct API and same-origin proxy need separate evidence for authentication, raw forms, request limits, QR cookies and streaming.
Real workers/storage/providers, two-process SavedState, listener recovery, safe transaction cleanup and graceful shutdown retain their functional acceptance requirements.
Rendered web and native journeys remain separate from HTTP/component tests.

Use [integration PR 276](https://github.com/KyleDerZweite/spellbook/pull/276) for exact tested revisions, commands, results, skips, review findings and unresolved target evidence.
Refresh affected evidence on the integrated head after source changes.
Keep transient counts and revisions in that change record.

## Activation and contraction 2026-10-23

Python domain implementations, Deck assembly, closed web commands, default launchers, independent workers and removal of replaced Node source/tests are integrated in the unmerged candidate.
Canonical routes, OpenAPI, explicit MTG modules and Web/Android clients are implemented.
Independent Standards and Spec reviews covered domain implementation, activation and canonical clients; current removal changes require integrated review and verification.
The historical acceptance runs exercised disposable PostgreSQL transactions, jobs/publications, installed migrator/operators, original receipts, two Python replicas, proxy SSE and listener recovery.
Built web journeys covered registration, Search, Inventory addition, Deck composition and Dashboard at desktop and narrow layouts.
A multipart upload reached local storage and the Scan scaffold over TCP.
An installed State worker completed an enqueued Category job and stopped cleanly on SIGTERM.
These observations establish their recorded scope, not current-head acceptance or production deployment.

## Remaining target evidence

Operator-owned S3 and live external-provider refreshes, a naturally scheduled daily value observation and physical Android/Keystore journeys remain target-owner checks.
Local storage, protocol fixtures and PostgreSQL capture/DST tests do not establish those target results.
Scan recognition retains the existing `no_match` scaffold.
Owner acceptance remains separate from technical checks.
Production API cutover, productive migrator rollout and ending the real rollback window require separate operations.
Source removal does not authorize deleting retained production artifacts or data.
Any production recovery must preserve accepted writes, stored receipts and SQL history; obsolete client interfaces are not a support obligation.
