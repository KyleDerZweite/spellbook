# System overview

- Status: Canonical
- Last Reviewed: 2026-10-03
- Source of Truth: code
- Update Triggers: service boundaries, topology, authentication, data ownership, runtime allocation and hosted capacity requirements
- Related Docs: [Architecture](./README.md), [Frontend](./frontend.md), [Postgres](./postgres.md), [Worker](./worker.md), [Auth](./auth.md), [Mobile and scan](./mobile-and-scan.md), [Deployment](../operations/deployment.md)

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
