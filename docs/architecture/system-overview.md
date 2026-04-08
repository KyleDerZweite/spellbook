# System Overview

- Status: Canonical
- Last Reviewed: 2026-04-08
- Source of Truth: code
- Update Triggers: service boundary changes, topology changes, auth boundary changes, data flow changes
- Related Docs: [Architecture Docs](./README.md), [Frontend](./frontend.md), [SpacetimeDB](./spacetimedb.md), [Worker](./worker.md), [Auth](./auth.md), [Deployment](../operations/deployment.md)

Spellbook currently consists of five primary functional parts:

- SvelteKit frontend
- Zitadel authentication
- SpacetimeDB for user-scoped real-time data
- MeiliSearch for MTG catalog search
- Python worker for MTG catalog ingestion

## Current High-Level Flow

```text
Browser
  -> Frontend (SvelteKit)
  -> Zitadel for login
  -> Frontend session cookie
  -> SpacetimeDB with ID token
  -> MeiliSearch with search-only key

Scryfall
  -> Worker
  -> MeiliSearch
```

## Current Responsibilities

- frontend: routes, auth session handling, search UI, inventory UI, decks UI
- SpacetimeDB: user profile, inventories, inventory cards, decks, deck cards
- worker: catalog download, transform, indexing, sync markers
- MeiliSearch: MTG card catalog search and printing lookup
- Zitadel: OIDC identity provider
