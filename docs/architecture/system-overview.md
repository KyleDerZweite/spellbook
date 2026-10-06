# System overview

- Status: Canonical
- Last Reviewed: 2026-10-06
- Source of Truth: code and explicitly marked design requirements
- Update Triggers: service boundaries, topology, authentication, data ownership, runtime allocation, hosted capacity requirements, frontend/backend separation and cross-client synchronization
- Related Docs: [Architecture](./README.md), [Frontend](./frontend.md), [Postgres](./postgres.md), [Worker](./worker.md), [Auth](./auth.md), [Mobile and scan](./mobile-and-scan.md), [Deployment](../operations/deployment.md), [Realtime backend evaluation](../integrations/realtime-backends.md)

Spellbook uses TypeScript and SvelteKit for the web interface and application API, PostgreSQL for account-owned state and the MTG catalog, and a Python worker for Scryfall ingestion. Local authentication runs inside SvelteKit.

```text
Browser -> SvelteKit -> Postgres
API client -> SvelteKit using a local session bearer token
Scryfall -> Python worker -> Postgres catalog generation -> atomic publication
Scan upload -> SvelteKit -> local or S3 artifact storage
                        -> Python scan-worker scaffold
```

The browser and installed web app share one frontend and session cookie. Server repositories enforce ownership using the internal account ID. The [catalog](./catalog.md) uses separate PostgreSQL tables for public printing metadata. Account-owned data remains scoped by the authenticated account.

[Scan review](./mobile-and-scan.md) accepts uploaded images and external candidates. The bundled recognizer remains a scaffold; no vector database is required.

The selected runtime boundary keeps application requests in TypeScript and catalog ingestion and proposed recognition in Python workers. Recognition runs outside inventory and deck transactions so it can receive separate resource limits. The [scan architecture](./mobile-and-scan.md) distinguishes the implemented scaffold from the proposed pipeline.

Before setting hosted capacity targets, measure request latency, database query and connection waits, memory, and account-transaction latency during catalog refreshes. Budget PostgreSQL connections across application replicas and workers. Use the [product specification](../product/specification.md) for implemented workflows and verification requirements.

## Boundary redesign under review

On 2026-10-06, the maintainer selected separate root `frontend/` and `backend/` code ownership as the next architecture direction. The web client and a future app must use the same explicit network contracts. Configuring the API address must allow local operation or a deployment behind a load balancer without changing feature components. Another backend implementation must satisfy the same request, response, error, authentication and mutation semantics; a configurable URL alone does not provide that compatibility.

The target keeps persistence, account authorization and application mutations behind the backend interface. Shared client-safe contracts must describe serialized data independently of database row types and backend implementation imports. The review must cover every current web workflow, including capabilities that the versioned external API does not yet expose.

The app will be a separate later delivery; this pass prepares its backend contracts. The selected synchronization scope is online-first visibility of saved account changes across connected clients, with current data reloaded after reconnect or app resume. Offline writes are outside this pass. The delivery mechanism, timing target and concurrent-edit rules still need a reviewed contract.

Self hosting remains the preferred operating mode. A managed backend may be considered if its measured benefits and recurring cost justify the dependency. The [realtime backend evaluation](../integrations/realtime-backends.md) records dated provider research. The frontend rendering boundary, backend framework and provider choice remain under review. No Convex adoption or database replacement is selected.

This section records the requested direction, not an implemented split or a completed design contract. The full-stack SvelteKit implementation above remains the running system. Reconcile affected decisions, product requirements, API contracts and operations before marking a migration slice ready. The single-client choice in [ADR-0003](../decisions/0003-pwa-first-mobile-and-server-side-scan.md) must be reconsidered explicitly if a separate app client is selected.
