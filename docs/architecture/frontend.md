# Frontend

- Status: Canonical
- Last Reviewed: 2026-04-17
- Source of Truth: code
- Update Triggers: route changes, auth guard changes, search flow changes, inventory/deck UI changes
- Related Docs: [System Overview](./system-overview.md), [Auth](./auth.md), [Routing and Games](../product/routing-and-games.md), [MeiliSearch Search API](../integrations/meilisearch/search-api.md), [Mobile And Scan](./mobile-and-scan.md)

The frontend is a SvelteKit application with SSR enabled on the server and route-level product surfaces for MTG.

The same application is the mobile surface when installed as a PWA (see `frontend/static/manifest.webmanifest`) and also hosts the optional `/api/mobile/v1/...` bearer-token API for non-browser clients.

## Current Implemented Product Routes

- `/`
- `/mtg/`
- `/mtg/search`
- `/mtg/inventory`
- `/mtg/decks`

Transitional aliases still exist at `/search` and `/collections*`.

## Current Responsibilities

- enforce auth for protected routes
- fetch and pass the MeiliSearch search key to authenticated sessions
- establish the SpacetimeDB connection in the browser
- provide MTG search, inventory, and deck experiences
- serve the installable PWA surface via the web app manifest
- validate optional mobile bearer tokens against Zitadel
- expose MTG mobile endpoints for search, inventory, decks, and scan orchestration

## Search Responsibilities

- browse mode for short queries
- distinct search for MTG cards
- printing selection
- facet loading
- set progress lookups through MeiliSearch

## Inventory and Deck Responsibilities

- inventory is the owned ledger surface
- spellbook mode is an inventory presentation mode
- decks compare required cards against owned counts

## Mobile API Responsibilities

The `/api/mobile/v1/...` surface is optional and exists for non-browser clients. The PWA itself does not use it.

- accept bearer-token authenticated requests
- proxy catalog search and printing lookups server-side
- connect to SpacetimeDB on behalf of bearer-token clients
- upload retained scan artifacts to object storage
- forward scan jobs to `scan-worker`
