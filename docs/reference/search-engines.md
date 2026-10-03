# Catalog search engine assessment

- Status: Canonical research reference
- Last Reviewed: 2026-10-03
- Source of Truth: repository code, tagged upstream releases, primary documentation
- Update Triggers: search requirements, measured relevance or resource limits, availability requirements, engine releases, licensing or edition changes
- Related Docs: [Reference](./README.md), [MeiliSearch integration](../integrations/meilisearch/README.md), [Worker](../architecture/worker.md), [Catalog upgrade](../operations/meilisearch-upgrade.md), [Backend language](../architecture/backend-language.md)

Retain MeiliSearch for the current catalog. It is actively maintained and already supports Spellbook's keyword, filter, distinct-card, and printing workflows. Typesense and PostgreSQL are credible alternatives, but no Spellbook workload benchmark establishes a performance or operating-cost advantage for either. This assessment does not authorize or describe an implemented engine migration.

## Fit and migration cost

| Choice                                     | Fit for Spellbook                                                                                             | Work and operational tradeoff                                                                                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MeiliSearch                                | Existing search, facets, canonical-card grouping, exact printing lookup, and staged catalog rebuilds          | Keep one search service and its upgrade procedure. Measure current resource use and relevance before replacing it.                                                                               |
| Typesense                                  | Typo-tolerant search, facets, exact filters, grouped results, and built-in replicated high availability       | Rewrite query, facet, ingestion, key, and task adapters. Validate grouping semantics and coordinated cutover of both catalog views. Its searchable index resides in RAM.                         |
| PostgreSQL full-text search with `pg_trgm` | Existing database can combine full-text ranking, trigram similarity, structured filters, and exact ID lookups | Add catalog storage and ingestion, ranking and locale policy, autocomplete, facet SQL, and an application search endpoint. Catalog rebuilds and user transactions then share database resources. |

The [integration documents](../integrations/meilisearch/README.md) own Spellbook's current contracts. Replacing the engine must preserve printing identity, exact import resolution, canonical-card grouping, facet meanings, and concurrent search during ingestion. Engine feature names alone do not establish equivalent behavior.

## Primary evidence

Sources were checked on 2026-10-03. Release observations are dated evidence, not automatic upgrade instructions.

MeiliSearch's stable [v1.54.3 release](https://github.com/meilisearch/meilisearch/releases/tag/v1.54.3) was published on 2026-10-01. Its [security policy](https://github.com/meilisearch/meilisearch/blob/main/SECURITY.md) supports only the latest stable release. Recent releases include an authenticated SSRF fix in [v1.43.1](https://github.com/meilisearch/meilisearch/releases/tag/v1.43.1), authorization fixes for CVE-2026-57823 and CVE-2026-57824 in [v1.48.2](https://github.com/meilisearch/meilisearch/releases/tag/v1.48.2), and a [foreign-index authorization fix](https://github.com/meilisearch/meilisearch/pull/6610). These changes justify maintained versions, not a claim that any version is vulnerability-free.

MeiliSearch [distinct results](https://www.meilisearch.com/docs/capabilities/full_text_search/how_to/configure_distinct_attribute.md) select the highest-ranked document per distinct value. Insertion order does not guarantee a preferred printing. Its [language support](https://www.meilisearch.com/docs/learn/resources/language) addresses tokenization; it does not create translated catalog content. Spellbook's selected Scryfall snapshot determines available records, and the worker's `LANGUAGES` setting currently does not filter ingestion.

Typesense's stable [v30.2 release](https://github.com/typesense/typesense/releases/tag/v30.2) was published on 2026-04-19. Its [search API](https://typesense.org/docs/30.0/api/search.html) provides `group_by`, `group_limit`, `facet_by`, exact `:=` filters, and per-field typo settings. Grouping by `oracle_id` with `group_limit=1` is a candidate replacement for distinct results, but requires a faceted grouping field and verified result and facet counts. [Locales](https://typesense.org/docs/guide/locale.html) are configured per schema field. [Collection aliases](https://typesense.org/docs/30.0/api/collection-alias.html) support collection replacement; do not assume two alias updates reproduce MeiliSearch's atomic two-index swap.

PostgreSQL provides configurable [full-text dictionaries and ranking](https://www.postgresql.org/docs/current/textsearch-intro.html), with [GIN indexes recommended for text search](https://www.postgresql.org/docs/current/textsearch-indexes.html). [`pg_trgm`](https://www.postgresql.org/docs/current/pgtrgm.html) adds indexed similarity and `LIKE` or `ILIKE` matching. Exact printing identifiers still need ordinary equality indexes. These are building blocks; they do not supply Spellbook's complete search behavior automatically.

## Resources, availability, and licenses

MeiliSearch's [indexing controls](https://www.meilisearch.com/docs/resources/self_hosting/configuration/reference.md) default to two-thirds of available memory and half the CPU threads. Those are indexing settings, not hard limits for the entire process. Its documented [Cloud sharding and replication](https://www.meilisearch.com/docs/capabilities/platform/infrastructure/sharding_and_replication.md) are enterprise capabilities managed with the vendor; they are not enabled by Spellbook's single-node compose service.

Typesense stores its search index in memory and raw documents on disk. Its [sizing guide](https://typesense.org/docs/guide/system-requirements.html) estimates two to three times the indexed-field data size for keyword search. This is vendor guidance, not a Spellbook memory measurement. Its [Raft availability setup](https://typesense.org/docs/guide/high-availability.html) replicates the full dataset per node; three nodes tolerate one unavailable node. Replication is not catalog sharding and multiplies resource costs.

Licenses also differ. MeiliSearch [v1.54.3](https://github.com/meilisearch/meilisearch/blob/v1.54.3/LICENSE) combines an MIT core with BUSL-1.1 enterprise code. The tagged [enterprise license](https://github.com/meilisearch/meilisearch/blob/v1.54.3/LICENSE-EE) governs production use of those enterprise components. Typesense [v30.2](https://github.com/typesense/typesense/blob/v30.2/LICENSE.txt) uses GPLv3; its [README](https://github.com/typesense/typesense/blob/v30.2/README.md) describes separate service/API use. PostgreSQL uses its [permissive PostgreSQL License](https://www.postgresql.org/about/licence/). Do not describe all MeiliSearch editions as MIT or confuse Typesense's GPLv3 license with AGPL.

## Evidence required before switching

Use one fixed multilingual Scryfall snapshot and equivalent searchable fields for every candidate. Include exact printing IDs, import hints, multiple printings per canonical card, translated face names, accents, non-Latin scripts, and common typing mistakes. Compare selected results and facet counts before throughput.

Measure p95 and p99 latency during both normal reads and a full catalog rebuild, plus peak process memory, disk usage, indexing duration, and deployment cost. Test authenticated search-key scope, concurrent reads during cutover, failed ingestion, and recovery. A high-availability comparison must include all replicas and a documented failure scenario.

Evaluate Typesense when a concrete relevance, memory, or replicated-availability requirement exposes a MeiliSearch limitation. Evaluate PostgreSQL when removing a service is a measurable operating requirement and its shared-database costs are acceptable. A search-engine change does not require a Go backend; [backend language assessment](../architecture/backend-language.md) owns that separate question.
