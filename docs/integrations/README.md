# Integrations

- Status: Canonical
- Last Reviewed: 2026-11-18
- Source of Truth: mixed
- Update Triggers:
  - managed Category removal
  - executed lexical/BM25/vector search comparison
  - PostgreSQL and semantic search evaluation
  - functional Python acceptance and current migration status
  - Python API/worker language selection and migration planning
  - external system contracts and Cardstation filter/physical Box QR interface
  - integration scope
  - provider evaluations and scanner-platform research
- Related Docs:
  - [Market price research](./market-prices.md)
  - [Realtime backend evaluation](./realtime-backends.md)
  - [Cardstation modes and sorter integration](./card-robot.md)
  - [Filter and physical Box label interface](./cardstation-filter-box-interface.md)
  - [Shared Cardstation sort DSL v1](./cardstation-sort-rule-v1.md)
  - [Scanner platform evaluation](./scanner-platform-evaluation.md)
  - [Worker](../architecture/worker.md)
  - [Catalog](../architecture/catalog.md)
  - [Docs index](../README.md)
  - [Application contract](../architecture/application-contract.md)
  - [Backend language evaluation](./backend-language-evaluation.md)
  - [Python direction](../decisions/0025-python-api-and-workers.md)
  - [Functional Python acceptance](../decisions/0027-python-functional-migration-acceptance.md)

> **TL;DR**
>
> - Research and contracts for systems outside the core app: card sorter, scanners, prices, search
>   and backends.
> - Most documents here are **proposals or research**, not shipped features.
> - Implemented today: Scryfall catalog and EUR references, optional Cardmarket and MTGJSON
>   adapters, PostgreSQL LISTEN/NOTIFY with SSE.

## Documents

| Document                                                                         | Kind                         | Summary                                                                 |
| -------------------------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------- |
| [Cardstation modes and sorter integration](./card-robot.md)                      | Accepted boundaries          | Cardstation modes and Box boundaries, plus historical hardware concepts |
| [Filter and physical Box label interface](./cardstation-filter-box-interface.md) | Proposal                     | Local offline rule editor, later authenticated Box QR labels            |
| [Cardstation sort DSL v1](./cardstation-sort-rule-v1.md)                         | Proposal                     | Data-only filter exchange format and cross-language fixtures            |
| [Scanner platform evaluation](./scanner-platform-evaluation.md)                  | Research                     | Website/phone options, recognition hosts, self-hosting, hardware        |
| [Global search evaluation](./search-evaluation.md)                               | Research                     | Eight-variant comparison of lexical, BM25 and vector search             |
| [Market price research](./market-prices.md)                                      | Research, partly implemented | Scryfall references and provider evaluation                             |
| [Realtime backend evaluation](./realtime-backends.md)                            | Research, decided            | Convex compared, PostgreSQL kept                                        |
| [Backend language evaluation](./backend-language-evaluation.md)                  | Research, decided            | Go, Python, Rust and TypeScript compared                                |

## Status by topic

### Card sorter (Cardstation)

- [ADR-0030](../decisions/0030-cardstation-physical-storage.md) owns the accepted product and
  physical-quantity decision.
- The [filter and Box label interface](./cardstation-filter-box-interface.md) does not claim an
  implementation.
- The [sort DSL v1](./cardstation-sort-rule-v1.md) does not activate online sorting.
- [ADR-0023](../decisions/0023-local-recognition-in-scanner-clients.md) selects local recognition,
  with public reference preparation proposed centrally.
- None of these decisions are implemented hardware or phone-client support.

### Scanners

[Scanner platform evaluation](./scanner-platform-evaluation.md) covers website and phone options,
local recognition hosts, controller separation, OSS operation, self-hosting and hardware
reproduction. Its recommendations and proposed experiments support decisions. They are not accepted
implementation contracts.

### Search

[Global search evaluation](./search-evaluation.md) records the executed comparison of Autocomplete,
lexical/BM25/vector retrieval, static navigation, Deck scope and keyboard usability. These remain
proposals. [UI direction](../product/ui-design-direction.md#proposed-global-command-menu) owns the
shortcut-only entry requirement.

### Prices and value

- [Market price research](./market-prices.md) records the implemented Scryfall baseline and the
  provider evaluation.
- [Value tracking](../product/value-tracking.md) owns current reference presentation and the
  implemented value-only personal Inventory history.
- Implemented: Scryfall EUR references, supplied product links, optional Cardmarket and MTGJSON
  adapters, and bounded public market history, all with explicit opt-ins.
- Removed from scope: acquisition-cost tracking.
- Not implemented: marketplace account connections and a sales or trading ledger.

### Realtime

[Realtime backend evaluation](./realtime-backends.md) records dated Convex pricing, client and auth
coupling, and the choice to keep PostgreSQL. Q56 accepted PostgreSQL LISTEN/NOTIFY with
account-scoped SSE. The
[application contract](../architecture/application-contract.md#saved-state-synchronization) owns the
mechanisms.

- Implemented and verified: SavedState transport and Profile synchronization.
- Implemented: mounted Profile, Dashboard, Inventory, Deck and Scan consumers.
- Separate: rendered workspace acceptance.

### Backend language

[Backend language evaluation](./backend-language-evaluation.md) compares Go, Python, Rust and the
TypeScript API, with worker grouping and migration gates.
[ADR-0025](../decisions/0025-python-api-and-workers.md) selects Python for the API and workers.
[ADR-0027](../decisions/0027-python-functional-migration-acceptance.md) removes strict performance
and resource blockers. The [current contract](../architecture/python-backend-migration.md) owns
delivery and acceptance.

### Catalog ingestion

Scryfall ingestion belongs to the [worker architecture](../architecture/worker.md). PostgreSQL
Catalog contracts belong to [catalog architecture](../architecture/catalog.md).
