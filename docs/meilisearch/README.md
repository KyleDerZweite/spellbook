# MeiliSearch in Spellbook

Spellbook currently uses MeiliSearch for MTG card catalog search.

MTG is the only implemented game today. The search layer is game-aware in types, but the current frontend rejects non-MTG searches.

## Current Role

MeiliSearch is the source of truth for the searchable MTG catalog.

SpacetimeDB stores user-scoped data only:

- inventories
- inventory cards
- decks
- deck cards

Spellbook no longer treats collections as the primary product model.

## Current Indexes

| Index | Purpose | Current behavior |
|-------|---------|------------------|
| `cards_distinct` | Primary MTG search | One result per `oracle_id` |
| `cards_all` | Printing lookup | All MTG printings for a selected card |

## Current Data Flow

```text
Scryfall -> Python worker -> cards_distinct + cards_all -> frontend search UI
```

The Python worker downloads MTG bulk data from Scryfall, transforms it, and uploads documents to both indexes.

## Current Index Settings

Shared searchable attributes:

- `name`
- `type_line`
- `oracle_text`
- `set_name`

Shared filterable attributes:

- `colors`
- `color_identity`
- `rarity`
- `set_code`
- `type_line`
- `card_types`
- `mana_cost`
- `is_foil_available`
- `lang`
- `oracle_id`
- `legalities`

Shared sortable attributes:

- `name`
- `rarity`
- `set_code`
- `collector_number`

Index-specific behavior:

- `cards_distinct` uses `distinctAttribute = "oracle_id"`
- `cards_all` does not use a distinct attribute
- `cards_all` sets `pagination.maxTotalHits = 5000`

## Current Frontend Usage

The frontend uses MeiliSearch for:

- browse mode when the search query is shorter than 2 characters
- distinct card search
- printing lookup by `oracle_id`
- facet counts
- set progress lookups using distinct `oracle_id` counts

## Current Auth Behavior

The frontend does not require a manually configured `PUBLIC_MEILISEARCH_SEARCH_KEY` in current production docs.

Current behavior:

- the SvelteKit server fetches the default search-only key from MeiliSearch at runtime
- authenticated sessions receive that key through layout data
- the browser then talks directly to MeiliSearch with that read-only key

## Planned Direction

The platform is expected to support other TCGs later, but there are no non-MTG catalog adapters or index naming schemes implemented yet. Keep MeiliSearch docs MTG-specific unless the code changes.

## More Detail

- [Authentication](./authentication.md)
- [Documents](./documents.md)
- [Indexes and settings](./indexes-and-settings.md)
- [Search API](./search-api.md)
- [Tasks](./tasks.md)
