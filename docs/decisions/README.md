# Decision Records

- Status: Canonical
- Last Reviewed: 2026-11-18
- Source of Truth: mixed
- Update Triggers:
  - managed Category removal
  - ADR-0029 pre-release extension
  - ADR-0028 versioned game API
  - ADR-0027 functional migration acceptance and partial supersession
  - complete unmerged Python execution scope and separate production gates
  - accepted Python migration framework and delivery contract
  - Python API/worker language selection and migration planning
  - major architectural decisions
  - major product decisions, including Cardstation physical-storage boundary
  - documentation system changes
  - supersession of earlier decisions
  - uniform continuous Lazy browsing
  - local recognition direction and independent Android design clarification
- Related Docs:
  - [ADR Template](./ADR-template.md)
  - [ADR-0001](./0001-docs-first-knowledge-system.md)
  - [ADR-0006](./0006-generic-oidc-and-internal-account-identity.md)
  - [ADR-0007](./0007-backend-first-mtg-bulk-import-api.md)
  - [ADR-0008](./0008-mtg-only-self-hosted-inventory-and-deck-availability.md)
  - [ADR-0009](./0009-local-authentication.md)
  - [ADR-0014](./0014-public-landing-and-private-workspace.md)
  - [Docs Index](../README.md)
  - [Accepted mechanisms](../architecture/application-contract.md)
  - [ADR-0021](./0021-hybrid-browsing-and-contextual-card-dialog.md)
  - [ADR-0030](./0030-cardstation-physical-storage.md)
  - [ADR-0023](./0023-local-recognition-in-scanner-clients.md)
  - [Python direction](./0025-python-api-and-workers.md)
  - [Functional Python acceptance](./0027-python-functional-migration-acceptance.md)

> **TL;DR**
>
> - An ADR records **why** a significant choice was made.
> - Newest first below. Check the Status column before you rely on one.
> - "Superseded" means a later ADR replaced it. Follow the link.
> - New ADR? Copy the [template](./ADR-template.md) and take the next free number.

## When to write an ADR

Write one when:

- a significant tradeoff was made
- a structural product or system direction was chosen
- a decision should be discoverable after the original implementation context is gone

## Rules

- Status is one of: Proposed, Accepted, Superseded, Deprecated.
- Use zero-padded numbering.
- Never renumber existing ADRs.
- Keep filenames stable after creation.
- Link affected canonical docs from the ADR.

## Files

