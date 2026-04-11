# SpacetimeDB

- Status: Canonical
- Last Reviewed: 2026-04-11
- Source of Truth: code
- Update Triggers: schema changes, reducer changes, auth claim handling changes, table bootstrap changes
- Related Docs: [System Overview](./system-overview.md), [Auth](./auth.md), [Mobile And Scan](./mobile-and-scan.md), [Platform Overview](../product/platform-overview.md)

SpacetimeDB stores user-scoped real-time state for Spellbook.

## Current Tables

- `user_profile`
- `inventory`
- `inventory_card`
- `deck`
- `deck_card`
- `scan_session`
- `scan_artifact`
- `scan_review_item`
- `inventory_mutation_request`

## Current Model Notes

- tables are already game-aware through a `game` field
- MTG is the only implemented adapter today
- `inventory` and `deck` are the current canonical domain objects
- collection-first terminology is obsolete for active docs

## Current Bootstrap Behavior

On client connect:

- Spellbook upserts the user profile from JWT claims
- Spellbook creates the default MTG inventory if it does not already exist

This behavior currently lives in `spacetimedb/src/reducers/identity.ts` and `spacetimedb/src/reducers/inventory.ts`.

## Current Reducer Surface

- inventory creation and lookup
- add/update/remove/reorder inventory cards
- idempotent batch inventory add
- create/update/delete decks
- add/update/remove deck cards
- create/update scan sessions and review items
