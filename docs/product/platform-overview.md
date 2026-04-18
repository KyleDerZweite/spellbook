# Platform Overview

- Status: Canonical
- Last Reviewed: 2026-04-18
- Source of Truth: mixed
- Update Triggers: product scope changes, supported game changes, route model changes, pillar status changes
- Related Docs: [Product Docs](./README.md), [Routing and Games](./routing-and-games.md), [Feature Status](./feature-status.md), [System Overview](../architecture/system-overview.md), [ADR-0004](../decisions/0004-flat-routes-with-active-game-state.md)

Spellbook is an MTG-first, multi-TCG platform for card search, owned inventory, scan-based capture, and future deck and play workflows.

## Current Product State

Spellbook currently ships one working adapter: Magic: The Gathering.

Active product areas:

- search
- inventory
- scan (backend scaffold, frontend surface pending)

Implemented but hidden from the active product surface:

- decks (route still reachable via direct URL at `/decks`)

Planned but not implemented:

- play

Current live user-facing routes:

- `/`
- `/search`
- `/inventory`
- `/decks` (implemented, not linked from nav or hub)

User-facing routes are flat. The active game is held in client state (cookie-backed) rather than the URL; see [Routing and Games](./routing-and-games.md) and [ADR-0004](../decisions/0004-flat-routes-with-active-game-state.md). Legacy `/mtg/*` and `/collections*` URLs 308-redirect to the matching flat route.

## Planned Platform Direction

Spellbook is being shaped toward multi-game support behind the same flat user-facing surface. Adding a new game means adding a new search adapter, inventory wiring, and any new game-specific surfaces, without changing the top-level URL shape that users see.

The mobile bearer-token API keeps a `/api/mobile/v1/:game/...` shape so vendor clients can pin a game segment.

Examples of future games discussed in the project:

- MTG
- Pokemon
- Yu-Gi-Oh!

These future games are examples only. They do not have implemented adapters or search backends yet.

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
