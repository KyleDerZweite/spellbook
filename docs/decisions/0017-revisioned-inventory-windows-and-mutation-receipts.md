# ADR-0017: Revisioned Inventory windows and mutation receipts

- Status: Accepted
- Date: 2026-10-06
- Last Reviewed: 2026-10-07
- Owners: Kyle
- Source of Truth: Kyle's Q56 acceptance of the reviewed implementation contract
- Update Triggers: Inventory query addressing, revisions, ordering/collation, writer locking, compact receipts and scale evidence
- Related Docs: [Application contract](../architecture/application-contract.md), [Frontend](../architecture/frontend.md), [Postgres](../architecture/postgres.md), [ADR-0015](./0015-shared-backend-use-cases-and-client-contracts.md), [Decisions](./README.md)

## Context

Slice 3 implements revisioned bounded reads, parent-lock participation, ICU ordering and browser window/list mechanisms. Compact original mutation receipts and stale-field protection remain accepted planned work. Implementation does not establish completed browser or scale acceptance.

Full account snapshots, client-only filtering and unrelated position scans make large Inventory expensive. Paging without revision coherence can mix states. Retry deduplication alone does not return the original operation result after subsequent changes.

## Decision

Kyle accepted bounded offset queries with complete server filtering/counts, PostgreSQL ICU root ordering and stable identity ties in Q56. Every existing Inventory writer joins parent locking and revision advancement before paged reads activate. Single-entry and entry-location reads support inspectors and anchors. Persist minimal original mutation acknowledgements atomically with fingerprinted writes; replay returns the original receipt. Field revisions protect Notes and Description independently. The application contract owns exact limits, lock order, fallback and cache responsibilities.

## Consequences

Offset addressing supports direct windows and native pagination but deep offsets require declared-target benchmarks at 1k, 10k and 50k entries. ICU ordering is server-canonical and version-dependent, with migration preflight and limited local example evidence. Revision resets and retained drafts add client state. Ordinary mutations avoid unrelated scans and full snapshots. Experimental v1 wire changes are expressly accepted; each operation still needs OpenAPI/migration documentation and real acceptance evidence.
