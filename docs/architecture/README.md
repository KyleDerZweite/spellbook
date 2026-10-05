# Architecture

- Status: Canonical
- Last Reviewed: 2026-10-05
- Source of Truth: code
- Update Triggers: schema changes, repository changes, auth flow changes, worker flow changes, service boundary changes
- Related Docs: [System Overview](./system-overview.md), [Frontend](./frontend.md), [Postgres](./postgres.md), [Worker](./worker.md), [Catalog](./catalog.md), [Auth](./auth.md), [Mobile And Scan](./mobile-and-scan.md), [Docs Index](../README.md)

Architecture documents distinguish implemented boundaries from explicitly marked proposals. Use the product specification for requirements and current workflow scope.

| Owner                                   | Subject                                                                |
| --------------------------------------- | ---------------------------------------------------------------------- |
| [System overview](./system-overview.md) | Runtime topology and data ownership                                    |
| [Frontend](./frontend.md)               | Server rendering, repositories, and runtime compatibility              |
| [Postgres](./postgres.md)               | Persisted state, ownership, and mutation replay                        |
| [Catalog](./catalog.md)                 | Catalog storage, publication, and search                               |
| [Worker](./worker.md)                   | Catalog ingestion and synchronization                                  |
| [Authentication](./auth.md)             | Local credentials, sessions, and origin protection                     |
| [Mobile and scan](./mobile-and-scan.md) | API validation, uploads, recognition results, and proposed recognition |

[Managed authentication evaluation](./auth-provider-evaluation.md) compares future provider options; local authentication remains implemented.
