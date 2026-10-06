# Decision Records

- Status: Canonical
- Last Reviewed: 2026-10-06
- Source of Truth: mixed
- Update Triggers: major architectural decisions, major product decisions, documentation system changes, supersession of earlier decisions
- Related Docs: [ADR Template](./ADR-template.md), [ADR-0001](./0001-docs-first-knowledge-system.md), [ADR-0006](./0006-generic-oidc-and-internal-account-identity.md), [ADR-0007](./0007-backend-first-mtg-bulk-import-api.md), [ADR-0008](./0008-mtg-only-self-hosted-inventory-and-deck-availability.md), [ADR-0009](./0009-local-authentication.md), [ADR-0014](./0014-public-landing-and-private-workspace.md), [Docs Index](../README.md), [Accepted mechanisms](../architecture/application-contract.md)

This section stores architecture and product decision records.

Use an ADR when:

- a significant tradeoff was made
- a structural product or system direction was chosen
- a decision should be discoverable after the original implementation context is gone

ADR statuses:

- Proposed
- Accepted
- Superseded
- Deprecated

Rules:

- use zero-padded numbering
- never renumber existing ADRs
- keep filenames stable after creation
- link affected canonical docs from the ADR

## Files

- [ADR template](./ADR-template.md)
- [ADR-0001: Docs-first knowledge system](./0001-docs-first-knowledge-system.md)
- [ADR-0002: Android-first mobile client and server-side scan pipeline](./0002-android-first-mobile-and-server-side-scan.md) (superseded by ADR-0003)
- [ADR-0003: PWA-first mobile client and server-side scan pipeline](./0003-pwa-first-mobile-and-server-side-scan.md)
- [ADR-0004: Flat user-facing routes with active game in client state](./0004-flat-routes-with-active-game-state.md) (superseded by ADR-0008 for product scope and ADR-0013 for page routing)
- [ADR-0005: Postgres core data and separated play app](./0005-postgres-core-data-and-separated-play-app.md)
- [ADR-0006: Generic OIDC and internal account identity](./0006-generic-oidc-and-internal-account-identity.md), superseded by ADR-0009
- [ADR-0007: Backend-first MTG bulk and import API](./0007-backend-first-mtg-bulk-import-api.md)
- [ADR-0008: MTG-only self-hosted inventory and deck availability](./0008-mtg-only-self-hosted-inventory-and-deck-availability.md)
- [ADR-0009: Local authentication with stable account ownership](./0009-local-authentication.md)
- [ADR-0010: Store and search the catalog in PostgreSQL](./0010-postgres-catalog.md)

- [ADR-0011: A card-led collector workspace](./0011-collector-workspace-design.md)

- [ADR-0012: Public catalog browsing](./0012-public-catalog-browsing.md)

- [ADR-0013: Game-prefixed workspaces](./0013-game-prefixed-workspaces.md)

- [ADR-0014: Public landing and private workspace](./0014-public-landing-and-private-workspace.md)

- [ADR-0015: Shared backend use cases and client contracts](./0015-shared-backend-use-cases-and-client-contracts.md), accepted for the next pass; not implemented

- [ADR-0016: PostgreSQL saved-state invalidation](./0016-postgres-saved-state-invalidation.md), accepted design; not implemented
- [ADR-0017: Revisioned Inventory windows and mutation receipts](./0017-revisioned-inventory-windows-and-mutation-receipts.md), accepted design; not implemented
- [ADR-0018: Acquisition portions and atomic history restatement](./0018-acquisition-portions-and-atomic-history-restatement.md), accepted design; not implemented
- [ADR-0019: Versioned categories and local source rules](./0019-versioned-categories-and-local-source-rules.md), accepted design; not implemented
