# MeiliSearch in Spellbook

- Status: Canonical
- Last Reviewed: 2026-05-18
- Source of Truth: code
- Update Triggers: index changes, query changes, search-key handling changes, MTG search behavior changes
- Related Docs: [Integrations Docs](../README.md), [Indexes and Settings](./indexes-and-settings.md), [Search API](./search-api.md), [Tasks](./tasks.md), [Worker Architecture](../../architecture/worker.md)

Spellbook currently uses MeiliSearch for MTG card catalog search.

MTG is the only implemented game today. The search layer is game-aware in types, but the current frontend rejects non-MTG searches.

## Current Role

MeiliSearch is the source of truth for the searchable MTG catalog.

Postgres stores user-scoped data only:

- inventories
- inventory cards
- decks
- deck cards

## Current Indexes

| Index                 | Purpose                                          | Current behavior                              |
| --------------------- | ------------------------------------------------ | --------------------------------------------- |
| `cards_distinct`      | Primary MTG search                               | One result per `oracle_id`                    |
| `cards_distinct_next` | Staging index                                    | Temporary target during zero-downtime reindex |
| `cards_all`           | Printing lookup and exact import printing lookup | All MTG printings for a selected card         |
| `cards_all_next`      | Staging index                                    | Temporary target during zero-downtime reindex |

## Current Data Flow

```text
Scryfall -> Python worker -> cards_distinct_next + cards_all_next -> atomic index swap -> frontend search and import resolution
```

The Python worker downloads MTG bulk data from Scryfall, transforms it, and uploads documents to both indexes.
