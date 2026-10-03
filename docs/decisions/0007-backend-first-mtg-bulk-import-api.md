# ADR-0007: Backend-first MTG bulk and import API

- Status: Accepted
- Last Reviewed: 2026-10-03
- Source of Truth: mixed
- Update Triggers: MTG import contract changes, bulk mutation contract changes, scan-recognition scope changes, frontend implementation scope changes
- Related Docs: [Product specification](../product/specification.md), [Routing and Games](../product/routing-and-games.md), [Postgres](../architecture/postgres.md), [Worker](../architecture/worker.md), [Catalog](../architecture/catalog.md)

## Current applicability

The bulk and import contracts remain accepted. [ADR-0010](./0010-postgres-catalog.md) supersedes the MeiliSearch indexes and atomic-swap implementation with PostgreSQL catalog generations. The temporary pause on frontend work ended with the deck builder implementation on 2026-10-03. Scan recognition remains deferred. [The specification](../product/specification.md) owns current workflow scope.

## Context

Spellbook needs stable MTG backend contracts before another scan-recognition sprint or larger frontend build. Inventory, decks, catalog import resolution, and Scryfall indexing all need predictable behavior for mobile and PWA clients.

## Decision

Stabilize the MTG backend first:

- postpone new frontend product work except existing-route compatibility
- defer scan recognition while preserving existing scan API compatibility
- keep MTG as the only supported game for this sprint
- add explicit idempotent bulk operations for inventory and deck cards: `add`, `set`, `decrement`, and `remove`
- use preview-first MTG Arena-style imports, followed by explicit commit
- create a new deck by default for deck imports
- resolve name-only import lines against `cards_distinct`
- resolve exact printing import lines against `cards_all`
- treat deck legality as warnings only
- harden Scryfall indexing with staging indexes, atomic swaps, import resolver fields, and durable worker state

## Consequences

Frontend clients can build against typed bulk and import contracts without depending on scan-recognition work.

Import commits re-parse and re-resolve text, commit only resolved supported lines, and return unresolved or ambiguous lines to clients.

Legality warnings are intentionally lightweight. Spellbook does not run a complete MTG rules engine in this sprint.

The worker now requires durable state storage in production so sync status survives container recreation.
