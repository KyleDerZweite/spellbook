# Routing and Games

- Status: Canonical
- Last Reviewed: 2026-05-21
- Source of Truth: code
- Update Triggers: route additions, route removals, supported game changes, auth protection changes, active-game state changes
- Related Docs: [Product Docs](./README.md), [Platform Overview](./platform-overview.md), [Functional Requirements](./functional-requirements.md), [Feature Status](./feature-status.md), [Frontend Architecture](../architecture/frontend.md), [ADR-0008](../decisions/0008-mtg-only-self-hosted-inventory-and-deck-availability.md)

This document defines the current route surface and MTG support scope.

Spellbook supports MTG only. The Spellbook base app has no play route. Future play belongs in a separate application that can consume Spellbook catalog and deck data.

## MTG Scope

The codebase still contains some game-aware names and a cookie-backed active-game state from earlier multi-game planning. Product work should treat this as compatibility residue, not current direction.

Current behavior:

- only `mtg` is implemented
- user-facing routes do not carry a game segment
- the mobile API uses `/api/mobile/v1/mtg/...`
- selecting non-MTG games is not supported

New product work should not add Pokemon, Yu-Gi-Oh!, or generic TCG abstractions.

## Current Routes in Code

### Implemented routes

- `/`
- `/search`
- `/inventory`
- `/decks`
- `/auth/login`
- `/auth/callback`
- `/auth/logout`
- `/privacy`
- `/terms`

### Mobile API surface

Mobile bearer-token endpoints retain the `mtg` game segment because they are versioned API surfaces:

- `/api/mobile/v1/mtg/search`
- `/api/mobile/v1/mtg/inventory`
- `/api/mobile/v1/mtg/inventory/batch-add`
- `/api/mobile/v1/mtg/inventory/bulk`
- `/api/mobile/v1/mtg/inventory/import/preview`
- `/api/mobile/v1/mtg/inventory/import/commit`
- `/api/mobile/v1/mtg/inventory/[entryId]`
- `/api/mobile/v1/mtg/cards/[oracleId]/printings`
- `/api/mobile/v1/mtg/decks`
- `/api/mobile/v1/mtg/decks/[deckId]`
- `/api/mobile/v1/mtg/decks/[deckId]/cards`
- `/api/mobile/v1/mtg/decks/[deckId]/cards/bulk`
- `/api/mobile/v1/mtg/decks/[deckId]/export`
- `/api/mobile/v1/mtg/decks/import/preview`
- `/api/mobile/v1/mtg/decks/import/commit`
- `/api/mobile/v1/mtg/deck-cards/[entryId]`
- `/api/mobile/v1/mtg/scan/sessions`
- `/api/mobile/v1/mtg/scan/sessions/[sessionId]/frames`
- `/api/mobile/v1/mtg/scan/sessions/[sessionId]/result`
- `/api/mobile/v1/mtg/scan/review/commit`

Inventory and deck import endpoints use preview-first MTG Arena-style text parsing. Commit endpoints re-parse and re-resolve the submitted text, commit only resolved supported sections, and return unresolved or ambiguous lines for the client to display.

## Compatibility Routes

Legacy `/mtg/*` and `/collections*` URLs 308-redirect to the matching flat route.

These redirects are compatibility behavior. They are not an indication that new game-specific user-facing routes should be added.

## Future Route Direction

The frontend redesign should keep the route surface simple:

- search
- inventory
- decks
- import/review flows where needed

Route and navigation decisions should follow the functional requirements, not a generic multi-game platform model.
