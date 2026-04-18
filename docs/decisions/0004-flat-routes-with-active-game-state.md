# ADR-0004: Flat User-Facing Routes With Active Game In Client State

- Status: Accepted
- Date: 2026-04-18
- Owners: Spellbook maintainers
- Related Docs: [Routing and Games](../product/routing-and-games.md), [Feature Status](../product/feature-status.md), [Frontend Architecture](../architecture/frontend.md), [Platform Overview](../product/platform-overview.md)

## Context

Earlier docs described a `/:game/{search,inventory,decks,play}` URL contract and `/mtg/...` was the only implemented branch. The intent was that future games would each get their own URL prefix.

In practice:

- Only `mtg` is implemented and only `mtg` is selectable in the GameSwitcher.
- Carrying the game in the URL forced redirect aliases (`/search` to `/mtg/search`, `/collections` to `/mtg/inventory`) just to keep older links alive.
- Users never need to be on more than one game's surface at once. Switching games is a deliberate action, not a per-tab navigation.
- Every data call already scopes to a specific game by argument, so the URL prefix added no enforcement.
- The mobile bearer-token API is a separate, versioned surface that does need a stable `/:game/...` shape and is not affected by user-facing routing.

The frontend already moved to flat routes with an `activeGameState` store backed by the `spellbook_game` cookie. The docs lagged behind.

## Decision

Spellbook will keep user-facing routes flat. The active game is held in client state (the `activeGameState` store) and persisted in the `spellbook_game` cookie. The server hook seeds the store from the cookie on each load.

The current user-facing surface is:

- `/`
- `/search`
- `/inventory`
- `/decks` (implemented, hidden from nav and hub)
- `/auth/*`, `/privacy`, `/terms`

The mobile bearer-token API keeps the `/api/mobile/v1/:game/...` shape because it is a versioned vendor contract.

## Consequences

### Positive

- One canonical URL per page; no `/mtg/...` redirect aliases needed.
- The GameSwitcher is the single, obvious place to change the active game.
- Adding a second game is mostly an adapter change; no new route tree is required.
- Bookmarks, share links, and SEO targets are stable across game additions.

### Negative

- The URL no longer encodes which game the user is viewing. A user with two browser windows cannot view two games side by side.
- Server-side rendering must read the cookie to render the right game-scoped data. The current server hook already does this.
- Changes to the active game are not reflected in browser history; the user cannot use back/forward to undo a game switch.

### Guardrails

- Do not reintroduce a `/:game/...` segment for user-facing pages without a documented capability gap.
- Every data call must continue to take an explicit `game` argument. Do not let any feature implicitly assume `mtg`.
- The mobile API surface keeps its `/:game/...` segment; do not flatten it.
- If a future product requirement (for example a multi-game comparison view) needs the URL to encode the game, revisit this ADR before re-adding a prefix.

## Follow-Up

- Update `routing-and-games.md` and `feature-status.md` to reflect the flat surface.
- Update `architecture/frontend.md` to drop the `/mtg/...` route listing.
- Remove any remaining references to `/mtg/...` user-facing routes in product or architecture docs.

## References

- `frontend/src/lib/state/activeGame.svelte.ts`
- `frontend/src/lib/components/layout/GameSwitcher.svelte`
- `frontend/src/routes/+layout.server.ts`
- [Routing and Games](../product/routing-and-games.md)
- [Feature Status](../product/feature-status.md)
