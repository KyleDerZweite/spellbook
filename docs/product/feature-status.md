# Feature Status

- Status: Canonical
- Last Reviewed: 2026-05-21
- Source of Truth: mixed
- Update Triggers: feature rollout changes, supported game changes, route changes, planned versus implemented status changes
- Related Docs: [Product Docs](./README.md), [Platform Overview](./platform-overview.md), [Functional Requirements](./functional-requirements.md), [Routing and Games](./routing-and-games.md)

This matrix tracks implemented MTG behavior versus the current product requirements.

## Current Product Focus

The active product focus is an open-source, self-hosted MTG inventory and deck availability system.

The next product phase should stabilize the functional workflow before a full visual redesign:

- inventory as the owned physical-card ledger
- deck import/export
- deck availability against inventory
- scan/import review queues
- stable APIs for automation

## By Pillar

| Pillar              | Status                 | Notes                                                    |
| ------------------- | ---------------------- | -------------------------------------------------------- |
| MTG search          | Implemented            | MeiliSearch-backed Scryfall catalog                      |
| MTG inventory       | Implemented            | Needs physical location and availability workflows       |
| MTG decks           | Implemented            | Needs product redesign around deck availability          |
| MTG imports/exports | Implemented            | Arena-style text supported for current APIs              |
| MTG scan            | Backend foundation     | Recognition and frontend capture remain incomplete       |
| Automation API      | Implemented foundation | Bulk inventory/deck APIs and import preview/commit exist |
| Non-MTG games       | Out of scope           | Do not plan or implement during current product phase    |

## MTG Details

### Implemented

- catalog search via MeiliSearch
- printing picker from MTG card search
- owned inventory with list and spellbook modes
- set progress based on owned canonical cards
- mobile inventory bulk mutations with idempotent `requestId`
- mobile inventory import preview and commit for MTG Arena-style lists
- mobile deck bulk mutations with idempotent `requestId`
- mobile deck import preview and commit for MTG Arena-style lists
- mobile deck export as MTG Arena-style text
- warning-only lightweight deck legality checks during import preview and commit
- scan session and scan review commit foundation

### In progress or next

- physical card locations
- assigned versus available inventory accounting
- deck availability and build plans
- simplified frontend information architecture
- production-ready server-side scan recognizer
- scan frontend capture surface
- installable PWA completion

### Not implemented

- importer profiles for ManaBox, Moxfield, Archidekt, and CSV
- public deck sharing
- marketplace workflows
- price portfolio dashboard
- non-MTG search adapters
- non-MTG inventory and deck UIs

## Scope Notes

- MTG is the only supported game.
- Existing game-aware fields may remain when already present, but new product work should not generalize for future games.
- Mobile is delivered as a PWA on the same SvelteKit frontend.
- Mobile API foundations exist under `/api/mobile/v1/:game/...` as an optional integration boundary. The current supported game segment is `mtg`.
- Scan session, idempotent inventory mutation, and idempotent deck mutation infrastructure exist in the backend.
- Scan recognition is secondary to getting the review and commit workflow right.
- Play is separated from the base app; a future play app may consume Spellbook catalog and deck data.