| ADR                                                                    | Decision                                                  | Status                      | Notes                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [0030](./0030-cardstation-physical-storage.md)                         | Cardstation modes and physical storage                    | Accepted                    | Offline-first, new-only Inventory intake, quantity allocation per independent physical Box, and no automatic ownership changes from re-sorting                                                                                                                                                                             |
| [0029](./0029-remove-replaced-interfaces.md)                           | Remove replaced interfaces immediately                    | Accepted                    | Removal policy and 2026-10-25 pre-release extension; supersedes legacy API aliases and cross-version API/stored-data upgrade guarantees                                                                                                                                                                                    |
| [0028](./0028-versioned-game-api.md)                                   | Versioned API with game-specific modules                  | Accepted, partly superseded | Canonical API namespaces and explicit MTG ownership; legacy aliases superseded by ADR-0029                                                                                                                                                                                                                                 |
| [0027](./0027-python-functional-migration-acceptance.md)               | Functional acceptance for the Python migration            | Accepted, partly superseded | Supersedes strict performance/resource blockers with current functional safety and separate production operations; cross-version compatibility superseded by ADR-0029                                                                                                                                                      |
| [0026](./0026-python-migration-contract.md)                            | Python migration framework and delivery contract          | Accepted, partly superseded | Complete unmerged source implementation scope; performance/resource readiness superseded by ADR-0027; production cutover, migrator rollout and end of the real rollback window remain separately authorized                                                                                                                |
| [0025](./0025-python-api-and-workers.md)                               | Python for the API and server workers                     | Accepted                    | Language direction; migration design follows ADR-0026                                                                                                                                                                                                                                                                      |
| [0024](./0024-independent-applications.md)                             | Independent web, API and Android applications             | Accepted, partly superseded | Runtime extraction and Kotlin/Compose selection; first slice integrated, native target acceptance pending                                                                                                                                                                                                                  |
| [0023](./0023-local-recognition-in-scanner-clients.md)                 | Local recognition in scanner clients                      | Accepted                    | Android-first app with distinct mobile layout and shared API supporting QR/card scanning; initial PWA/QR implemented; separate Android application selected, with Kotlin/Compose and the implementation contract selected by ADR-0024; Jetson-owned Cardstation execution                                                  |
| [0022](./0022-daily-value-observation-checkpoints.md)                  | Daily value observation checkpoints                       | Accepted                    | Daily observation persistence, runtime and private presentation implemented                                                                                                                                                                                                                                                |
| [0021](./0021-hybrid-browsing-and-contextual-card-dialog.md)           | Hybrid browsing and contextual Card dialog                | Accepted                    | API, Shell, result-window foundations and contextual Card actions implemented; uniform continuous Lazy source implemented; local composed verification recorded with [slice 19](https://github.com/KyleDerZweite/spellbook/issues/192); partially supersedes ADR-0014 and ADR-0017 for affected browser UI and read limits |
| [0020](./0020-value-only-inventory-history.md)                         | Value-only Inventory history                              | Accepted                    | Value-only personal history implemented under ADR-0022                                                                                                                                                                                                                                                                     |
| [0018](./0018-acquisition-portions-and-atomic-history-restatement.md)  | Acquisition portions and atomic history restatement       | Superseded by ADR-0020      | Historical cost design, not implemented on main                                                                                                                                                                                                                                                                            |
| [0017](./0017-revisioned-inventory-windows-and-mutation-receipts.md)   | Revisioned Inventory windows and mutation receipts        | Accepted                    | Bounded reads, original mutation receipts and Notes/Description revision protection implemented                                                                                                                                                                                                                            |
| [0016](./0016-postgres-saved-state-invalidation.md)                    | PostgreSQL saved-state invalidation                       | Accepted                    | Transport and mounted workspace consumers implemented; rendered acceptance recorded separately                                                                                                                                                                                                                             |
| [0015](./0015-shared-backend-use-cases-and-client-contracts.md)        | Shared backend use cases and client contracts             | Accepted                    | Workspace/Catalog/Auth/Profile/Dashboard/Inventory/Groups/Deck/Scan/SavedState boundaries implemented; independent runtime delivery advances under ADR-0024                                                                                                                                                                |
| [0014](./0014-public-landing-and-private-workspace.md)                 | Public landing and private workspace                      | Accepted                    |                                                                                                                                                                                                                                                                                                                            |
| [0013](./0013-game-prefixed-workspaces.md)                             | Game-prefixed workspaces                                  | Accepted, partly superseded | Flat-page compatibility redirects superseded by ADR-0029                                                                                                                                                                                                                                                                   |
| [0012](./0012-public-catalog-browsing.md)                              | Public catalog browsing                                   | Accepted, partly superseded | API path and separate mobile access requirements superseded by ADR-0028                                                                                                                                                                                                                                                    |
| [0011](./0011-collector-workspace-design.md)                           | A card-led collector workspace                            | Accepted                    |                                                                                                                                                                                                                                                                                                                            |
| [0010](./0010-postgres-catalog.md)                                     | Store and search the catalog in PostgreSQL                | Accepted                    |                                                                                                                                                                                                                                                                                                                            |
| [0009](./0009-local-authentication.md)                                 | Local authentication with stable account ownership        | Accepted                    |                                                                                                                                                                                                                                                                                                                            |
| [0008](./0008-mtg-only-self-hosted-inventory-and-deck-availability.md) | MTG-only self-hosted inventory and deck availability      | Accepted                    |                                                                                                                                                                                                                                                                                                                            |
| [0007](./0007-backend-first-mtg-bulk-import-api.md)                    | Backend-first MTG bulk and import API                     | Accepted                    |                                                                                                                                                                                                                                                                                                                            |
| [0006](./0006-generic-oidc-and-internal-account-identity.md)           | Generic OIDC and internal account identity                | Superseded by ADR-0009      |                                                                                                                                                                                                                                                                                                                            |
| [0005](./0005-postgres-core-data-and-separated-play-app.md)            | Postgres core data and separated play app                 | Accepted                    |                                                                                                                                                                                                                                                                                                                            |
| [0004](./0004-flat-routes-with-active-game-state.md)                   | Flat user-facing routes with active game in client state  | Superseded                  | By ADR-0008 for product scope and ADR-0013 for page routing                                                                                                                                                                                                                                                                |
| [0003](./0003-pwa-first-mobile-and-server-side-scan.md)                | PWA-first mobile client and server-side scan pipeline     | Accepted, partly superseded | Future capture and recognition placement superseded by ADR-0023                                                                                                                                                                                                                                                            |
| [0002](./0002-android-first-mobile-and-server-side-scan.md)            | Android-first mobile client and server-side scan pipeline | Superseded by ADR-0003      |                                                                                                                                                                                                                                                                                                                            |
| [0001](./0001-docs-first-knowledge-system.md)                          | Docs-first knowledge system                               | Accepted                    |                                                                                                                                                                                                                                                                                                                            |

There is no ADR-0019. Use the [ADR template](./ADR-template.md) for new records.
