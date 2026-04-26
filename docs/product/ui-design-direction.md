# UI Design Direction

- Status: Canonical
- Last Reviewed: 2026-04-25
- Source of Truth: mixed
- Update Triggers: major visual direction changes, IA changes, route model changes, game-scoping changes
- Related Docs: [Product Docs](./README.md), [Platform Overview](./platform-overview.md), [Routing and Games](./routing-and-games.md), [Frontend Architecture](../architecture/frontend.md), [ADR-0004](../decisions/0004-flat-routes-with-active-game-state.md)

Spellbook should feel like a card-world platform, not a generic dashboard.

## Design Position

The product should read as:

- MTG-first today
- multi-TCG-capable in structure
- card-centric in every surface

Cards are the primary visual object. Search, inventory, scan, and decks should all feel like they belong to the same product family while still allowing per-game identity later.

## Visual Language

The active visual direction remains the "Arcane Library" look:

- warm near-black backgrounds
- gold and amber as primary accents
- serif-heavy typography
- ornament used sparingly but intentionally
- card art treated as a first-class surface

This direction is currently strongest for MTG, but the platform should leave room for future game-specific accents and framing.

## Information Architecture

### Current implementation

The active user-facing routes are flat:

- `/`
- `/search`
- `/inventory`
- `/decks` (implemented, hidden from nav and hub)

The active game is held in client state (cookie-backed) and switched through the in-nav `GameSwitcher` rather than the URL. Legacy `/mtg/*` and `/collections*` URLs 308-redirect into the flat surface for backwards compatibility.

### Planned IA direction

Design work should assume the flat surface keeps the same shape as more games ship. Surfaces should branch on the active game in client state, not on the URL. See [ADR-0004](../decisions/0004-flat-routes-with-active-game-state.md).

## Product Surface Notes

### Search

- search is the primary catalog discovery surface
- filters should stay dense, readable, and card-domain specific
- card detail should support printing choice and inventory handoff

### Inventory

- inventory is the canonical owned ledger
- "spellbook" is an MTG inventory presentation mode, not a separate domain object
- the binder-like spellbook view should feel physical and tactile

### Decks

- decks are distinct from owned inventory
- deck UI should continue to show owned-versus-required tension clearly

### Future Separate Play App

- play is not part of the Spellbook base app
- any future play app should consume Spellbook catalog and deck data while defining its own interaction model
