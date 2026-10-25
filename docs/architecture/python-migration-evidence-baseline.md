# Python migration functional evidence

- Status: Canonical functional evidence responsibilities
- Last Reviewed: 2026-10-25
- Source of Truth: current Python code/tests, OpenAPI, useful synthetic fixtures, ADR-0029 and PR 276
- Update Triggers: native implementation and evidence ownership, pre-release compatibility supersession, native FastAPI/Pydantic acceptance, current-route acceptance, installed Python runtime, fixture ownership, stored-data correctness and target evidence
- Related Docs: [Migration contract](./python-backend-migration.md), [ADR-0027](../decisions/0027-python-functional-migration-acceptance.md), [ADR-0029](../decisions/0029-remove-replaced-interfaces.md), [Contracts](../../contracts/README.md), [Independent applications](./independent-applications.md), [Auth](./auth.md), [Postgres](./postgres.md), [Verification](../operations/github-automation.md), [Deployment](../operations/deployment.md)

## Scope and authorization

The unmerged candidate uses Python API/Core and independent workers by default.
The [migration contract](./python-backend-migration.md) owns functional acceptance and delivery; production operations require separate authorization.
[ADR-0027](../decisions/0027-python-functional-migration-acceptance.md) retires strict performance/resource, Linux/kernel and Collector proof prerequisites.
[ADR-0029](../decisions/0029-remove-replaced-interfaces.md) removes replaced interfaces immediately, including old API paths, route inventories, transfer maps and dual-runtime HTTP comparison runners.
Its 2026-10-25 extension removes cross-version API/stored-data upgrade guarantees and historical Node wire parity requirements.
Current authentication, account isolation, safe writes and receipt replay within the current version remain required.
Historical extraction hashes, Node comparisons and superseded proof protocols remain in Git history, not current acceptance inputs.

## Current contracts and fixture ownership

[`contracts/openapi.json`](../../contracts/openapi.json) is the sole current route inventory and structural wire contract.
The API serves 85 canonical operations plus Discovery; seven browser page methods remain web-owned.
Native route tests compare complete operation sets, reject extra operations and assert representative removed paths return 404.
Route counts alone establish no functional result.
The Python adapter reads the bundled artifact and substitutes the configured public origin.
Backend owns route-specific validation, authorization, limits and error semantics; client helpers and handwritten TypeScript/Kotlin clients retain their owners.

[`contracts/fixtures/wire.json`](../../contracts/fixtures/wire.json) retains synthetic public parsing, fingerprint, password, conflict and receipt vectors.
Retain fixtures that verify current parsing, password security, conflicts and receipt replay.
When native FastAPI/Pydantic replaces a historical Node behavior, update current callers/contracts and remove the superseded fixture assertions and code together.
Exact Node JSON/UTF-16/encoding quirks and legacy stored-receipt formats are not compatibility obligations.
Fixtures contain no copied account credentials or private receipts.

Python Core tests verify current normalization, deterministic fingerprints and replay decisions.
API tests verify the selected current validation and transport behavior, including ordered cookies, conflicts, command authority, cache/Origin policy and SSE ownership.
Application doubles establish adapter behavior; they do not establish PostgreSQL locks, persisted acknowledgements or atomicity.
Real PostgreSQL tests must verify account isolation, transaction races and original current-version acknowledgements after later edits/deletion/recreation.
Safe writes, exact domain numbers and accepted effects remain required; retained-data upgrades and unchanged SQL history across commits do not.

## Runtime evidence responsibilities

[Repository verification](../operations/github-automation.md#python-api-and-core) owns pinned setup, package checks, installed-wheel checks and guarded database procedures.
Manual `backend/api/tests/native_host_acceptance.py` exercises the installed Python production app using `P02B_INSTALLED_PYTHON` and the existing exclusive target guard.
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

## Native implementation evidence 2026-10-25

The candidate implements all canonical operations plus Discovery through native FastAPI routing, dependencies and global exception handlers.
Strict Pydantic command models and current-version Core fingerprints/receipts replace the removed custom dispatch and historical compatibility adapters.
The [dated wiki summary](../wiki/python-backend-standardization.md#implementierungsstand-und-evidenz-vom-2026-10-25) links immutable implementation and review sources.
Use [PR 276](https://github.com/KyleDerZweite/spellbook/pull/276) and the [runtime record](t3-thread://v1/thread:delegated-task:command%3Amcp%3A9e10a3f5-df85-461c-b846-8bcb828bdbf2%3Adelegate-task%3Aspellbook-native-functional-verification-stage1-20261025-r1) for exact tested revisions, transferred evidence, failed attempts, cleanup limits and final integrated results.

## Remaining target evidence

Operator-owned S3 and live external-provider refreshes, a naturally scheduled daily value observation and physical Android/Keystore journeys remain target-owner checks.
Local storage, protocol fixtures and PostgreSQL capture/DST tests do not establish those target results.
Scan recognition retains the existing `no_match` scaffold.
Owner acceptance remains separate from technical checks.
Production API cutover and productive migrator rollout have not been performed.
Source removal does not authorize deleting retained production artifacts or data.
Operational recovery must protect accepted writes under its authorized procedure; cross-version data compatibility and Node rollback are not source acceptance requirements.
