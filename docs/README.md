# Spellbook Docs

- Status: Canonical
- Last Reviewed: 2026-04-08
- Source of Truth: mixed
- Update Triggers: docs structure, canonical doc locations, historical-doc policy, maintenance workflow
- Related Docs: [Product](./product/README.md), [Architecture](./architecture/README.md), [Operations](./operations/README.md), [Integrations](./integrations/README.md), [Decisions](./decisions/README.md), [Reference](./reference/README.md)

This is the mandatory entrypoint for repository documentation.

## What Is Canonical

Canonical docs live under the typed sections in `docs/`:

- [Product](./product/README.md)
- [Architecture](./architecture/README.md)
- [Operations](./operations/README.md)
- [Integrations](./integrations/README.md)
- [Decisions](./decisions/README.md)
- [Reference](./reference/README.md)

Use these for active project truth.

## Historical Material

Superseded documentation should not stay on the active docs surface.

When an old doc is no longer useful as active documentation, delete it and rely on git history for the historical record.

## Taxonomy

### Product

Use [product](./product/README.md) for:

- product behavior
- route surfaces
- terminology
- feature status
- implemented versus planned distinctions

### Architecture

Use [architecture](./architecture/README.md) for:

- internal system shape
- data flow
- subsystem boundaries
- backend and frontend contracts

### Operations

Use [operations](./operations/README.md) for:

- deployment
- auth provider setup
- required env vars
- operator-facing guidance

### Integrations

Use [integrations](./integrations/README.md) for:

- vendor-specific or service-specific technical details

### Decisions

Use [decisions](./decisions/README.md) for:

- architectural or product decisions
- tradeoffs
- consequences
- follow-up implications

### Reference

Use [reference](./reference/README.md) for:

- low-volatility helper docs
- external doc indexes
- dependency reference notes

## Contributor Maintenance Rules

- If behavior, routes, schema, auth flow, env vars, or operator steps change, update the relevant canonical doc in the same change.
- If a significant architectural or product decision is made, create or update an ADR in `docs/decisions/`.
- If a doc becomes historical or superseded, remove it from the active surface and rely on git history instead of keeping an in-repo archive tree.
- Do not create long-lived project knowledge markdown in random repo locations.
- Use plain markdown only. No Obsidian-only syntax.

## Current Project State

- MTG is the only implemented game.
- The active route surface is documented in [product/routing-and-games.md](./product/routing-and-games.md).
- The current system architecture is documented in [architecture/system-overview.md](./architecture/system-overview.md).
- The MeiliSearch integration is documented in [integrations/meilisearch/README.md](./integrations/meilisearch/README.md).
