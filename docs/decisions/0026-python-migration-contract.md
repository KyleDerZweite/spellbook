# ADR-0026: Python migration framework and delivery contract

- Status: Accepted
- Implementation: Migration not started
- Date: 2026-10-19
- Last Reviewed: 2026-10-20
- Owners: Kyle
- Source of Truth: maintainer-accepted migration contract for issue 211 and independent Sol/Astra reviews
- Update Triggers: independent review, maintainer acceptance, framework or schema ownership changes, migration gates
- Related Docs: [Migration contract](../architecture/python-backend-migration.md), [ADR-0025](./0025-python-api-and-workers.md), [Independent applications](../architecture/independent-applications.md), [Postgres](../architecture/postgres.md), [Worker](../architecture/worker.md), [Issue 211](https://github.com/KyleDerZweite/spellbook/issues/211)

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
Retain Drizzle as sole migration owner during the API port, preserve SQL/journal/snapshots and require a separate verified Python migrator handoff.

Group API, shared application/SQL modules and independent Catalog, Scan and state-runner packages under `backend/` as detailed in the [migration contract](../architecture/python-backend-migration.md).
Deliver useful PRs against `main`, with Python inactive until complete parity and rollback evidence support one API cutover.
Preserve one active mutation/publisher/scheduler owner and separate API/worker processes and resources.

## Consequences

Explicit compatibility adapters must preserve validation, Auth/QR, JSON fingerprints, original receipts, conflicts and bounded SSE instead of inheriting framework defaults.
Separate state runners preserve existing leases and transactional effects while removing scheduled work from the future HTTP process.
Retaining the Node artifact and compatible data enables rollback after Python writes without discarding accepted changes.
Kyle accepted the direction on 2026-10-20 subject to the additional GPT-6 Astra Medium review, which found no blockers.
Design acceptance establishes neither implementation, a performance claim nor release authorization.

## Follow-Up

Derive slice-PR tickets from the accepted migration contract and its completed independent reviews.
The [implementation epic](https://github.com/KyleDerZweite/spellbook/issues/245) owns native sub-issues, blocking relationships and evidence gates.
Each ticket must carry its reviewed responsibilities, dependencies, resource limits and acceptance evidence.
Map tests to the runtime they actually exercise and enable Python CI with the first API/core package.
Experiments, heavy integration/Android runs and release operations remain separately scoped under the contract.

## References

- [FastAPI async behavior](https://fastapi.tiangolo.com/async/), [error adapters](https://fastapi.tiangolo.com/tutorial/handling-errors/) and [lifespan](https://fastapi.tiangolo.com/advanced/events/)
- [Psycopg pools](https://www.psycopg.org/psycopg3/docs/advanced/pool.html) and [cancellation](https://www.psycopg.org/psycopg3/docs/advanced/async.html)
- [OpenAPI 3.1](https://spec.openapis.org/oas/v3.1.0.html)
