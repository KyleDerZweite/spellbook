# ADR-0026: Python migration framework and delivery contract

- Status: Accepted; performance/resource readiness requirements superseded by ADR-0027; interface and cross-version compatibility requirements superseded by ADR-0029
- Implementation: Complete source candidate implemented and unmerged; owner testing and production cutover pending
- Date: 2026-10-19
- Last Reviewed: 2026-10-25
- Owners: Kyle
- Source of Truth: maintainer-accepted migration contract for issue 211, independent Sol/Astra reviews and Kyle's 2026-10-20 execution direction
- Update Triggers: ADR-0029 pre-release compatibility supersession, ADR-0028 route/module supersession, explicit partial supersession by ADR-0027, complete unmerged implementation scope, integration ownership, source preparation versus production operations, independent review, maintainer acceptance, framework or schema ownership changes, migration gates
- Related Docs: [ADR-0029](./0029-remove-replaced-interfaces.md), [Migration contract](../architecture/python-backend-migration.md), [ADR-0025](./0025-python-api-and-workers.md), [Independent applications](../architecture/independent-applications.md), [Postgres](../architecture/postgres.md), [Worker](../architecture/worker.md), [Issue 211](https://github.com/KyleDerZweite/spellbook/issues/211), [Functional Python acceptance](./0027-python-functional-migration-acceptance.md)

[ADR-0027](./0027-python-functional-migration-acceptance.md) supersedes this decision's strict resource/performance readiness requirements and historical execution-model assignments.
The language, component boundaries, final unmerged artifact and separate production authority remain accepted; current stack and acceptance requirements follow the migration contract.
The text below records the earlier decision; the [current migration contract](../architecture/python-backend-migration.md) owns delivery requirements.

[ADR-0029's 2026-10-25 extension](./0029-remove-replaced-interfaces.md#pre-release-extension-2026-10-25) supersedes the historical requirements below for Node wire parity, stored-data upgrades and compatible Node rollback.
Native FastAPI/Pydantic may replace compatibility adapters; current-version auth, account isolation, receipt replay and safe writes remain required.
The historical record below does not override the [current migration contract](../architecture/python-backend-migration.md).

## Context

ADR-0025 selects Python for the HTTP API and every server worker.
The running baseline at `7d88678` remains TypeScript/Node, with existing Python Catalog/Scan workers.
Framework, wire/schema ownership, delivery and rollback need a reviewed contract before implementation readiness.
Existing SQL, account data, credentials, original receipts, transaction semantics and client behavior must survive the port.

## Decision

Use FastAPI/Uvicorn and Psycopg 3 with explicit SQL and no ORM.
Reuse libraries already used by the Python workers instead of introducing another web/data framework.
Django's model/migration ownership and an additional SQLAlchemy/Alembic layer would add competing schema responsibility without a requirement here.
Keep backend-owned, language-neutral OpenAPI and executable fixtures under `contracts/`; retain handwritten clients initially.
Retain Drizzle as sole production migration owner during the API port, preserve SQL/journal/snapshots and require a separate verified Python migrator handoff.
Prepare and rehearse that handoff as part of the complete unmerged source artifact before production cutover; actual migrator rollout remains a later authorized operation.

Group API, shared application/SQL modules and independent Catalog, Scan and state-runner packages under `backend/` as detailed in the [migration contract](../architecture/python-backend-migration.md).
Deliver useful dormant slice PRs against `main`, with explicitly based stacks allowed.
Complete source activation, Python migrator preparation and Node server source contraction on `integration/python-backend-migration`; leave the final integration artifact unmerged for review.
Root orchestrates only and may merge verified slices and reviewed safe Dependabot PRs.
Before API/worker parallelism, root appoints and records one named shared-file integration writer, distinct from root, for shared CI, manifests, launchers, route registry and lifetime construction.
Python remains inactive in production until complete parity and rollback evidence support the separately authorized API cutover.
Preserve one active mutation/publisher/scheduler owner and separate API/worker processes and resources.

## Consequences

Explicit compatibility adapters must preserve validation, Auth/QR, JSON fingerprints, original receipts, conflicts and bounded SSE instead of inheriting framework defaults.
Separate state runners preserve existing leases and transactional effects while removing scheduled work from the future HTTP process.
Retaining the Node artifact and compatible data enables rollback after Python writes without discarding accepted changes.
Kyle accepted the direction on 2026-10-20 subject to the additional GPT-6 Astra Medium review, which found no blockers.
Design acceptance establishes neither implementation, a performance claim nor release authorization.
Kyle subsequently authorized complete implementation through GPT-6.1-Sol High subagents, necessary reversible candidate experiments and manually invoked validation on 2026-10-20.
This authorizes completing and verifying the source artifact without executing P18 production cutover, P19 production migrator rollout or P20 end of the real rollback window.
Retain the tested Node rollback artifact and compatible data even when the integration branch removes replaced Node server source.

## Follow-Up

Reconcile existing slice-PR tickets to the accepted execution scope before affected implementation, preserving operational acceptance separately from source completion.
The [implementation epic](https://github.com/KyleDerZweite/spellbook/issues/245) owns native sub-issues, blocking relationships and evidence gates.
The earlier contract required each ticket to carry reviewed responsibilities, dependencies, resource limits and acceptance evidence.
ADR-0027 replaces the strict resource-proof prerequisite with functional acceptance.
Map tests to the runtime they actually exercise and enable Python CI with the first API/core package.
Experiments and manually invoked heavy integration/Android validation are within the implementation scope; keep their triggers manual and record unavailable target evidence.
P19/P20 preparation must not depend on executing production gates or falsely close their operational acceptance.
Refresh evidence on the final integration head after migrator preparation and source contraction.
Production release operations retain their separate concrete authorization under the contract.

## References

- [FastAPI async behavior](https://fastapi.tiangolo.com/async/), [error adapters](https://fastapi.tiangolo.com/tutorial/handling-errors/) and [lifespan](https://fastapi.tiangolo.com/advanced/events/)
- [Psycopg pools](https://www.psycopg.org/psycopg3/docs/advanced/pool.html) and [cancellation](https://www.psycopg.org/psycopg3/docs/advanced/async.html)
- [OpenAPI 3.1](https://spec.openapis.org/oas/v3.1.0.html)

[ADR-0028](./0028-versioned-game-api.md) supersedes prior API-path and module-location immutability for the versioned shared/MTG API.
[ADR-0029](./0029-remove-replaced-interfaces.md) supersedes requirements to retain old HTTP paths, frozen route inventories and dual-runtime HTTP comparisons.
Only current canonical routes remain; older clients must update.
The 2026-10-25 extension above further supersedes cross-version compatibility requirements; separate production authority remains unchanged.
