# System overview

- Status: Canonical
- Last Reviewed: 2026-10-07
- Source of Truth: code and explicitly marked design requirements
- Update Triggers: service boundaries, topology, authentication, data ownership, runtime allocation, hosted capacity requirements, frontend/backend separation, cross-client synchronization and public reference publication
- Related Docs: [Architecture](./README.md), [Frontend](./frontend.md), [Postgres](./postgres.md), [Worker](./worker.md), [Auth](./auth.md), [Mobile and scan](./mobile-and-scan.md), [Deployment](../operations/deployment.md), [Realtime backend evaluation](../integrations/realtime-backends.md), [ADR-0015](../decisions/0015-shared-backend-use-cases-and-client-contracts.md), [Accepted application contract](./application-contract.md), [Value and costs](./value-and-costs.md), [Category rules](./category-rules.md)

Spellbook uses TypeScript and SvelteKit for the web interface and application API, PostgreSQL for account-owned state and the MTG catalog, and a Python worker for Scryfall ingestion. Backend Auth, Profile, Dashboard, Catalog, Inventory/Groups, Deck, Valuation, Scan and SavedState use cases run within the SvelteKit deployment.

```text
Browser -> SvelteKit -> Postgres
API client -> SvelteKit using a local session bearer token
Scryfall -> Python worker -> Postgres catalog generation -> atomic publication
Scan upload -> SvelteKit transport -> Backend Scan -> local or S3 artifact storage
                        -> Python scan-worker scaffold
```

The browser and installed web app share one frontend and session cookie. Root pnpm workspace packages separate `frontend/`, `backend/` and `contracts/`. The frontend server composition constructs backend Catalog, Auth, Profile, Dashboard, Inventory/Groups, Deck, Valuation, SavedState and Scan. Scan upload/storage/read/review workflows no longer use frontend persistence compatibility edges. The four Settings sections retain enumerated compatibility adapters. Backend applications enforce ownership using session-produced trusted actors. The [catalog](./catalog.md) uses separate PostgreSQL tables for public printing metadata. Account-owned data remains scoped by the authenticated account.

[Scan review](./mobile-and-scan.md) accepts uploaded images and external candidates. The bundled recognizer remains a scaffold; no vector database is required.

The selected runtime boundary keeps application requests in TypeScript and catalog ingestion and proposed recognition in Python workers. Recognition runs outside inventory and deck transactions so it can receive separate resource limits. The [scan architecture](./mobile-and-scan.md) distinguishes the implemented scaffold from the proposed pipeline.

Before setting hosted capacity targets, measure request latency, database query and connection waits, memory, and account-transaction latency during catalog refreshes. Budget PostgreSQL connections across application replicas and workers. Use the [product specification](../product/specification.md) for implemented workflows and verification requirements.

## Accepted boundary redesign

On 2026-10-06, the maintainer selected root `frontend/`, `backend/` and `contracts/` ownership with enforced import rules, initially in one SvelteKit deployment. [ADR-0015](../decisions/0015-shared-backend-use-cases-and-client-contracts.md) records that accepted direction. SvelteKit retains rendering, native form actions and HTTP routes. Backend modules own persistence, account authorization and use cases. The web routes and external API must use those same use cases. Shared contracts must describe serialized data independently of database row types and backend implementation imports.

The later app will configure its API address for local operation or a deployment behind a load balancer. Web server routes may initially call the backend interface within the same process. Relocating every web operation to an external backend URL requires a complete, tested HTTP adapter and remains a later pass. Frontend feature components must depend on contracts and the application interface rather than persistence. Another backend implementation must satisfy the same request, response, error, authentication and mutation semantics; a configurable URL alone does not provide that compatibility.

The review must cover every current web workflow, including capabilities that the versioned external API does not yet expose. Current external API coverage does not yet establish parity with web workflows.

The app will be a separate later delivery; this pass prepares its backend contracts. MTG remains the only functional game scope. The selected synchronization scope is online-first visibility of saved account changes across connected clients within approximately two seconds under normal conditions. Clients reload current data after reconnect or app resume and preserve unsaved input. Offline writes and push notifications to closed apps are outside this pass. The accepted [application contract](./application-contract.md#saved-state-synchronization) specifies account-scoped SSE invalidation through PostgreSQL LISTEN/NOTIFY, session revalidation and bounded refetches.

The selected concurrent-edit rules depend on the data. Avatar and individual selection fields use the last value successfully saved by the backend. Updates to different fields must preserve both changes. Quantity adjustments must be atomic and retries must not apply an operation twice. A stale save of the same Notes or Description text returns a conflict while preserving the client's draft for resolution. This is saved-state synchronization, not collaborative live text editing.

Self hosting remains the preferred operating mode. The maintainer selected PostgreSQL as the source of truth for account state and the MTG catalog, with SavedState transport and mounted Profile/Dashboard/Inventory/Deck/Scan consumers implemented without Convex. Rendered workspace acceptance and deployed proxy verification remain separate. The [realtime backend evaluation](../integrations/realtime-backends.md) owns the dated provider research and managed-service cost ceiling for any later reconsideration. The accepted transport uses the existing PostgreSQL, pg and Node capabilities. No database replacement is selected.

Kyle accepted the concrete nineteen-slice design and blocking dependencies in Q56 on 2026-10-06. The [application contract](./application-contract.md), [value/cost persistence](./value-and-costs.md) and [category rules](./category-rules.md) own the reviewed mechanisms. The workspace, Catalog/Auth, Account/Profile/Dashboard, bounded Inventory reads and retry-safe Inventory/Groups mutations, Deck and Scan application boundaries, SavedState transport, the Profile consumer and Scryfall reference reads/product links are implemented within the same SvelteKit runtime. The remaining mechanisms stay planned, as listed in the application contract. Design acceptance does not establish implementation, scalability, synchronization evidence or deployment. The single-client choice in [ADR-0003](../decisions/0003-pwa-first-mobile-and-server-side-scan.md) must be reconsidered explicitly if a separate app client is selected.
