# Frontend

- Status: Canonical
- Last Reviewed: 2026-05-21
- Source of Truth: code
- Update Triggers: route changes, auth guard changes, search flow changes, inventory/deck UI changes
- Related Docs: [System Overview](./system-overview.md), [Auth](./auth.md), [Routing and Games](../product/routing-and-games.md), [MeiliSearch Search API](../integrations/meilisearch/search-api.md), [Mobile And Scan](./mobile-and-scan.md), [ADR-0008](../decisions/0008-mtg-only-self-hosted-inventory-and-deck-availability.md)

The frontend is a SvelteKit application with SSR enabled on the server. User-facing routes are flat and the current product scope is MTG only.

The same application is the mobile surface when installed as a PWA (see `frontend/static/manifest.webmanifest`) and also hosts the optional `/api/mobile/v1/:game/...` bearer-token API for non-browser clients.

## Current Implemented Product Routes

- `/`
- `/search`
- `/inventory`
- `/decks`

Legacy `/mtg/*` and `/collections*` URLs return a 308 redirect to the matching flat route so older bookmarks and external links keep working.

## Current Responsibilities

- enforce auth for protected routes
- fetch and pass the MeiliSearch search key to authenticated sessions
- load and mutate user-owned data through SvelteKit server code backed by Postgres
- provide MTG search, inventory, and deck experiences
- serve the installable PWA surface via the web app manifest
- validate optional mobile bearer tokens against the configured OIDC provider
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

The `/api/mobile/v1/mtg/...` surface is optional and exists for non-browser clients. The PWA itself does not use it. The route keeps the existing `mtg` segment for compatibility, not as a near-term multi-game commitment.

- accept bearer-token authenticated requests
- proxy catalog search and printing lookups server-side
- read and mutate user-owned data through the Postgres repository layer
- upload retained scan artifacts to object storage
- forward scan jobs to `scan-worker`
