# System Overview

- Status: Canonical
- Last Reviewed: 2026-05-18
- Source of Truth: code
- Update Triggers: service boundary changes, topology changes, auth boundary changes, data flow changes
- Related Docs: [Architecture Docs](./README.md), [Frontend](./frontend.md), [Postgres](./postgres.md), [Worker](./worker.md), [Auth](./auth.md), [Mobile And Scan](./mobile-and-scan.md), [Deployment](../operations/deployment.md)

Spellbook currently consists of five primary functional parts:

- SvelteKit frontend
- OIDC authentication
- Postgres for user-scoped application data
- MeiliSearch for MTG catalog search
- Python worker for MTG catalog ingestion

The mobile and scan foundation adds these supporting parts:

- scan artifact storage, local filesystem in development or S3-compatible object storage in production
- a scan-worker service
- a vector index service

## Current High-Level Flow

```text
Browser or installed PWA
  -> Frontend (SvelteKit)
  -> OIDC provider for login
  -> Frontend session cookie
  -> Postgres through SvelteKit server loads, actions, and APIs
  -> MeiliSearch with search-only key
  -> scan artifact storage through the frontend server
  -> scan-worker for scan processing

Optional non-browser client (future)
  -> Frontend mobile API with bearer token at /api/mobile/v1/...

Scryfall
  -> Worker
  -> MeiliSearch
```

## Current Responsibilities

- frontend: routes, auth session handling, search UI, inventory UI, decks UI, PWA install surface for mobile
- frontend mobile API: optional bearer-token validation, MTG mobile endpoints, scan upload orchestration
- Postgres: user profile, inventories, inventory cards, decks, deck cards, scan state, and inventory/deck idempotency records
- worker: catalog download, transform, zero-downtime MeiliSearch indexing, sync status
- scan-worker: scan-processing boundary for normalization, OCR, embeddings, and candidate ranking
- MeiliSearch: MTG card catalog search and printing lookup
- OIDC provider: hosted identity and login
- scan artifact storage: retained scan artifacts outside Postgres
