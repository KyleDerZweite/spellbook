# Deployment Guide

## Architecture

Spellbook runs as 6 containers orchestrated via `podman-compose`. No ports are exposed to the host — all external access is routed through Pangolin via the Newt tunnel agent.

| Service | Image | Internal Port | Role |
|---------|-------|---------------|------|
| **spacetimedb** | clockworklabs/spacetime:v2.0.5 | 3000 | Real-time database (inventories, decks, user data) |
| **stdb-publish** | Built from `./spacetimedb/Dockerfile` | - | One-shot: publishes the SpacetimeDB module on startup |
| **meilisearch** | getmeili/meilisearch:v1.39.0 | 7700 | Full-text card search engine |
| **worker** | Built from `./worker` | - | Python data pipeline (Scryfall -> MeiliSearch) |
| **frontend** | Built from `./frontend/Dockerfile` | 3000 | SvelteKit app (Node.js, adapter-node) |
| **newt** | fosrl/newt:latest | - | Pangolin tunnel agent |

### How the frontend works

The frontend is a **Node.js server**, not nginx. SvelteKit compiles with `adapter-node` to a standalone app that runs via `node build` on port 3000. It:

- Serves the SvelteKit app (SSR + client hydration)
- Runs the direct Zitadel OIDC Authorization Code + PKCE flow
- The browser connects to MeiliSearch (read-only key) for card search
- The browser connects via WebSocket to SpacetimeDB using the Zitadel ID token

### Public Metadata Surface

The frontend origin also serves the crawler and metadata endpoints that describe the site:

- `robots.txt`
- `sitemap.xml`
- `/.well-known/security.txt`
- `/openapi.json`

These routes should stay on the same origin as the app so `APP_ORIGIN` remains the single source of truth for canonical URLs and crawler policy. The sitemap should stay small and explicit, and only list pages that are intentionally public.

### Network model

No host ports are exposed. All services communicate over the internal Docker network. External access is exclusively through Pangolin:

```
User -> Pangolin (your VPS) -> [tunnel] -> Newt -> frontend:3000
                                             |---> meilisearch:7700
                                             |---> spacetimedb:3000
```

The browser needs to reach three services, each on its own subdomain:

| Subdomain | Service | Auth |
|-----------|---------|------|
| `spellbook.yourdomain.com` | Frontend (SSR + static) | Spellbook app auth via Zitadel |
| `spellbook-search.yourdomain.com` | MeiliSearch API | None (read-only API key) |
| `spellbook-db.yourdomain.com` | SpacetimeDB WebSocket | None (OIDC JWT auth in SDK) |

### Module auto-publish

The `stdb-publish` container handles SpacetimeDB module publishing automatically:

1. Waits for SpacetimeDB to be healthy (via `spacetime server ping`)
2. Builds the TypeScript module and publishes it
3. On subsequent restarts, detects the module already exists and exits cleanly
4. The frontend `depends_on` stdb-publish, so it won't start until the module is ready

## Pangolin Setup

