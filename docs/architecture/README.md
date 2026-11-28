# Architecture

- Status: Canonical
- Last Reviewed: 2026-11-28
- Source of Truth: code and explicitly marked accepted design
- Update Triggers:
  - managed Category removal
  - merged PR 276 status reconciliation
  - ADR-0029 immediate removal of replaced API interfaces
  - Python default activation and Node source/test contraction
  - functional Python acceptance and retired strict resource gates
  - complete unmerged Python execution scope and operational separation
  - accepted Python migration contract and independent review
  - Python API/worker language selection and migration planning
  - independent API/web ownership and relocated code references
  - schema changes
  - repository changes
  - auth flow changes
  - worker flow changes
  - service boundaries and reviewed module contracts
- Related Docs:
  - [System Overview](./system-overview.md)
  - [Frontend](./frontend.md)
  - [Postgres](./postgres.md)
  - [Worker](./worker.md)
  - [Catalog](./catalog.md)
  - [Auth](./auth.md)
  - [Mobile And Scan](./mobile-and-scan.md)
  - [Docs Index](../README.md)
  - [Application contract](./application-contract.md)
  - [Valuation](./valuation.md)
  - [Independent applications](./independent-applications.md)
  - [Backend language evaluation](../integrations/backend-language-evaluation.md)
  - [Python direction](../decisions/0025-python-api-and-workers.md)
  - [Migration evidence](./python-migration-evidence-baseline.md)
  - [Functional Python acceptance](../decisions/0027-python-functional-migration-acceptance.md)

> **TL;DR**
>
> - How Spellbook is built: services, data, authentication and contracts.
> - Start with the [system overview](./system-overview.md).
> - Docs mark what is **implemented**, what is an **accepted design** and what is a **proposal**.
> - Requirements live in the [product specification](../product/specification.md), not here.

## Current state

- **Applications:** [Independent applications](./independent-applications.md) owns the HTTP boundary
  between web, API and the planned Expo mobile app, and the implemented remote web adapter.
- **Python backend:** [ADR-0025](../decisions/0025-python-api-and-workers.md) selects Python for the
  API and workers. [The evaluation](../integrations/backend-language-evaluation.md) records the
  tradeoffs.
- **Migration:** The [migration contract](./python-backend-migration.md) records framework, wire and
  SQL ownership, and the implementation merged through
  [PR 276](https://github.com/KyleDerZweite/spellbook/pull/276). The merged source uses Python by
  default. It also owns pre-release compatibility and recovery requirements.
- **Not done here:** Production cutover and productive migrator rollout are separate operations.
- **Evidence:** The [migration evidence baseline](./python-migration-evidence-baseline.md) owns
  functional evidence and retained synthetic fixtures.
  [ADR-0027](../decisions/0027-python-functional-migration-acceptance.md) replaces strict
  performance and resource prerequisites with functional acceptance.

## Documents

| Owner                                                                  | Subject                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Application contract](./application-contract.md)                      | Workspace/Catalog/Auth/Profile/Dashboard, Inventory/Groups reads and mutations, Deck application/shared UI, Scan upload/read/result/review, SavedState transport and mounted workspace sync, Scryfall/optional references, bounded public source history, private daily Inventory history, Dashboard/selected-Deck estimates implemented; later contracts planned |
| [Valuation](./valuation.md)                                            | Scryfall/optional reference publication, reads and bounded public source history implemented; private daily Inventory history and Dashboard/selected-Deck estimates implemented                                                                                                                                                                                   |
| [Independent applications](./independent-applications.md)              | Web/API/mobile ownership, HTTP parity and native acceptance contract                                                                                                                                                                                                                                                                                              |
| [Python migration](./python-backend-migration.md)                      | Accepted framework, packages, schema/migration ownership, reviewed delivery gates and rollback                                                                                                                                                                                                                                                                    |
| [Migration evidence baseline](./python-migration-evidence-baseline.md) | Current OpenAPI, retained synthetic fixtures, Python runtime acceptance and remaining target evidence                                                                                                                                                                                                                                                             |
| [System overview](./system-overview.md)                                | Runtime topology and data ownership                                                                                                                                                                                                                                                                                                                               |
| [Frontend](./frontend.md)                                              | Server rendering, shared Deck presentation/native forms, and runtime compatibility                                                                                                                                                                                                                                                                                |
| [Postgres](./postgres.md)                                              | Persisted state, ownership, and mutation replay                                                                                                                                                                                                                                                                                                                   |
| [Catalog](./catalog.md)                                                | Catalog/price storage, publication, and search                                                                                                                                                                                                                                                                                                                    |
| [Worker](./worker.md)                                                  | Catalog/price ingestion and synchronization                                                                                                                                                                                                                                                                                                                       |
| [Authentication](./auth.md)                                            | Local credentials, sessions, and origin protection                                                                                                                                                                                                                                                                                                                |
| [Mobile and scan](./mobile-and-scan.md)                                | API validation, retained uploads/review and results, paused Scan entrypoints and future local recognition                                                                                                                                                                                                                                                         |

Proposal: [managed authentication evaluation](./auth-provider-evaluation.md) compares future
provider options. Local authentication remains the implemented method.
