# UI Design Direction

- Status: Canonical
- Last Reviewed: 2026-05-21
- Source of Truth: mixed
- Update Triggers: major visual direction changes, IA changes, route model changes, MTG workflow changes
- Related Docs: [Product Docs](./README.md), [Platform Overview](./platform-overview.md), [Functional Requirements](./functional-requirements.md), [Routing and Games](./routing-and-games.md), [Frontend Architecture](../architecture/frontend.md), [ADR-0008](../decisions/0008-mtg-only-self-hosted-inventory-and-deck-availability.md)

Spellbook should feel like a focused MTG collection workspace, not a generic dashboard and not a broad TCG platform.

The current frontend is not the final visual direction. Functional workflow should be settled before a full redesign.

## Design Position

The product should read as:

- MTG-only
- private and self-hosted
- practical for repeat inventory and deck-availability workflows
- card-centric, but operationally clear
- aligned to the owner brand direction after functionality is decided

Cards are the primary visual object, but the frontend should optimize for clarity and repeated work. Search, inventory, decks, imports, and scan review should feel like one focused MTG tool.

## Visual Language

Future design should prioritize:

- simple navigation
- dense but readable inventory and deck tables
- clear card thumbnails and printing identity
- explicit actions for import, commit, move, assign, and export
- restrained visual styling
- mobile-friendly review flows

Avoid locking future implementation into:

- decorative landing-page composition
- game-switching UI
- social or community surfaces
- generic TCG framing
- visual effects that compete with card data

## Information Architecture

### Current implementation

The active user-facing routes are flat:

- `/`
- `/search`
- `/inventory`
- `/decks`

MTG is the only supported game. Legacy `/mtg/*` and `/collections*` URLs 308-redirect into the flat surface for backwards compatibility.

### Future IA direction

The frontend should be reorganized around the core workflows:

- search catalog
- manage inventory
- import inventory
- import deck
- inspect deck availability
- review scan/import candidates
- export or automate

The exact visual treatment should come after these workflows are clear and tested.

## Product Surface Notes

### Search

- search is the primary catalog discovery surface
- filters should stay dense, readable, and MTG-specific
- card detail should support printing choice and inventory handoff

### Inventory

- inventory is the canonical owned ledger
- physical location and availability should become first-class concepts
- list/table workflows should be favored before decorative collection views
- "spellbook" is an MTG inventory presentation mode, not a separate domain object

### Decks

- decks are distinct from owned inventory
- deck UI should focus on availability: owned, missing, alternate printing available, and already assigned elsewhere
- deck import/export should be easy to find and safe to use

### Scan Review

- scan recognition should feed a review queue, not silently mutate inventory
- ambiguous or low-confidence results should be explicit and correctable
- commit should reuse canonical inventory mutation behavior

### Future Separate Play App

- play is not part of the Spellbook base app
- any future play app should consume Spellbook catalog and deck data while defining its own interaction model
