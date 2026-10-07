# Architecture

- Status: Canonical
- Last Reviewed: 2026-10-07
- Source of Truth: code and explicitly marked accepted design
- Update Triggers: schema changes, repository changes, auth flow changes, worker flow changes, service boundaries and reviewed module contracts
- Related Docs: [System Overview](./system-overview.md), [Frontend](./frontend.md), [Postgres](./postgres.md), [Worker](./worker.md), [Catalog](./catalog.md), [Auth](./auth.md), [Mobile And Scan](./mobile-and-scan.md), [Docs Index](../README.md), [Application contract](./application-contract.md), [Value and costs](./value-and-costs.md), [Category rules](./category-rules.md)

Architecture documents distinguish implemented boundaries from explicitly marked accepted designs and proposals. Use the product specification for requirements and current workflow scope.

| Owner                                             | Subject                                                                                                                                                                                                                    |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Application contract](./application-contract.md) | Workspace/Catalog/Auth/Profile/Dashboard, Inventory/Groups reads and mutations, Deck application/shared UI, Scan upload/read/result/review, SavedState/Profile sync, Scryfall references and starter entry categories implemented; later contracts planned |
| [Value and costs](./value-and-costs.md)           | Scryfall reference publication/reads implemented; portion, allocation, capture and restatement design planned                                                                                                              |
| [Category rules](./category-rules.md)             | Oracle Tags and starter entry decisions implemented; account rules, Review/Reset, whole-deck categories and local combos planned                                                                                           |
| [System overview](./system-overview.md)           | Runtime topology and data ownership                                                                                                                                                                                        |
| [Frontend](./frontend.md)                         | Server rendering, shared Deck presentation/native forms, and runtime compatibility                                                                                                                                         |
| [Postgres](./postgres.md)                         | Persisted state, ownership, and mutation replay                                                                                                                                                                            |
| [Catalog](./catalog.md)                           | Catalog/price storage, publication, and search                                                                                                                                                                             |
| [Worker](./worker.md)                             | Catalog/price ingestion and synchronization                                                                                                                                                                                |
| [Authentication](./auth.md)                       | Local credentials, sessions, and origin protection                                                                                                                                                                         |
| [Mobile and scan](./mobile-and-scan.md)           | API validation, uploads, recognition results, and proposed recognition                                                                                                                                                     |

[Managed authentication evaluation](./auth-provider-evaluation.md) compares future provider options; local authentication remains implemented.
