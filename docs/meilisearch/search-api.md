# MeiliSearch Search API

This document describes how the current Spellbook frontend uses MeiliSearch.

## Current Search Modes

### Browse mode

Used when the query is shorter than 2 characters.

Current behavior:

- search `cards_distinct`
- empty query
- sort by `name:asc`
- apply active filters

### Distinct card search

Used when the query length is 2 or more characters.

Current behavior:

- search `cards_distinct`
- free-text query
- apply active filters
- paginate with `limit` and `offset`

### Printing lookup

Used when a card is selected in the card detail flow.

Current behavior:

- search `cards_all`
- empty query
- filter by `oracle_id`
- sort by `set_code:asc`

### Facet counts

Current facet request:

- index: `cards_distinct`
- query: empty string
- `limit: 0`
- facets: `colors`, `rarity`, `set_code`

### Set progress lookup

Current set progress request:

- index: `cards_all`
- query: empty string
- `limit: 0`
- filter by `set_code`
- request distinct count by `oracle_id`

## Current Filter Syntax

The current frontend builds filter arrays for:

- exact color subset behavior
- rarity
- card types
- MTG legalities

Representative examples:

```text
(rarity = "rare" OR rarity = "mythic")
```

```text
(card_types = "Creature" OR card_types = "Instant")
```

```text
(legalities.commander = "legal" OR legalities.standard = "legal")
```

## Current Frontend Limits

- browse mode default page size: `50`
- search mode default page size: `50`
- printings lookup limit: `1000`

## Current Game Scope

The frontend types allow `mtg`, `pokemon`, and `yugioh`, but the current search client throws for anything except `mtg`.
