# ADR-0015: Shared backend use cases and client contracts

- Status: Accepted
- Date: 2026-10-06
- Last Reviewed: 2026-10-06
- Owners: Kyle
- Source of Truth: accepted maintainer boundary and app-delivery decisions
- Update Triggers: module ownership, import enforcement, client/API parity, independent backend deployment and app delivery
- Related Docs: [System overview](../architecture/system-overview.md), [Frontend](../architecture/frontend.md), [Product specification](../product/specification.md), [Deployment](../operations/deployment.md), [ADR-0003](./0003-pwa-first-mobile-and-server-side-scan.md), [ADR-0007](./0007-backend-first-mtg-bulk-import-api.md), [Decisions](./README.md)

## Context

This is the accepted direction for the next pass. The module split and API parity are not implemented yet.

Current SvelteKit routes combine rendering, HTTP handling and direct repository calls. The external API does not expose every web workflow. A later separate app needs the same account rules and mutation behavior without duplicating domain logic. Self hosting and the current SvelteKit web experience remain priorities.

Separating deployments immediately would also require complete web HTTP adapters, authentication forwarding and additional operator work. Module ownership can establish the needed seam first.

## Decision

Organize application ownership under root `frontend/`, `backend/` and `contracts/`, with checked import boundaries. Keep one SvelteKit deployment initially. Frontend owns rendering and client interaction. Backend owns account authorization, persistence and use cases. Contracts own serialized request, response and error shapes independently of database rows, Node APIs and framework types.

Web server adapters and the public app API call the same backend use cases. SvelteKit keeps native form actions and HTTP routes. Frontend components consume the application interface and safe contracts; backend implementation imports are confined to server composition/adapters. Backend modules must not depend on SvelteKit request or response helpers.

Prepare API coverage for existing workflows in this pass. Deliver the separate app later with a configurable API address. A fully external backend for all web calls and independently deployed services remain a later pass requiring a complete HTTP adapter. Matching authentication and mutation semantics is part of compatibility, beyond matching URLs and DTOs.

## Consequences

Clients can share behavior while SvelteKit retains its rendering and forms. Import checks make accidental database access from presentation code detectable. A single deployment limits the initial operational change.

This pass does not prove the web client can already switch to an arbitrary external backend. API parity, serialization, authorization and retry behavior require acceptance evidence during implementation. Moving files alone does not establish those boundaries.

## Follow-up

[System overview](../architecture/system-overview.md#boundary-redesign-under-review) owns the current boundary design and remaining synchronization contract. Reconcile concrete component responsibilities, API coverage and verification before marking implementation slices Ready. Preserve existing workflows throughout migration.

[ADR-0003](./0003-pwa-first-mobile-and-server-side-scan.md) continues to describe the delivered web client; app technology and the replacement of its single-client direction need a separate decision. This ADR selects the module and contract seam, not that later client implementation.
