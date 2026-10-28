# ADR-0027: Functional acceptance for the Python migration

- Status: Accepted; interface and cross-version compatibility requirements superseded by ADR-0029
- Implementation: Source merged through PR 276 on 2026-10-25; owner testing and production operations remain separate
- Date: 2026-10-23
- Last Reviewed: 2026-10-28
- Owners: Kyle
- Source of Truth: Kyle's authoritative 2026-10-23 migration direction
- Update Triggers: merged PR 276 status reconciliation, ADR-0029 pre-release compatibility supersession, ADR-0028 route/module supersession, migration acceptance, superseded readiness blockers, functional evidence, source activation and production authority
- Related Docs: [ADR-0029](./0029-remove-replaced-interfaces.md), [ADR-0025](./0025-python-api-and-workers.md), [ADR-0026](./0026-python-migration-contract.md), [Migration contract](../architecture/python-backend-migration.md), [Evidence baseline](../architecture/python-migration-evidence-baseline.md), [Verification](../operations/github-automation.md)

[ADR-0029's 2026-10-25 extension](./0029-remove-replaced-interfaces.md#pre-release-extension-2026-10-25) supersedes the historical requirements below for Node wire parity, stored-data upgrades and compatible Node rollback.
Native FastAPI/Pydantic may replace compatibility adapters; current-version auth, account isolation, receipt replay and safe writes remain required.
[PR 276](https://github.com/KyleDerZweite/spellbook/pull/276) merged the implementation on 2026-10-25.
The historical record below describes the original delivery decision and does not override the [current migration contract](../architecture/python-backend-migration.md).

## Context

The accepted Python stack and reusable foundation exist, but strict P01 numeric/resource proof requirements block domain delivery.
Kyle selected completion of the functional migration on 2026-10-23 and accepts modest performance variance, long asynchronous jobs and ordinary controlled retries.
This decision supersedes the performance/resource readiness requirements of ADR-0026 and its former contract/evidence documents.
ADR-0025's language choice and ADR-0026's stack, component boundaries, compatibility and separate production authority remain accepted.

## Decision

Finish the FastAPI/Uvicorn and Psycopg 3 implementation with typed Core application/SQL modules shared by HTTP and workers, no ORM and no new broker.
Require existing API/wire/schema behavior, authentication/account isolation, preserved data/credentials, transaction correctness, idempotency and correct worker effects.
Use real PostgreSQL functional acceptance, actual integration tests, migrator rehearsal and same-data rollback evidence.
Mocks, route counts and historical Node results do not establish full Python compatibility.

Remove strict P01 latency/CPU/RSS/storage gates, matched-resource proof, Collector validation and Linux/kernel proof as implementation prerequisites, including #248's performance-only blockers.
The unselected `linux_owned_lifecycle_v1`/PARKED proposal is superseded and supplies no accepted requirement.
No new resource-verifier package, formal ownership/receipt layer, kernel research or evidence directory hierarchy is required.
Preserve existing application mutation receipts and functional limits, safe transaction cleanup, controlled retries, leases/fencing and graceful shutdown.

Complete Python migrator preparation, Python default activation and removal of the replaced TypeScript server and obsolete tests in the unmerged integration candidate.
Transfer functional coverage and consumers before removing old server source/tests.
Preserve Svelte/TypeScript frontend, shared client DTOs/validators, Android, database data and existing SQL migration history.
Retain the tested Node rollback artifact and compatible data for rehearsal and future production recovery.
Production cutover, productive migrator rollout and the end of the real rollback window remain separate operations.

## Consequences

Domain implementation may proceed on its functional dependencies without #248 strict resource proof.
The owning migration contract defines a small delivery sequence and evidence requirements.
Withdraw obsolete performance-only blockers and readiness assumptions until affected tickets are reconciled; retain real domain dependencies and unexecuted functional work.
Documentation reconciliation does not change tracker state, complete implementation or authorize production operations.
Migration-specific CI/start/packaging changes remain required in their source slices; this decision selects no general CI rewrite.
Historical numeric protocols and reviews remain in Git history and do not govern current readiness.

[ADR-0028](./0028-versioned-game-api.md) supersedes prior API-path and module-location immutability for the versioned shared/MTG API.
[ADR-0029](./0029-remove-replaced-interfaces.md) supersedes requirements to retain old HTTP paths, frozen route inventories and dual-runtime HTTP comparisons.
Only current canonical routes remain; older clients must update.
The 2026-10-25 extension above further supersedes cross-version compatibility requirements; separate production authority remains unchanged.
