# Decision Records

- Status: Canonical
- Last Reviewed: 2026-10-07
- Source of Truth: mixed
- Update Triggers: major architectural decisions, major product decisions, documentation system changes, supersession of earlier decisions, uniform continuous Lazy browsing
- Related Docs: [ADR Template](./ADR-template.md), [ADR-0001](./0001-docs-first-knowledge-system.md), [ADR-0006](./0006-generic-oidc-and-internal-account-identity.md), [ADR-0007](./0007-backend-first-mtg-bulk-import-api.md), [ADR-0008](./0008-mtg-only-self-hosted-inventory-and-deck-availability.md), [ADR-0009](./0009-local-authentication.md), [ADR-0014](./0014-public-landing-and-private-workspace.md), [Docs Index](../README.md), [Accepted mechanisms](../architecture/application-contract.md), [ADR-0021](./0021-hybrid-browsing-and-contextual-card-dialog.md)

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

- [ADR-0015: Shared backend use cases and client contracts](./0015-shared-backend-use-cases-and-client-contracts.md), workspace/Catalog/Auth/Profile/Dashboard/Inventory/Groups/Deck/Scan/SavedState boundaries implemented; remaining API parity planned

- [ADR-0016: PostgreSQL saved-state invalidation](./0016-postgres-saved-state-invalidation.md), transport and mounted workspace consumers implemented; rendered acceptance recorded separately
- [ADR-0017: Revisioned Inventory windows and mutation receipts](./0017-revisioned-inventory-windows-and-mutation-receipts.md), bounded reads, original mutation receipts and Notes/Description revision protection implemented
- [ADR-0018: Acquisition portions and atomic history restatement](./0018-acquisition-portions-and-atomic-history-restatement.md), superseded by [ADR-0020](./0020-value-only-inventory-history.md); historical cost design, not implemented on main
- [ADR-0019: Versioned categories and local source rules](./0019-versioned-categories-and-local-source-rules.md), starter entry categories and Oracle Tags implemented; account rules, Review/Reset, whole-deck categories and combos planned

- [ADR-0020: Value-only Inventory history](./0020-value-only-inventory-history.md), accepted scope; personal capture design and implementation pending

- [ADR-0021: Hybrid browsing and contextual Card dialog](./0021-hybrid-browsing-and-contextual-card-dialog.md), API, Shell, result-window foundations and contextual Card actions implemented; uniform continuous Lazy source implemented; local composed verification recorded with [slice 19](https://github.com/KyleDerZweite/spellbook/issues/192); partially supersedes ADR-0014 and ADR-0017 for affected browser UI and read limits
