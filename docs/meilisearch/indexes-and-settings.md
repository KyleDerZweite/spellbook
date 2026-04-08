# MeiliSearch Indexes and Settings

This document records the current Spellbook index setup.

## Indexes

### `cards_distinct`

- primary key: `id`
- distinct attribute: `oracle_id`
- purpose: primary MTG search

### `cards_all`

- primary key: `id`
- no distinct attribute
- purpose: printing lookup
- pagination max total hits: `5000`

## Shared Searchable Attributes

```json
["name", "type_line", "oracle_text", "set_name"]
```

## Shared Filterable Attributes

```json
[
  "colors",
  "color_identity",
  "rarity",
  "set_code",
  "type_line",
  "card_types",
  "mana_cost",
  "is_foil_available",
  "lang",
  "oracle_id",
  "legalities"
]
```

## Shared Sortable Attributes

```json
["name", "rarity", "set_code", "collector_number"]
```

## Current Worker Configuration

The Python worker currently applies:

```python
INDEX_SETTINGS_DISTINCT = {
    "searchableAttributes": ["name", "type_line", "oracle_text", "set_name"],
    "filterableAttributes": [
        "colors",
        "color_identity",
        "rarity",
        "set_code",
        "type_line",
        "card_types",
        "mana_cost",
        "is_foil_available",
        "lang",
        "oracle_id",
        "legalities",
    ],
    "sortableAttributes": ["name", "rarity", "set_code", "collector_number"],
    "distinctAttribute": "oracle_id",
    "typoTolerance": {"enabled": True},
}

INDEX_SETTINGS_ALL = {
    "searchableAttributes": ["name", "type_line", "oracle_text", "set_name"],
    "filterableAttributes": [
        "colors",
        "color_identity",
        "rarity",
        "set_code",
        "type_line",
        "card_types",
        "mana_cost",
        "is_foil_available",
        "lang",
        "oracle_id",
        "legalities",
    ],
    "sortableAttributes": ["name", "rarity", "set_code", "collector_number"],
    "typoTolerance": {"enabled": True},
    "pagination": {"maxTotalHits": 5000},
}
```

## Notes

- `oracle_id` must be filterable because printings are looked up by `oracle_id`
- `legalities` must be filterable because the current MTG filter UI builds legality queries
- `card_types` must be filterable because the current frontend type filters use it
