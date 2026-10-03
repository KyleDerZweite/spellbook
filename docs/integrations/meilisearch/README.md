# MeiliSearch in Spellbook

- Status: Canonical
- Last Reviewed: 2026-10-03
- Source of Truth: code
- Update Triggers: index changes, query changes, search-key handling changes, MTG search behavior changes
- Related Docs: [Integrations Docs](../README.md), [Indexes and Settings](./indexes-and-settings.md), [Search API](./search-api.md), [Tasks](./tasks.md), [Documents](./documents.md), [Authentication](./authentication.md), [Worker Architecture](../../architecture/worker.md), [Search engine assessment](../../reference/search-engines.md)

MeiliSearch serves Spellbook's searchable MTG catalog. Scryfall supplies card data through the [Python worker](../../architecture/worker.md); [Postgres](../../architecture/postgres.md) owns accounts, inventory, decks, and scan state.

The integration uses two live indexes. `cards_distinct` groups search results by canonical card; `cards_all` preserves every printing for selection and exact import resolution. Both receive transformed Scryfall records through staging indexes and an atomic swap.

| Owner                                                      | Contract                                                             |
| ---------------------------------------------------------- | -------------------------------------------------------------------- |
| [Indexes and settings](./indexes-and-settings.md)          | Primary keys, distinct behavior, searchable and filterable fields    |
| [Document transformation](./documents.md)                  | Printing fields, localized names, normalization, and skipped layouts |
| [Search queries](./search-api.md)                          | Browser browse/search modes, facets, and pagination                  |
| [Credentials](./authentication.md)                         | Server access and browser search-key delivery                        |
| [Task handling](./tasks.md)                                | Staging, failed-task handling, swaps, and cleanup                    |
| [Catalog upgrade](../../operations/meilisearch-upgrade.md) | Existing-volume backup, dump import, and rollback                    |

The dated [search engine assessment](../../reference/search-engines.md) compares MeiliSearch, Typesense, and PostgreSQL. It records why the current engine remains suitable and what evidence would justify a replacement.
