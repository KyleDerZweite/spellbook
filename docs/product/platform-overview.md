# Platform Overview

- Status: Canonical
- Last Reviewed: 2026-04-17
- Source of Truth: mixed
- Update Triggers: product scope changes, supported game changes, route model changes, pillar status changes
- Related Docs: [Product Docs](./README.md), [Routing and Games](./routing-and-games.md), [Feature Status](./feature-status.md), [System Overview](../architecture/system-overview.md)

Spellbook is an MTG-first, multi-TCG platform for card search, owned inventory, scan-based capture, and future deck and play workflows.

## Current Product State

Spellbook currently ships one working adapter: Magic: The Gathering.

Active MTG product areas:

- search
- inventory
- scan (backend scaffold, frontend surface pending)

Implemented but hidden from the active product surface:

- decks (route still reachable via direct URL at `/mtg/decks`)

Planned but not implemented:

- play

Current live MTG routes:

- `/mtg/`
- `/mtg/search`
- `/mtg/inventory`
- `/mtg/decks` (implemented, not linked from nav or hub)

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
| Search | Implemented (active) | Planned per-game catalog adapters |
| Inventory | Implemented (active, being improved) | Planned per-game owned-ledger workflows |
| Scan | Backend scaffold, frontend pending (active focus) | Planned per-game recognizers |
| Decks | Implemented but hidden | Planned per-game deck systems |
| Play | Not implemented | Planned platform pillar |

## Data Model Direction

The current product model is inventory-and-decks based, not collection based.

- `inventory` is the owned ledger for a game
- `inventory_card` stores owned printing entries
- `deck` and `deck_card` store deck data per game
- `spellbook` is a presentation mode within MTG inventory, not the canonical domain model

This is already reflected in the backend schema and reducers.
