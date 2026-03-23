# Deployment Guide

## Architecture

Spellbook runs as 5 containers orchestrated via `podman-compose`:

| Service | Image | Port | Role |
|---------|-------|------|------|
| **spacetimedb** | clockworklabs/spacetime:v2.0.5 | 3000 | Real-time database (collections, user data) |
| **meilisearch** | getmeili/meilisearch:v1.39.0 | 7700 | Full-text card search engine |
| **worker** | Built from `./worker` | - | Python data pipeline (Scryfall -> MeiliSearch) |
| **frontend** | Built from `./frontend/Dockerfile` | 3000 (mapped to 5173) | SvelteKit app (Node.js, adapter-node) |
| **newt** | fosrl/newt:latest | - | Pangolin tunnel agent |

### How the frontend works

The frontend is a **Node.js server**, not nginx. SvelteKit compiles with `adapter-node` to a standalone app that runs via `node build` on port 3000. It:

- Serves the SvelteKit app (SSR + client hydration)
- Reads Pangolin IAP headers (`Remote-Subject`, `Remote-User`, `Remote-Email`) in `hooks.server.ts` for auth
- The browser connects directly to MeiliSearch (read-only key) for card search
- The browser connects via WebSocket to SpacetimeDB for real-time collection data

## Pangolin Setup

[Pangolin](https://github.com/fosrl/pangolin) is a self-hosted reverse proxy with identity-aware proxy (IAP) capabilities. It sits in front of Spellbook and handles authentication.

### Prerequisites

- A running Pangolin instance on your server/VPS
- A domain or subdomain pointed at your Pangolin instance (e.g., `spellbook.yourdomain.com`)

### Step 1: Create a Site in Pangolin

1. Log into the Pangolin admin dashboard
2. Create a new **Site** for Spellbook
3. Note the **Newt ID** and **Newt Secret** generated for the site

### Step 2: Configure the Resource

1. In the Pangolin dashboard, create a **Resource** under the site
2. Set the target to: `http://frontend:3000`
   - This is the Docker-internal hostname since Newt runs in the same compose network
3. Set the domain/subdomain (e.g., `spellbook.yourdomain.com`)
4. Enable **Identity-Aware Proxy (IAP)** if you want authentication
   - Pangolin will inject `Remote-Subject`, `Remote-User`, and `Remote-Email` headers
   - The SvelteKit `hooks.server.ts` reads these headers to identify the user

### Step 3: Configure Environment

Copy `.env.example` to `.env` and fill in:

```env
# Pangolin / Newt
PANGOLIN_ENDPOINT=https://pangolin.yourdomain.com
NEWT_ID=<from Pangolin dashboard>
NEWT_SECRET=<from Pangolin dashboard>
```

### Step 4: How Newt Connects

Newt is a tunnel agent that runs inside the compose stack. It:

1. Connects **outbound** to your Pangolin server (no inbound ports needed)
2. Registers as the tunnel endpoint for the configured site
3. Pangolin routes incoming requests through the tunnel to the frontend container
4. Auth headers are injected by Pangolin before they reach the frontend

This means the host machine does not need any inbound ports open for web traffic - only the outbound connection from Newt to Pangolin.

### Network Flow

```
User -> Pangolin (your VPS) -> [tunnel] -> Newt -> frontend:3000
                                                     |
                                          Browser JS connects to:
                                          - MeiliSearch (search)
                                          - SpacetimeDB (collections via WebSocket)
```

**Note:** For MeiliSearch and SpacetimeDB browser connections, those services also need to be reachable from the user's browser. Options:

1. **Expose via Pangolin** (recommended): Create additional Pangolin resources for MeiliSearch (read-only) and SpacetimeDB WebSocket
2. **Direct port exposure**: Open ports 7700 and 3000 on the host (simpler but less secure)

Update the `PUBLIC_MEILISEARCH_URL` and `PUBLIC_SPACETIMEDB_URL` environment variables in the frontend service to match whichever approach you use.

## Quick Start

```bash
# 1. Copy and fill in environment variables
cp .env.example .env
# Edit .env with your values

# 2. Start all services
podman-compose up -d

# 3. Publish the SpacetimeDB module (first time only)
spacetime publish spellbook --host http://localhost:3000

# 4. Verify services
curl -s http://localhost:7700/health          # MeiliSearch
curl -s http://localhost:3000/database/ping    # SpacetimeDB
curl -s http://localhost:5173                  # Frontend
```

## Environment Variables

| Variable | Where | Description |
|----------|-------|-------------|
| `MEILI_MASTER_KEY` | worker, meilisearch | MeiliSearch admin key |
| `MEILISEARCH_SEARCH_KEY` | frontend | Read-only search key for browser |
| `AUTH_SIGNING_SECRET` | frontend | Shared secret for auth tokens |
| `AGGRESSIVE_PRELOAD` | worker | `true` = all printings, `false` = default cards only |
| `SYNC_INTERVAL` | worker | `daily`, `weekly`, or `manual` |
| `LANGUAGES` | worker | Comma-separated language codes (e.g., `en`, `en,de,ja`) |
| `PANGOLIN_ENDPOINT` | newt | URL of your Pangolin instance |
| `NEWT_ID` | newt | Site ID from Pangolin dashboard |
| `NEWT_SECRET` | newt | Site secret from Pangolin dashboard |
