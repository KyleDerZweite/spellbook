# Routing and Games

- Status: Canonical
- Last Reviewed: 2026-04-18
- Source of Truth: code
- Update Triggers: route additions, route removals, supported game changes, auth protection changes, active-game state changes
- Related Docs: [Product Docs](./README.md), [Platform Overview](./platform-overview.md), [Feature Status](./feature-status.md), [Frontend Architecture](../architecture/frontend.md), [ADR-0004](../decisions/0004-flat-routes-with-active-game-state.md)

This document defines the current route surface and how the active game is selected without putting the game in the URL.

## Active Game Lives in Client State

The active game is held in `activeGameState` (`frontend/src/lib/state/activeGame.svelte.ts`) and persisted in the `spellbook_game` cookie. The server hook seeds the state from that cookie on each load.

Consequences:

- The URL does not carry a game segment.
- Switching games happens through the in-nav `GameSwitcher` and updates the cookie.
- Every data call still scopes to a specific game; only the URL is flat.
- Today only `mtg` is selectable, so the cookie value is always `mtg` in practice.

See [ADR-0004](../decisions/0004-flat-routes-with-active-game-state.md) for the rationale and tradeoffs.

## Current Routes in Code

### Implemented routes

- `/`
- `/search`
- `/inventory`
- `/decks` (implemented, hidden from nav and hub)
- `/auth/login`
- `/auth/callback`
- `/auth/logout`
- `/privacy`
- `/terms`

### Currently hidden from the product surface

`/decks` is implemented and reachable by direct URL but is intentionally not linked from the navigation, the home hub, or the PWA manifest while search, inventory, and scan are the active product focus. This is a product-surface decision, not a code removal.

### Mobile API surface

Mobile bearer-token endpoints retain a game segment because they are versioned vendor surfaces, not user-facing routes:

- `/api/mobile/v1/mtg/search`
- `/api/mobile/v1/mtg/inventory`
- `/api/mobile/v1/mtg/inventory/batch-add`
- `/api/mobile/v1/mtg/inventory/[entryId]`
- `/api/mobile/v1/mtg/cards/[oracleId]/printings`
- `/api/mobile/v1/mtg/decks`
- `/api/mobile/v1/mtg/decks/[deckId]`
- `/api/mobile/v1/mtg/decks/[deckId]/cards`
- `/api/mobile/v1/mtg/deck-cards/[entryId]`
- `/api/mobile/v1/mtg/scan/sessions`
- `/api/mobile/v1/mtg/scan/sessions/[sessionId]/frames`
- `/api/mobile/v1/mtg/scan/sessions/[sessionId]/result`
- `/api/mobile/v1/mtg/scan/review/commit`

These follow the `/:game/:resource` shape on purpose so a future second game can ship without breaking existing mobile clients.

## Game Support Status

### Implemented

- `mtg`

### Not implemented

- `pokemon`
- `yugioh`

`SUPPORTED_GAMES` enumerates every recognised slug. `AVAILABLE_GAMES` only contains `mtg`. Selecting a game outside `AVAILABLE_GAMES` from the GameSwitcher is a no-op.

## Adding a Second Game

When a second game ships:

1. Add the slug to `AVAILABLE_GAMES`.
2. Make sure the search adapter, inventory wiring, and any new pages branch on `activeGameState.current`.
3. Add the matching `/api/mobile/v1/:game/...` endpoints if mobile clients need them.
4. The user-facing routes do not need to change. The same `/search`, `/inventory`, and `/decks` paths render the active game's content based on the cookie.
