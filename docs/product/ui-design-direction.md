# UI Design Direction

- Status: Canonical
- Last Reviewed: 2026-04-08
- Source of Truth: mixed
- Update Triggers: major visual direction changes, IA changes, route model changes, game-scoping changes
- Related Docs: [Product Docs](./README.md), [Platform Overview](./platform-overview.md), [Frontend Architecture](../architecture/frontend.md)

Spellbook should feel like a card-world platform, not a generic dashboard.

## Design Position

The product should read as:

- MTG-first today
- multi-TCG-capable in structure
- card-centric in every surface

Cards are the primary visual object. Search, inventory, decks, and future play should all feel like they belong to the same product family while still allowing per-game identity later.

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

The active implemented MTG routes are:

- `/mtg/`
- `/mtg/search`
- `/mtg/inventory`
- `/mtg/decks`

The root route `/` is currently a platform selector.

The old top-level `/search` and `/collections*` flows are transitional only and should not drive new IA decisions.

### Planned route contract

The future game-scoped route model is:

```text
/:game/{index,search,inventory,decks,play}
```

Design work should assume game-scoped navigation, even where only MTG exists today.

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

### Play

- play is a planned pillar only
- docs and design should mention it as future direction without inventing interaction details that the code does not support yet
