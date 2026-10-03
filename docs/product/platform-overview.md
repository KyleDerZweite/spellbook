# Platform overview

- Status: Canonical
- Last Reviewed: 2026-10-03
- Source of Truth: product specification
- Update Triggers: product positioning, supported game, audience, application boundaries
- Related Docs: [Product specification](./specification.md), [Domain model](./domain-model.md), [Routes](./routing-and-games.md), [System overview](../architecture/system-overview.md), [Product index](./README.md)

Spellbook is an open-source MTG inventory and deck builder for private accounts on a self-hosted instance. It combines a searchable local card catalog with owned-card tracking, editable decklists, and comparison against owned printings.

Its primary users are collectors, players building decks from their inventory, and developers who need automation-friendly import and mutation APIs. MTG is the only supported game.

The [product specification](./specification.md) owns requirements, implementation status, acceptance checks, and planned capabilities. Read it before describing a feature as available. The [domain model](./domain-model.md) defines the distinction between catalog cards, printings, inventory entries, and deck requirements.

Public sharing, social feeds, marketplaces, and gameplay simulation are outside the current product. Any future play application is separate from the inventory and deck workspace.
