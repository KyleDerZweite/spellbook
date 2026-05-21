# ADR-0008: MTG-only self-hosted inventory and deck availability

- Status: Accepted
- Last Reviewed: 2026-05-21
- Source of Truth: mixed
- Update Triggers: product positioning changes, non-MTG scope changes, frontend redesign scope changes, inventory/deck workflow changes
- Related Docs: [Platform Overview](../product/platform-overview.md), [Functional Requirements](../product/functional-requirements.md), [Feature Status](../product/feature-status.md), [UI Design Direction](../product/ui-design-direction.md)

## Context

The MTG application market already has mature closed-source tools for broad consumer workflows, including collection management, scanning, deckbuilding, pricing, trading, rules, and simulation.

Trying to compete as another general MTG companion app would create scope creep and weak positioning. The credible niche for Spellbook is narrower:

```text
open-source, self-hosted, automation-friendly MTG inventory and deck availability
```

Spellbook should focus on the workflows where self-hosting and data ownership matter: reliable inventory, physical card location, imports, exports, deck availability, reviewable scan/import commits, and stable automation APIs.

## Decision

Spellbook will focus on MTG only for the current product direction.

The product will prioritize:

- self-hosted ownership of MTG collection data
- exact MTG printing identity
- inventory as the owned physical-card ledger
- physical location tracking
- deck import/export
- deck availability against owned inventory
- reviewable scan/import workflows
- stable APIs for automation and alternate clients

The product will not prioritize:

- Pokemon, Yu-Gi-Oh!, or other TCG support
- generic TCG abstractions
- social deck sharing
- marketplace workflows
- price speculation
- AI deckbuilding
- news feeds
- full gameplay simulation
- native mobile apps before the PWA and APIs are stable

Existing game-aware schema fields and route shapes may remain where already implemented. New work should not add abstraction layers for hypothetical future games.

## Consequences

Product docs, frontend redesign, backend naming, and future implementation planning should describe Spellbook as an MTG application, not as a multi-TCG platform.

The frontend redesign should be delayed until the functional workflow is settled. Visual work should center on search, inventory, deck availability, imports, scan review, and export workflows.

Reusable code should start as internal MTG-specific core logic. A public library should only be considered after multiple real consumers need it.

Non-MTG support remains possible in the long term, but it is not part of current requirements and should not shape near-term code.
