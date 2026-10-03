# Catalog search rationale

- Status: Canonical research reference
- Last Reviewed: 2026-10-03
- Source of Truth: repository code, functional probes, primary documentation
- Update Triggers: measured catalog resource limits, search requirements, PostgreSQL compatibility
- Related Docs: [Reference](./README.md), [Catalog](../architecture/catalog.md), [Worker](../architecture/worker.md), [ADR-0010](../decisions/0010-postgres-catalog.md), [Backend language](../architecture/backend-language.md)

PostgreSQL is the selected catalog database and search engine. [ADR-0010](../decisions/0010-postgres-catalog.md) records the decision, and the [catalog architecture](../architecture/catalog.md) owns implemented behavior. Reusing the existing database removes a separate search service and its credentials. No full-catalog benchmark establishes a performance advantage over other engines.

## PostgreSQL and embedded search

PostgreSQL provides [full-text search](https://www.postgresql.org/docs/current/textsearch-intro.html), [GIN text indexes](https://www.postgresql.org/docs/current/textsearch-indexes.html), and indexed similarity and substring matching through [`pg_trgm`](https://www.postgresql.org/docs/current/pgtrgm.html). Application SQL defines representative printings, grouping, filters, and facet counts. Transactional generation publication keeps a complete catalog available during refreshes. Catalog work shares database resources with account transactions.

Embedded SQLite could isolate catalog files, but would require a separate publication protocol across application processes. Node 26's [`node:sqlite`](https://nodejs.org/docs/latest-v26.x/api/sqlite.html) is synchronous and has Release Candidate stability. FTS5 does not provide typo matching. Generation-named closed files, a manifest, and request-held database handles could support publication, subject to SQLite's [open-file safety rules](https://www.sqlite.org/howtocorrupt.html). PostgreSQL already supplies the shared transactional boundary.

Functional probes on 2026-10-03 used PostgreSQL 18.6 and SQLite under Node 26.10.0, with five printings representing four canonical cards. Both passed exact, prefix, Japanese-name and CJK substring search, grouping, facets, filters, import resolution, and pagination. PostgreSQL also passed typo matching, concurrent reads during publication, and rollback. These checks establish feasibility on a small fixture, not production capacity or equal multilingual relevance.

## Measurement limits

PostgreSQL remains the implementation target. Measure it with a fixed multilingual Scryfall snapshot before setting hosted capacity targets. Include exact printing IDs, import hints, alternate printings, translated face text, accents, non-Latin scripts, and typing mistakes. Verify selected results and facet counts before throughput.

Measure p95 and p99 latency during normal reads and a full refresh, peak memory, disk usage, publication duration, and account-transaction latency. Include failed publication, concurrent readers, and recovery. Address measured query and resource limits within this architecture before considering a new database decision. The [backend language assessment](../architecture/backend-language.md) treats runtime performance as a separate question.
