# Catalog

- Status: Canonical
- Last Reviewed: 2026-10-03
- Source of Truth: code
- Update Triggers: catalog schema, publication, search ranking, filters, facets, import resolution, printing selection
- Related Docs: [Postgres](./postgres.md), [Worker](./worker.md), [Frontend](./frontend.md), [Deployment](../operations/deployment.md), [ADR-0010](../decisions/0010-postgres-catalog.md)

PostgreSQL stores the public Scryfall catalog alongside account-owned application data. SvelteKit provides authenticated search and printing lookup. Browsers use the application API; they receive no database credential or search-service key. The catalog contains card metadata, not ownership quantities.

## Storage and publication

Migration `0006_postgres_catalog.sql` enables `pg_trgm` and adds three tables. `catalog_generations` records each source snapshot and transformation schema version. `catalog_printings` stores one document per printing per generation, with indexed identity, search, and filter columns. The singleton `catalog_state` points to the active and previous generations.

The [Python worker](./worker.md) streams a complete snapshot into a new generation using PostgreSQL COPY. One transaction holds the publisher advisory lock, inserts printings, updates generation metadata, changes the active pointer, and deletes generations older than the previous one. The foreign key removes their printing rows. A malformed or empty snapshot rolls back the transaction and preserves the last published catalog.

Search hits, totals, facets, and `generationId` come from one SQL statement and therefore one publication snapshot. Readers keep seeing a complete committed generation during publication. Separate paginated requests may observe different generations; the API does not pin a browsing session to an old snapshot. Browser search restarts pagination when the generation changes, and card details reject printing pages from mixed generations. Before the first successful publication, search returns an empty result with `generationId: null`.

The [schema](../../frontend/src/lib/server/db/schema.ts), [migration](../../frontend/drizzle/0006_postgres_catalog.sql), and [document type](../../frontend/src/lib/search/types.ts) own field definitions. Catalog refreshes do not rewrite inventory or deck entries.

## Search behavior

[`search.ts`](../../frontend/src/lib/server/catalog/search.ts) combines literal name substring matching, PostgreSQL full-text search with the `simple` configuration, and trigram name matching. Fuzzy matching applies to queries with at least three characters and a Latin letter. Exact English or printed names rank first, followed by name prefixes, full-text matches, substrings, and fuzzy matches. This is a defined fallback policy, not a claim of equal relevance across languages. Name matching includes printed and face names and supports CJK substrings. Oracle, type, and localized non-name text use complete tokens in the `simple` full-text configuration; arbitrary partial CJK matches and language-aware segmentation are not implemented.

Search returns one representative printing per `oracle_id`. Matching relevance wins first, then English language, descending release date, and printing ID. A name sort changes the order of canonical cards. It does not change the representative-printing policy. Without a query, cards sort by name.

Filter categories combine with AND. Rarity, type, legality, and set values combine with OR within their category. Selected colors include nonempty card-color subsets of those selected colors. `C` also includes colorless cards. Color filtering uses the card's colors, not Commander color identity.

Optional color, rarity, and set facets count distinct oracle IDs in each bucket over the matching printings. A canonical card may occur in more than one bucket, so facet counts need not sum to the result total. `estimatedTotalHits` contains the exact distinct-card count for the request, despite its compatibility name. The browser requests available facets separately from its entered query and initially selects Standard or Commander legality.

Authenticated `GET /api/mobile/v1/mtg/search` supports the existing query and pagination contract. `POST` on that route accepts structured filters and optional facets and name sorting. [OpenAPI](../../frontend/src/routes/openapi.json/+server.ts) owns exact field names, accepted values, defaults, and limits. Raw search-engine expressions are not accepted.

## Printing and import identity

`GET /api/mobile/v1/mtg/cards/{oracleId}/printings` returns every matching printing in the active generation, ordered by set, collector number, language, and printing ID. It does not group by oracle ID. Card details paginate this route and display up to 1,000 printings.

Import resolution accepts exact normalized canonical names and individual canonical face names. It also accepts exact case-insensitive printed names and localized face names, splitting face aliases on `//` surrounded by spaces. Whole names remain supported; prefix and fuzzy matches do not resolve imports. Set and collector-number hints narrow printing candidates. Name-only resolution groups candidates by oracle ID; hinted resolution keeps printing identities distinct. The import workflow retains ambiguous and unresolved lines for review. Scan candidate enrichment resolves authoritative metadata by printing ID through the same catalog.

The [domain glossary](../product/domain-model.md) owns the distinction between canonical cards, printings, inventory entries, and deck entries. [Deployment](../operations/deployment.md#catalog-migration-and-recovery) owns catalog migration and recovery.
