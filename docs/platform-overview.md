# Platform Overview

Spellbook is an MTG-first, multi-TCG platform for card search, owned inventory, decks, and future play workflows.

## Current Product State

Spellbook currently ships one working adapter: Magic: The Gathering.

Implemented MTG product areas:

- Search
- Inventory
- Decks

Planned but not implemented as a product area:

- Play

Current live MTG routes:

- `/mtg/`
- `/mtg/search`
- `/mtg/inventory`
- `/mtg/decks`

The root route `/` currently acts as a game selector and platform entry point. Top-level `/search` and `/collections*` remain transitional MTG redirects and are planned for removal.

## Planned Platform Direction

Spellbook is being shaped toward per-game product slices with a shared route contract:

```text
/:game/{index,search,inventory,decks,play}
```

This route model allows each game to diverge where necessary while preserving a consistent top-level product shape.

Examples of future games discussed in the project:

- MTG
- Pokemon
- Yu-Gi-Oh!

These future games are examples only. They do not have implemented route trees, adapters, or search backends yet.

## Product Pillars

| Pillar | MTG Today | Cross-TCG Direction |
|--------|-----------|---------------------|
| Search | Implemented | Planned per-game catalog adapters |
| Inventory | Implemented | Planned per-game owned-ledger workflows |
| Decks | Implemented | Planned per-game deck systems |
| Play | Not implemented | Planned platform pillar |

## Data Model Direction

The current product model is inventory-and-decks based, not collection based.

- `inventory` is the owned ledger for a game
- `inventory_card` stores owned printing entries
- `deck` and `deck_card` store deck data per game
- `spellbook` is a presentation mode within MTG inventory, not the canonical domain model

This is already reflected in the backend schema and reducers.

## Architecture Summary

Spellbook currently uses:

- SvelteKit frontend
- SpacetimeDB for user-scoped state and real-time sync
- MeiliSearch for catalog search
- Python worker for MTG catalog ingestion from Scryfall
- Zitadel for direct OIDC authentication

## Non-Goals of This Doc

This document does not promise timelines for future TCG adapters. It exists to separate current implementation truth from the intended platform shape.