[Pangolin](https://github.com/fosrl/pangolin) is a self-hosted reverse proxy with identity-aware proxy (IAP) capabilities. For Spellbook, it sits in front of the stack as a tunnel-backed reverse proxy while Spellbook itself handles authentication through Zitadel.

### Prerequisites

- A running Pangolin instance on your server/VPS
- A wildcard DNS record for `*.yourdomain.com` pointed at Pangolin (or three individual A/CNAME records)

### Step 1: Create a Site in Pangolin

1. Log into the Pangolin admin dashboard
2. Create a new **Site** for Spellbook
3. Note the **Newt ID** and **Newt Secret** generated for the site

### Step 2: Create Resources (3 required)

Each resource gets its own subdomain. This avoids path-prefix routing and allows different auth settings per resource. Use the `spellbook-` prefix so resources are easy to identify when your Pangolin instance hosts many services.

**Resource 1: `spellbook-app` — Frontend**
- Target: `http://frontend:3000`
- Domain: `spellbook.yourdomain.com`
- **Disable IAP / authentication** — Spellbook handles login directly with Zitadel

**Resource 2: `spellbook-search` — MeiliSearch API**
- Target: `http://meilisearch:7700`
- Domain: `spellbook-search.yourdomain.com`
- **Disable IAP / authentication** — the browser JS client calls this directly with a read-only API key

**Resource 3: `spellbook-db` — SpacetimeDB**
- Target: `http://spacetimedb:3000`
- Domain: `spellbook-db.yourdomain.com`
- **Disable IAP / authentication** — SpacetimeDB validates Zitadel JWTs from the browser SDK

> **Why separate subdomains?** Pangolin resources are independent — you can't prioritize path prefixes across resources. Separate subdomains also eliminate the trailing-slash pitfall with JS URL resolution (`new URL(relative, base)` drops the last path segment without a trailing slash).

> **Why no Pangolin IAP?** The browser makes direct requests to the frontend, MeiliSearch, and SpacetimeDB. Spellbook now owns the login flow and uses Zitadel directly, so Pangolin should stay in pure reverse-proxy mode for all three resources.

### Step 3: Configure Environment

Copy `.env.example` to `.env` and fill in all values. The `PUBLIC_*` URLs must match the Pangolin resource subdomains, and the Zitadel redirect URI must include `https://spellbook.yourdomain.com/auth/callback`.

```env
PUBLIC_MEILISEARCH_URL=https://spellbook-search.yourdomain.com
PUBLIC_SPACETIMEDB_URL=wss://spellbook-db.yourdomain.com
```

### Step 4: How Newt Connects

Newt is a tunnel agent that runs inside the compose stack. It:

1. Connects **outbound** to your Pangolin server (no inbound ports needed on the host)
2. Registers as the tunnel endpoint for the configured site
3. Pangolin routes incoming requests through the tunnel to the appropriate container
4. Spellbook handles its own Zitadel login flow and session cookies

For the exact Zitadel application settings Spellbook expects, see [Zitadel setup](/home/kyle/CodingProjects/spellbook/docs/zitadel.md).

The host machine needs zero inbound ports open. Only Newt's outbound connection to Pangolin is required.

## Quick Start

```bash
# 1. Copy and fill in environment variables
cp .env.example .env
# Edit .env with your values

# 2. Start all services (module publishes automatically)
podman-compose up -d

# 3. Verify services are running
podman-compose ps

# Check that the module published successfully
podman-compose logs stdb-publish

# Check frontend is serving
podman-compose logs frontend --tail 10
```

## Local Development

For local development without Pangolin, you can temporarily expose ports by overriding with a compose file:

```yaml
# podman-compose.dev.yml
services:
  spacetimedb:
    ports:
      - "3000:3000"
  meilisearch:
    ports:
      - "7700:7700"
  frontend:
    ports:
      - "5173:3000"
```

```bash
podman-compose -f podman-compose.yml -f podman-compose.dev.yml up -d
```

Set local dev URLs in `.env`:
```env
PUBLIC_MEILISEARCH_URL=http://localhost:7700
PUBLIC_SPACETIMEDB_URL=ws://localhost:3000
```

## Environment Variables

| Variable | Where | Description |
|----------|-------|-------------|
| `MEILI_MASTER_KEY` | worker, meilisearch | MeiliSearch admin key |
| `ZITADEL_ISSUER` | frontend | Zitadel issuer URL |
| `ZITADEL_CLIENT_ID` | frontend | Spellbook OIDC client ID |
| `APP_ORIGIN` | frontend | Public frontend origin used for callback/logout URLs |
| `AUTH_SESSION_SECRET` | frontend | 32-byte base64url secret for encrypted auth cookies |
| `PUBLIC_MEILISEARCH_URL` | frontend | Browser-facing MeiliSearch URL (subdomain) |
| `PUBLIC_MEILISEARCH_SEARCH_KEY` | frontend | Read-only MeiliSearch key for browser search |
| `PUBLIC_SPACETIMEDB_URL` | frontend | Browser-facing SpacetimeDB URL (subdomain, `wss://`) |
| `PUBLIC_SPACETIMEDB_MODULE` | frontend | SpacetimeDB module name (default: `spellbook`) |
| `AGGRESSIVE_PRELOAD` | worker | `true` = all printings, `false` = default cards only |
| `SYNC_INTERVAL` | worker | `daily`, `weekly`, or `manual` |
| `LANGUAGES` | worker | Comma-separated language codes (e.g., `en`, `en,de,ja`) |
| `PANGOLIN_ENDPOINT` | newt | URL of your Pangolin instance |
| `NEWT_ID` | newt | Site ID from Pangolin dashboard |
| `NEWT_SECRET` | newt | Site secret from Pangolin dashboard |

## Resetting SpacetimeDB Ownership

The publisher identity is now stored in the `stdb_publish_config` volume. For a clean reset:

```bash
podman-compose down
podman volume rm spellbook_spacetimedb_data spellbook_spacetimedb_config spellbook_stdb_publish_config
podman-compose up -d
```

The first boot republishes the module under the persistent publisher identity. Later restarts reuse that identity and should not hit prior-owner authorization errors.
