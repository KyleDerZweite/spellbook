# Functional Requirements

- Status: Canonical
- Last Reviewed: 2026-05-21
- Source of Truth: mixed
- Update Triggers: product scope changes, inventory workflow changes, deck availability changes, scan review changes, import/export changes
- Related Docs: [Product Docs](./README.md), [Platform Overview](./platform-overview.md), [Feature Status](./feature-status.md), [Routing and Games](./routing-and-games.md), [UI Design Direction](./ui-design-direction.md), [ADR-0008](../decisions/0008-mtg-only-self-hosted-inventory-and-deck-availability.md)

This document defines what Spellbook must do before the frontend is redesigned. Visual direction is intentionally separate from these functional requirements.

## Product Goal

Spellbook must be an open-source, self-hosted, automation-friendly MTG inventory and deck availability system.

The core user outcome is:

```text
I can trust Spellbook as the source of truth for what MTG cards I own, where they are, and what decks I can build from available physical cards.
```

## Primary Users

- self-hosters who want ownership of their MTG data
- collectors with enough cards that physical location matters
- players who build decks from cards they actually own
- developers who want stable APIs for scripts, imports, exports, or alternate clients
- households or small playgroups that may later share private inventory workflows

## Functional Scope

### Search

Spellbook must let users search the local MTG catalog and inspect printings.

Requirements:

- search by card name and useful MTG fields
- show enough printing identity to distinguish set, collector number, finish availability, and image
- allow adding a selected printing to inventory
- keep catalog search backed by local indexed Scryfall data

Non-goals:

- replace Scryfall advanced search completely
- support non-MTG catalogs

### Inventory

Spellbook must treat inventory as the owned physical-card ledger.

Requirements:

- add, edit, decrement, remove, and bulk mutate inventory entries
- track exact printing identity where known
- track quantity, finish, condition, and notes
- support idempotent bulk operations for automation
- import inventory from text lists and, later, common CSV formats
- expose inventory through the UI and API

Next required capability:

- track physical location, such as binder, box, deck, cube, trade binder, loaned, or other user-defined places

Non-goals:

- full accounting/finance portfolio management
- marketplace listing workflows
- social collection sharing

### Decks

Spellbook must support decklists as objects that can be imported, edited enough for inventory comparison, exported, and checked against owned cards.

Requirements:

- import MTG Arena-style decklists with preview before commit
- export MTG Arena-style decklists
- support main, sideboard, commander, and companion roles
- warn about basic structural legality issues without blocking user action
- compare deck requirements against owned inventory

Next required capability:

- distinguish owned, missing, alternate printing available, and already assigned elsewhere
- produce a build plan that explains which physical cards would move into the deck

Non-goals:

- compete with Moxfield or Archidekt as a full social deckbuilder
- collaborative deck editing
- public deck pages
- full rules-engine legality validation
- playtesting or gameplay simulation

### Deck Availability

Deck availability is the central differentiator.

Spellbook must answer:

- do I own this card?
- do I own this exact printing?
- do I own an alternate printing?
- is the card available, or already assigned to another deck/location?
- where is the card physically located?
- what is still missing?

Required output for a deck:

- available exact matches
- available alternate printings
- unavailable because already assigned
- missing
- optional warnings

### Imports and Exports

Spellbook must be excellent at moving data in and out.

Requirements:

- preview before commit
- preserve unresolved and ambiguous lines in previews
- commit only explicitly resolved lines
- support deck import and inventory import
- export decks as plain text
- keep APIs stable enough for scripts

Later importer profiles should target:

- ManaBox CSV
- Moxfield CSV or exported text
- Archidekt export formats
- generic CSV with user-mapped columns

Non-goals:

- scraping hosted services without clear user export input
- depending on unstable private APIs as the primary integration path

### Scan Review

Scan recognition should feed a review workflow, not silently mutate inventory.

Requirements:

- create scan sessions
- store scan artifacts
- show candidate matches
- commit reviewed cards to inventory through the same canonical inventory mutation path
- preserve API compatibility while recognition improves

Non-goals:

- making scan recognition the next product centerpiece before inventory/deck availability is clear
- committing low-confidence recognition automatically

### Automation API

Spellbook must expose stable automation-friendly endpoints for core workflows.

Requirements:

- idempotent inventory bulk mutations
- idempotent deck bulk mutations
- import preview and commit endpoints
- structured errors
- OpenAPI coverage for supported routes

Non-goals:

- broad plugin systems
- non-MTG API abstractions

## Frontend Requirements Before Redesign

The frontend should be redesigned after the functional shape is settled.

The redesigned frontend must provide these workflows:

1. Search catalog and add a selected printing to inventory.
2. View inventory with useful filters, sorting, and physical location.
3. Bulk import inventory with preview and commit.
4. Create or import a deck.
5. View deck availability against inventory.
6. Produce a deck build plan from available physical cards.
7. Review scan/import candidates before committing to inventory.
8. Export decks and inventory data.

The frontend should optimize for repeated work:

- dense but readable tables
- clear card thumbnails
- explicit printing identity
- obvious primary actions
- minimal decorative chrome
- mobile-friendly review and commit flows

## Out of Scope

- Pokemon, Yu-Gi-Oh!, or other TCG support
- generic game abstraction work
- hosted social network features
- public deck sharing
- marketplace selling
- price speculation
- AI deckbuilding
- news and content feeds
- native mobile clients
- full gameplay simulator

## Suggested Implementation Order

1. Confirm inventory and deck API behavior with real integration tests.
2. Add physical location support to the inventory data model.
3. Add deck availability computation against inventory.
4. Add a build-plan model for moving cards from locations into decks.
5. Simplify the frontend information architecture around search, inventory, decks, imports, and review.
6. Redesign the visual system after workflows are proven.
7. Add importer profiles for ManaBox, Moxfield, Archidekt, and generic CSV.
8. Improve scan recognition only after review and commit flows are stable.
