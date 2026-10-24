# Decision Records

- Status: Canonical
- Last Reviewed: 2026-10-24
- Source of Truth: mixed
- Update Triggers: ADR-0028 versioned game API, ADR-0027 functional migration acceptance and partial supersession, complete unmerged Python execution scope and separate production gates, accepted Python migration framework and delivery contract, Python API/worker language selection and migration planning, major architectural decisions, major product decisions, documentation system changes, supersession of earlier decisions, uniform continuous Lazy browsing, local recognition direction and independent Android design clarification
- Related Docs: [ADR Template](./ADR-template.md), [ADR-0001](./0001-docs-first-knowledge-system.md), [ADR-0006](./0006-generic-oidc-and-internal-account-identity.md), [ADR-0007](./0007-backend-first-mtg-bulk-import-api.md), [ADR-0008](./0008-mtg-only-self-hosted-inventory-and-deck-availability.md), [ADR-0009](./0009-local-authentication.md), [ADR-0014](./0014-public-landing-and-private-workspace.md), [Docs Index](../README.md), [Accepted mechanisms](../architecture/application-contract.md), [ADR-0021](./0021-hybrid-browsing-and-contextual-card-dialog.md), [ADR-0023](./0023-local-recognition-in-scanner-clients.md), [Python direction](./0025-python-api-and-workers.md), [Functional Python acceptance](./0027-python-functional-migration-acceptance.md)

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

- [ADR-0029: Remove replaced interfaces immediately](./0029-remove-replaced-interfaces.md), accepted removal policy; supersedes legacy API aliases and requires older clients to update

- [ADR-0028: Versioned API with game-specific modules](./0028-versioned-game-api.md), accepted canonical API namespaces and explicit MTG ownership; legacy aliases superseded by ADR-0029

- [ADR-0027: Functional acceptance for the Python migration](./0027-python-functional-migration-acceptance.md), accepted; supersedes strict performance/resource blockers while preserving functional compatibility and separate production operations

- [ADR-0026: Python migration framework and delivery contract](./0026-python-migration-contract.md), accepted complete unmerged source implementation scope, performance/resource readiness superseded by ADR-0027; production cutover, migrator rollout and end of the real rollback window remain separately authorized

- [ADR-0025: Python for the API and server workers](./0025-python-api-and-workers.md), accepted language direction; migration design follows ADR-0026

- [ADR-0024: Independent web, API and Android applications](./0024-independent-applications.md), accepted runtime extraction and Kotlin/Compose selection; first slice integrated, native target acceptance pending

- [ADR template](./ADR-template.md)
- [ADR-0001: Docs-first knowledge system](./0001-docs-first-knowledge-system.md)
- [ADR-0002: Android-first mobile client and server-side scan pipeline](./0002-android-first-mobile-and-server-side-scan.md) (superseded by ADR-0003)
- [ADR-0003: PWA-first mobile client and server-side scan pipeline](./0003-pwa-first-mobile-and-server-side-scan.md), future capture and recognition placement superseded by ADR-0023
- [ADR-0004: Flat user-facing routes with active game in client state](./0004-flat-routes-with-active-game-state.md) (superseded by ADR-0008 for product scope and ADR-0013 for page routing)
- [ADR-0005: Postgres core data and separated play app](./0005-postgres-core-data-and-separated-play-app.md)
- [ADR-0006: Generic OIDC and internal account identity](./0006-generic-oidc-and-internal-account-identity.md), superseded by ADR-0009
- [ADR-0007: Backend-first MTG bulk and import API](./0007-backend-first-mtg-bulk-import-api.md)
- [ADR-0008: MTG-only self-hosted inventory and deck availability](./0008-mtg-only-self-hosted-inventory-and-deck-availability.md)
- [ADR-0009: Local authentication with stable account ownership](./0009-local-authentication.md)
- [ADR-0010: Store and search the catalog in PostgreSQL](./0010-postgres-catalog.md)

- [ADR-0011: A card-led collector workspace](./0011-collector-workspace-design.md)

- [ADR-0012: Public catalog browsing](./0012-public-catalog-browsing.md)

- [ADR-0013: Game-prefixed workspaces](./0013-game-prefixed-workspaces.md), flat-page compatibility redirects superseded by ADR-0029

- [ADR-0014: Public landing and private workspace](./0014-public-landing-and-private-workspace.md)

- [ADR-0015: Shared backend use cases and client contracts](./0015-shared-backend-use-cases-and-client-contracts.md), workspace/Catalog/Auth/Profile/Dashboard/Inventory/Groups/Deck/Scan/SavedState boundaries implemented; independent runtime delivery advances under ADR-0024

- [ADR-0016: PostgreSQL saved-state invalidation](./0016-postgres-saved-state-invalidation.md), transport and mounted workspace consumers implemented; rendered acceptance recorded separately
- [ADR-0017: Revisioned Inventory windows and mutation receipts](./0017-revisioned-inventory-windows-and-mutation-receipts.md), bounded reads, original mutation receipts and Notes/Description revision protection implemented
- [ADR-0018: Acquisition portions and atomic history restatement](./0018-acquisition-portions-and-atomic-history-restatement.md), superseded by [ADR-0020](./0020-value-only-inventory-history.md); historical cost design, not implemented on main
- [ADR-0019: Versioned categories and local source rules](./0019-versioned-categories-and-local-source-rules.md), starter entry categories, Oracle Tags, account rules, scoped Review/Reset and whole-deck evaluation implemented; optional local combos implemented

- [ADR-0020: Value-only Inventory history](./0020-value-only-inventory-history.md), accepted scope; value-only personal history implemented under ADR-0022

- [ADR-0021: Hybrid browsing and contextual Card dialog](./0021-hybrid-browsing-and-contextual-card-dialog.md), API, Shell, result-window foundations and contextual Card actions implemented; uniform continuous Lazy source implemented; local composed verification recorded with [slice 19](https://github.com/KyleDerZweite/spellbook/issues/192); partially supersedes ADR-0014 and ADR-0017 for affected browser UI and read limits
- [ADR-0022: Daily value observation checkpoints](./0022-daily-value-observation-checkpoints.md), daily observation persistence, runtime and private presentation implemented

- [ADR-0023: Local recognition in scanner clients](./0023-local-recognition-in-scanner-clients.md), local recognition; Android-first app with distinct mobile layout and shared API supporting QR/card scanning; initial PWA/QR implemented; separate Android application selected, with Kotlin/Compose and the implementation contract selected by ADR-0024; Jetson-owned Cardstation execution
