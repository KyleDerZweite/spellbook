# Feature Status

- Status: Canonical
- Last Reviewed: 2026-04-17
- Source of Truth: mixed
- Update Triggers: feature rollout changes, supported game changes, route changes, planned versus implemented status changes
- Related Docs: [Product Docs](./README.md), [Platform Overview](./platform-overview.md), [Routing and Games](./routing-and-games.md)

This matrix tracks implemented behavior versus planned platform direction.

## Current Product Focus

The active product focus is search, inventory, and scan. Decks and play are deprioritized for now:

- decks is implemented but hidden from the navigation, hub, and manifest shortcuts; the `/mtg/decks` route still works via direct URL
- play is not implemented and is not surfaced

## By Pillar and Game

| Game | Search | Inventory | Scan | Decks | Play |
|------|--------|-----------|------|-------|------|
| MTG | Implemented | Implemented (being improved) | Backend scaffold, frontend surface pending | Implemented (hidden) | Planned |
| Pokemon | Planned | Planned | Planned | Planned | Planned |
| Yu-Gi-Oh! | Planned | Planned | Planned | Planned | Planned |

## MTG Details

### Implemented and active

- catalog search via MeiliSearch
- printing picker from MTG card search
- owned inventory with list and spellbook modes
- set progress based on owned canonical cards

### Implemented but hidden from surface

- deck creation, deck editing, and owned-versus-required comparison remain available at `/mtg/decks` but are not advertised in the nav, hub, or manifest

### In progress

- installable PWA (manifest present, service worker not yet implemented)
- production-ready server-side scan recognizer
- scan frontend capture surface

### Not implemented

- MTG play surface
- non-MTG search adapters
- non-MTG inventory and deck UIs

## Platform Notes

- the frontend and backend are already partly game-aware
- the current search client explicitly rejects non-MTG games
- the backend still auto-creates only the MTG inventory on first connect
- future TCGs are examples of direction, not committed releases
- mobile is delivered as a PWA on the same SvelteKit frontend
- mobile API foundations exist under `/api/mobile/v1/...` as an optional integration boundary
- scan session and idempotent batch inventory infrastructure now exist in the backend
