# Routing and Games

- Status: Canonical
- Last Reviewed: 2026-04-08
- Source of Truth: code
- Update Triggers: route additions, route removals, supported game changes, auth protection changes
- Related Docs: [Product Docs](./README.md), [Platform Overview](./platform-overview.md), [Frontend Architecture](../architecture/frontend.md)

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

- only the `mtg` game slug is implemented end to end
- the root route `/` still exists and acts as the platform-level selector
- the future `play` surface does not exist yet

### Planned

- top-level feature routes such as `/search` and `/collections` will be removed
- the top-level game selector at `/` is also expected to be removed over time
- supported games should eventually live only under their own game slug

## Game Support Status

### Implemented

- `mtg`

### Not implemented

- `pokemon`
- `yugioh`

There are no `/pokemon/*` or `/yugioh/*` route files in the codebase today.
