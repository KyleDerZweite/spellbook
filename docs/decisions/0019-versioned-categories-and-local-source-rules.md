# ADR-0019: Versioned categories and local source rules

- Status: Accepted
- Date: 2026-10-06
- Last Reviewed: 2026-10-06
- Owners: Kyle
- Source of Truth: Kyle's Q56 acceptance of the reviewed implementation contract
- Update Triggers: definition versions, rule vocabulary, evaluation priority, source facts, Review/Reset and combo support
- Related Docs: [Card grouping](../product/card-grouping.md), [Category rules](../architecture/category-rules.md), [Classifier research](../integrations/card-categorization.md), [ADR-0015](./0015-shared-backend-use-cases-and-client-contracts.md), [Decisions](./README.md)

## Context

This is accepted design for the next pass, not an implemented capability.

Reusable meanings must not silently reorganize older decks or erase manual choices. The Jev prototype did not establish dependable combo recognition or arbitrary custom semantics. Generic traits cannot alone establish a whole deck strategy.

## Decision

Kyle accepted immutable scoped account-definition versions and deck-local adoption of complete ordered bundles in Q56. Use explicit bounded three-valued source rules, custom first-match priority before starters and preserved manual choices. Whole-deck composition changes trigger durable coalesced reevaluation with adopted definitions and latest valid facts; source refresh alone does not reassign. Record exact provenance and reject stale jobs/previews. Q56 also selected optional local Commander Spellbook bulk matching for supported documented ingredients/outcomes.

## Consequences

Rules and provenance are inspectable without mandatory inference or private-deck uploads. Older bundles preserve meaning, while composition edits may change automatic whole-deck results with newer facts. Unknown source input remains pending rather than becoming false under negation. This avoids retaining every full classifier snapshot. Local combo matching supports only understood constraints and never guarantees execution or complete combo coverage. Free-text semantics and stronger/hybrid classifiers remain deferred.
