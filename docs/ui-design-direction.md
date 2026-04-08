# Spellbook UI Design Direction

**Status:** Active design direction

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

## Typography

Keep the current type pairing:

- `Cinzel` for display headings
- `Crimson Pro` for body copy
- `JetBrains Mono` for technical or coded values

Avoid modern SaaS-looking sans serif substitutions in core product surfaces.

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

- Search is the primary catalog discovery surface.
- Filters should stay dense, readable, and card-domain specific.
- Card detail should support printing choice and inventory handoff.

### Inventory

- Inventory is the canonical owned ledger.
- "Spellbook" is an MTG inventory presentation mode, not a separate domain object.
- The binder-like spellbook view should feel physical and tactile.

### Decks

- Decks are distinct from owned inventory.
- Deck UI should continue to show owned-versus-required tension clearly.

### Play

- Play is a planned pillar only.
- Docs and design should mention it as future direction without inventing interaction details that the code does not support yet.

## Multi-TCG Extension Rules

- New games should inherit shared layout principles, spacing discipline, and interaction quality.
- New games do not need to reuse MTG-specific symbols, palette accents, or terminology.
- Game identity should live in accents, iconography, and vocabulary, not in a different product shell.

## Active Design Constraints

- Do not regress to collection-centric IA in active docs or new designs.
- Do not document top-level `/collections` as a real product area.
- Do not imply Pokemon or Yu-Gi-Oh! design surfaces already exist in code.

## Current Reference Components

The current frontend already reflects much of this direction through:

- top navigation
- MTG landing page
- MTG search
- MTG inventory with list and spellbook modes
- MTG decks

Future design docs should build from those implemented surfaces instead of the superseded collection-era concepts.
