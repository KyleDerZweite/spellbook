# ADR-0010: Store and search the catalog in PostgreSQL

- Status: Accepted
- Date: 2026-10-03
- Last Reviewed: 2026-10-03
- Source of Truth: code and product decision
- Update Triggers: search relevance, catalog resource use, deployment requirements, database boundaries
- Supersedes: the MeiliSearch index and publication choices in [ADR-0007](./0007-backend-first-mtg-bulk-import-api.md)
- Related Docs: [Catalog](../architecture/catalog.md), [Worker](../architecture/worker.md), [Deployment](../operations/deployment.md)

Spellbook needs canonical-card search, exact printing resolution, facets, and catalog refreshes while readers remain active. Its self-hosted deployment already requires PostgreSQL for account data. Reducing independently operated services is an explicit requirement.

Use PostgreSQL 18 for both the catalog and account-owned data. Combine full-text search, `pg_trgm`, and structured SQL filters behind authenticated SvelteKit routes. Publish complete catalog generations transactionally and retain the previous generation. Remove MeiliSearch, its SDKs, keys, browser origin, and service configuration.

This reduces service and credential setup and gives catalog publication the database's transaction guarantees. Catalog reads, indexes, and refreshes now share CPU, memory, disk, and connection capacity with account transactions. The decision does not claim a measured full-catalog performance improvement. Production-size latency, ingestion duration, and resource measurements remain necessary before setting hosted capacity targets.

Measure catalog latency, publication duration, memory, disk use, and account-transaction latency under a representative multilingual snapshot. Tune query and resource limits within the selected PostgreSQL architecture. The existing TypeScript application and Python ingestion boundary remains unchanged.
