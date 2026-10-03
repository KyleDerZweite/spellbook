# Architecture

- Status: Canonical
- Last Reviewed: 2026-10-03
- Source of Truth: code
- Update Triggers: schema changes, repository changes, auth flow changes, worker flow changes, service boundary changes
- Related Docs: [System Overview](./system-overview.md), [Frontend](./frontend.md), [Postgres](./postgres.md), [Worker](./worker.md), [Catalog](./catalog.md), [Auth](./auth.md), [Mobile And Scan](./mobile-and-scan.md), [Backend language](./backend-language.md), [Docs Index](../README.md)

Architecture documents describe implemented boundaries. Use the product specification for requirements and proposals.

| Owner                                     | Subject                                                          |
| ----------------------------------------- | ---------------------------------------------------------------- |
| [System overview](./system-overview.md)   | Runtime topology and data ownership                              |
| [Frontend](./frontend.md)                 | Server rendering, repositories, and runtime compatibility        |
| [Postgres](./postgres.md)                 | Persisted state, ownership, and mutation replay                  |
| [Catalog](./catalog.md)                   | Catalog storage, publication, and search                         |
| [Worker](./worker.md)                     | Catalog ingestion and synchronization                            |
| [Authentication](./auth.md)               | Local credentials, sessions, and origin protection               |
| [Mobile and scan](./mobile-and-scan.md)   | Shared API validation, uploads, and external recognition results |
| [Backend language](./backend-language.md) | Go, Python, and hosted-performance assessment                    |
