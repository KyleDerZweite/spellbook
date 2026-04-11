# Feature Status

- Status: Canonical
- Last Reviewed: 2026-04-11
- Source of Truth: mixed
- Update Triggers: feature rollout changes, supported game changes, route changes, planned versus implemented status changes
- Related Docs: [Product Docs](./README.md), [Platform Overview](./platform-overview.md), [Routing and Games](./routing-and-games.md)

This matrix tracks implemented behavior versus planned platform direction.

## By Pillar and Game

| Game | Search | Inventory | Decks | Play |
|------|--------|-----------|-------|------|
| MTG | Implemented | Implemented | Implemented | Planned |
| Pokemon | Planned | Planned | Planned | Planned |
| Yu-Gi-Oh! | Planned | Planned | Planned | Planned |

## MTG Details

### Implemented

- catalog search via MeiliSearch
- printing picker from MTG card search
- owned inventory with list and spellbook modes
- set progress based on owned canonical cards
- deck creation and deck editing
- owned-versus-required comparison inside decks

### Not implemented

- MTG play surface
- non-MTG search adapters
- non-MTG inventory and deck UIs
- released Android mobile client
- production-ready server-side scan recognizer

## Platform Notes

- the frontend and backend are already partly game-aware
- the current search client explicitly rejects non-MTG games
- the backend still auto-creates only the MTG inventory on first connect
- future TCGs are examples of direction, not committed releases
- mobile API foundations now exist under `/api/mobile/v1/...`
- scan session and idempotent batch inventory infrastructure now exist in the backend
