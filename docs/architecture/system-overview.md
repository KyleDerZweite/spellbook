# System Overview

- Status: Canonical
- Last Reviewed: 2026-04-11
- Source of Truth: code
- Update Triggers: service boundary changes, topology changes, auth boundary changes, data flow changes
- Related Docs: [Architecture Docs](./README.md), [Frontend](./frontend.md), [SpacetimeDB](./spacetimedb.md), [Worker](./worker.md), [Auth](./auth.md), [Mobile And Scan](./mobile-and-scan.md), [Deployment](../operations/deployment.md)

Spellbook currently consists of five primary functional parts:

- SvelteKit frontend
- Zitadel authentication
- SpacetimeDB for user-scoped real-time data
- MeiliSearch for MTG catalog search
- Python worker for MTG catalog ingestion

The mobile and scan foundation adds these supporting parts:

- MinIO-compatible object storage
- a scan-worker service
- a vector index service

## Current High-Level Flow

```text
Browser
  -> Frontend (SvelteKit)
  -> Zitadel for login
  -> Frontend session cookie
  -> SpacetimeDB with ID token
  -> MeiliSearch with search-only key

Android app
  -> Frontend mobile API with bearer token
  -> SpacetimeDB through the frontend server
  -> MeiliSearch through the frontend server
  -> MinIO for retained scan objects through the frontend server
  -> scan-worker for scan processing

Scryfall
  -> Worker
  -> MeiliSearch
```

## Current Responsibilities

- frontend: routes, auth session handling, search UI, inventory UI, decks UI
- frontend mobile API: bearer-token validation, MTG mobile endpoints, scan upload orchestration
- SpacetimeDB: user profile, inventories, inventory cards, decks, deck cards
- worker: catalog download, transform, indexing, sync markers
- scan-worker: scan-processing boundary for normalization, OCR, embeddings, and candidate ranking
- MeiliSearch: MTG card catalog search and printing lookup
- Zitadel: OIDC identity provider
- MinIO: object storage for retained scan artifacts
