# MeiliSearch search queries

- Status: Canonical
- Last Reviewed: 2026-10-03
- Source of Truth: code
- Update Triggers: query mode changes, filter changes, limit changes, browse-mode behavior changes
- Related Docs: [MeiliSearch Overview](./README.md), [Indexes and Settings](./indexes-and-settings.md), [Frontend Architecture](../../architecture/frontend.md)

The [browser search client](../../../frontend/src/lib/search/meilisearch.ts) queries `cards_distinct` and applies active filters.

| Query length              | Request                                              |
| ------------------------- | ---------------------------------------------------- |
| Fewer than two characters | Empty query sorted by `name:asc` for browsing        |
| Two or more characters    | Free-text query with `limit` and `offset` pagination |

Hits render independently of facets. Facet requests follow active filter and game state changes; a facet failure does not fail the hit view. Pagination keeps the original query and filter context. Responses from an outdated context are discarded rather than appended to the current results.

The [versioned API](../../architecture/mobile-and-scan.md#request-validation) validates pagination separately. [Indexes and settings](./indexes-and-settings.md) owns distinct and printing behavior.
