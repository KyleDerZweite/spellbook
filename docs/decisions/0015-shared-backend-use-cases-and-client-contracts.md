# ADR-0015: Shared backend use cases and client contracts

- Status: Accepted
- Date: 2026-10-06
- Last Reviewed: 2026-10-08
- Owners: Kyle
- Source of Truth: accepted maintainer boundary and app-delivery decisions
- Update Triggers: module ownership, application lifecycle and native operator ownership, import enforcement, client/API parity, independent backend deployment and app delivery, accepted design contracts and implementation evidence, local recognition and client responsibilities, client feature parity, browser scanning and phone computation-host evaluation
- Related Docs: [System overview](../architecture/system-overview.md), [Frontend](../architecture/frontend.md), [Product specification](../product/specification.md), [Deployment](../operations/deployment.md), [ADR-0003](./0003-pwa-first-mobile-and-server-side-scan.md), [ADR-0007](./0007-backend-first-mtg-bulk-import-api.md), [Decisions](./README.md), [Application contract](../architecture/application-contract.md), [ADR-0023](./0023-local-recognition-in-scanner-clients.md)

## Context

The workspace, Catalog/Auth, Account/Profile/Dashboard, Inventory/Groups reads and mutations, Deck and complete Scan application contracts and SavedState/Profile boundaries are implemented. Complete feature/API parity remains planned.

SvelteKit routes retain rendering and HTTP handling while calling shared backend use cases. The backend application constructor owns database resources and lifecycle, and backend operator modules own native persistence. Frontend runtime database/schema compatibility modules and legacy persistence exceptions are removed. The external API does not expose every web workflow. A later separate app needs the same account rules and mutation behavior without duplicating domain logic. Self hosting and the current SvelteKit web experience remain priorities.

Separating deployments immediately would also require complete web HTTP adapters, authentication forwarding and additional operator work. Module ownership can establish the needed seam first.

## Decision

Organize application ownership under root `frontend/`, `backend/` and `contracts/`, with checked import boundaries. Keep one SvelteKit deployment initially. Frontend owns rendering and client interaction. Backend owns account authorization, persistence and use cases. Contracts own serialized request, response and error shapes independently of database rows, Node APIs and framework types.

Web server adapters and the public app API call the same backend use cases. SvelteKit keeps native form actions and HTTP routes. Frontend components consume the application interface and safe contracts; backend implementation imports are confined to server composition/adapters. Backend modules must not depend on SvelteKit request or response helpers.

Prepare API coverage for existing workflows in this pass. Deliver the separate app later with a configurable API address. A fully external backend for all web calls and independently deployed services remain a later pass requiring a complete HTTP adapter. Matching authentication and mutation semantics is part of compatibility, beyond matching URLs and DTOs.

## Consequences

Clients can share behavior while SvelteKit retains its rendering and forms. Import checks make accidental database access from presentation code detectable. A single deployment limits the initial operational change.

This pass does not prove the web client can already switch to an arbitrary external backend. API parity, serialization, authorization and retry behavior require acceptance evidence during implementation. Moving files alone does not establish those boundaries.

## Follow-up

Q56 accepted the concrete module, transport, query and mutation mechanisms on 2026-10-06. The [application contract](../architecture/application-contract.md) owns those interfaces and their acceptance evidence. Preserve existing workflows throughout expand and contract. [ADR-0016](./0016-postgres-saved-state-invalidation.md) records synchronization; [ADR-0017](./0017-revisioned-inventory-windows-and-mutation-receipts.md) records bounded reads and original mutation acknowledgements. SavedState transport/Profile, bounded Inventory and Inventory/Deck original receipts are implemented. Mounted Inventory/Deck/Scan workspace consumers are implemented; complete API parity remains later work. Backend Scan upload/read/result/review contracts are implemented; automatic recognition remains outside this pass.

[ADR-0003](./0003-pwa-first-mobile-and-server-side-scan.md) continues to describe the delivered web client. [ADR-0023](./0023-local-recognition-in-scanner-clients.md) records local recognition while leaving allocation across phone, sorter and potentially browser open. The phone app should offer website functionality; app technology and complete parity evidence remain unselected. This ADR still owns the backend module and contract seam, not that later client implementation.
