# MeiliSearch Documents

This document describes the current Spellbook document shape and ingestion rules.

## Primary Key

Both current Spellbook indexes use `id` as the primary key.

In Spellbook, `id` is the Scryfall card printing ID.

Do not document `scryfall_id` as the MeiliSearch primary key for this repo. The current worker creates indexes with primary key `id`.

## Current Document Shape

Representative fields from the current worker transform:

```json
{
  "id": "scryfall-printing-id",
  "oracle_id": "oracle-id",
  "name": "Lightning Bolt",
  "lang": "en",
  "released_at": "2009-07-17",
  "layout": "normal",
  "mana_cost": "{R}",
  "cmc": 1,
  "type_line": "Instant",
  "oracle_text": "Lightning Bolt deals 3 damage to any target.",
  "colors": ["R"],
  "color_identity": ["R"],
  "keywords": [],
  "card_types": ["Instant"],
  "power": null,
  "toughness": null,
  "rarity": "common",
  "set_code": "m10",
  "set_name": "Magic 2010",
  "collector_number": "149",
  "image_uri": "https://...",
  "image_uri_small": "https://...",
  "is_foil_available": true,
  "is_nonfoil_available": true,
  "legalities": {
    "commander": "legal"
  }
}
```

Some multi-face MTG cards may also include:

- `back_face_name`
- `back_face_image_uri`

## Current Ingestion Rules

- tokens and other non-game layouts are skipped
- documents without `id` or `oracle_id` are skipped
- documents are sorted by `released_at` descending before upload
- the same transformed document set is uploaded to both `cards_distinct` and `cards_all`

The release-date sort is important because `cards_distinct` keeps one representative printing per `oracle_id`.

## Why Spellbook Stores These Fields

The frontend needs enough data to render:

- search results
- printings
- card detail modal
- set progress queries
- legality filters

## Current Product Terminology

These documents back catalog search only. Owned inventory and decks are stored in SpacetimeDB, not in MeiliSearch.
