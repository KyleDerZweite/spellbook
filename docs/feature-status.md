# Feature Status

This matrix tracks implemented behavior versus planned platform direction.

## By Pillar and Game

| Game | Search | Inventory | Decks | Play |
|------|--------|-----------|-------|------|
| MTG | Implemented | Implemented | Implemented | Planned |
| Pokemon | Planned | Planned | Planned | Planned |
| Yu-Gi-Oh! | Planned | Planned | Planned | Planned |

## MTG Details

### Implemented

- Catalog search via MeiliSearch
- Printing picker from MTG card search
- Owned inventory with list and spellbook modes
- Set progress based on owned canonical cards
- Deck creation and deck editing
- Owned-versus-required comparison inside decks

### Not implemented

- MTG play surface
- Non-MTG search adapters
- Non-MTG inventory and deck UIs

## Platform Notes

- The frontend and backend are already partly game-aware.
- The current search client explicitly rejects non-MTG games.
- The backend still auto-creates only the MTG inventory on first connect.
- Future TCGs are examples of direction, not committed releases.

## Known Transitional Areas

- `/search` and `/collections*` still exist as MTG redirects.
- `/` still functions as a game selector even though the long-term route model is game-scoped only.
- The legal pages are still MTG-specific and instance-specific. They are being reworked separately.
