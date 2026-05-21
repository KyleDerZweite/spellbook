# Platform Overview

- Status: Canonical
- Last Reviewed: 2026-05-21
- Source of Truth: mixed
- Update Triggers: product scope changes, MTG workflow changes, route model changes, pillar status changes
- Related Docs: [Product Docs](./README.md), [Functional Requirements](./functional-requirements.md), [Routing and Games](./routing-and-games.md), [Feature Status](./feature-status.md), [System Overview](../architecture/system-overview.md), [ADR-0008](../decisions/0008-mtg-only-self-hosted-inventory-and-deck-availability.md)

Spellbook is an open-source, self-hosted Magic: The Gathering inventory and deck availability application.

The product is not a general TCG platform and is not trying to replace full-service hosted MTG apps. Its core value is private ownership of MTG collection data, reliable import/export, automation-friendly APIs, and physical-card workflows that answer:

- what cards do I own?
- where are those cards?
- what decks can I build from cards that are actually available?
- what cards are missing, already assigned, or only available as alternate printings?

## Current Product State

Spellbook currently supports one game: Magic: The Gathering.

Active product areas:

- search
- inventory
- deck import, export, and availability
- scan review foundation

Current live user-facing routes:

- `/`
- `/search`
- `/inventory`
- `/decks`

Legacy `/mtg/*` and `/collections*` URLs 308-redirect to the matching flat route.

## Product Positioning

Spellbook's credible niche is:

```text
open-source, self-hosted, automation-friendly MTG inventory and deck availability
```

This means Spellbook should prioritize:

- exact MTG card identity and printing resolution
- owned inventory with physical locations
- decklist import/export
- deck availability against owned inventory
- reviewable scan/import flows
- stable APIs for scripts, alternate clients, and future automation
- backup-friendly self-hosted operation

Spellbook should not prioritize:

- non-MTG games
- social deck sharing
- full competitive deckbuilding parity with hosted deck sites
- price speculation or marketplace workflows
- AI deck recommendations
- news feeds
- complete MTG rules simulation
- native mobile clients before the PWA and API are stable

## Product Pillars

| Pillar      | Purpose                                                     | Status                               |
| ----------- | ----------------------------------------------------------- | ------------------------------------ |
| Search      | Find MTG cards and printings from the local catalog index   | Implemented                          |
| Inventory   | Track owned physical MTG cards                              | Implemented, needs location workflow |
| Decks       | Import/export decklists and compare against owned inventory | Implemented, needs product redesign  |
| Scan Review | Capture physical cards into a reviewable commit flow        | Backend foundation                   |
| Automation  | Expose stable APIs for bulk operations and imports          | Implemented for core MTG routes      |

## Data Model Direction

The product model is inventory-and-decks based, not a generic collection abstraction.

- `inventory` is the owned MTG ledger
- `inventory_card` stores owned MTG printing entries
- future location fields should represent binder, box, deck, trade binder, cube, loaned, or other physical placement
- `deck` and `deck_card` store MTG deck data
- `spellbook` is a presentation mode within MTG inventory, not the canonical domain model

This is reflected in the Postgres schema and repository layer.

Play is not part of the Spellbook base application. A future play experience belongs in a separate application that may consume Spellbook catalog and deck data.
