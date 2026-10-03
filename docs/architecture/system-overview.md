# System overview

- Status: Canonical
- Last Reviewed: 2026-10-03
- Source of Truth: code
- Update Triggers: service boundaries, topology, authentication, data ownership
- Related Docs: [Architecture](./README.md), [Frontend](./frontend.md), [Postgres](./postgres.md), [Worker](./worker.md), [Auth](./auth.md), [Mobile and scan](./mobile-and-scan.md), [Deployment](../operations/deployment.md)

Spellbook uses SvelteKit for the web interface and application API, PostgreSQL for account-owned state and the MTG catalog, and a Python worker for Scryfall ingestion. Local authentication runs inside SvelteKit.

```text
Browser -> SvelteKit -> Postgres
API client -> SvelteKit using a local session bearer token
Scryfall -> Python worker -> Postgres catalog generation -> atomic publication
Scan upload -> SvelteKit -> local or S3 artifact storage
                        -> Python scan-worker scaffold
```

The browser and installed web app share one frontend and session cookie. Server repositories enforce ownership using the internal account ID. The [catalog](./catalog.md) uses separate PostgreSQL tables for public printing metadata. Account-owned data remains scoped by the authenticated account.

[Scan review](./mobile-and-scan.md) accepts uploaded images and external candidates. The bundled recognizer remains a scaffold; no vector database is required.

Use the [product specification](../product/specification.md) for implemented workflows and limits, and the [backend language assessment](./backend-language.md) for the Go and Python tradeoff.
