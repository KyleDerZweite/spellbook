# Routing and Games

This document defines the current route surface and the planned canonical game-scoped route contract.

## Current Routes in Code

### Implemented routes

- `/`
- `/mtg/`
- `/mtg/search`
- `/mtg/inventory`
- `/mtg/decks`
- `/auth/login`
- `/auth/callback`
- `/auth/logout`
- `/privacy`
- `/terms`

### Transitional aliases

These routes still exist today but are not the long-term canonical model:

- `/search` -> redirects to `/mtg/search`
- `/collections` -> redirects to `/mtg/inventory`
- `/collections/[id]` -> redirects to `/mtg/inventory`

These aliases should be treated as temporary compatibility routes.

## Canonical Planned Route Contract

The future product contract is:

```text
/:game/{index,search,inventory,decks,play}
```

Meaning:

- `/:game/index` is the per-game landing route
- `/:game/search` is catalog search for that game
- `/:game/inventory` is owned inventory for that game
- `/:game/decks` is deck management for that game
- `/:game/play` is the future play surface for that game

## Current vs Planned Interpretation

### Current

- Only the `mtg` game slug is implemented end to end.
- The root route `/` still exists and acts as the platform-level selector.
- The future `play` surface does not exist yet.

### Planned

- Top-level feature routes such as `/search` and `/collections` will be removed.
- The top-level game selector at `/` is also expected to be removed over time.
- Supported games should eventually live only under their own game slug.

## Game Support Status

### Implemented

- `mtg`

### Not implemented

- `pokemon`
- `yugioh`

There are no `/pokemon/*` or `/yugioh/*` route files in the codebase today.

## Rules for Future Game Adapters

- Game routes must be explicitly implemented. Naming a future game in product copy does not mean route support exists.
- Search behavior may diverge by game because metadata, vocabularies, and filters are not universal across TCGs.
- Inventory, deck, and play workflows should reuse platform concepts where possible, but game-specific adapters may still differ in detail.
