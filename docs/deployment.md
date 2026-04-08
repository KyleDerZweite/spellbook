# Deployment Guide

This guide documents the current generic self-hosted deployment shape for Spellbook.

For live domains, client IDs, operator contacts, and other instance-specific notes, keep a separate private note based on [private-instance-template.md](/home/kyle/CodingProjects/spellbook/docs/private-instance-template.md).

## Current Architecture

Spellbook currently runs as six services under `podman-compose`:

| Service | Role |
|---------|------|
| `spacetimedb` | Real-time database for user-scoped inventory and deck data |
| `stdb-publish` | One-shot publisher for the SpacetimeDB module |
| `meilisearch` | Card catalog search engine |
| `worker` | Python sync pipeline for MTG catalog ingestion |
| `frontend` | SvelteKit app server |
| `newt` | Pangolin tunnel agent |

## Auth Model

Spellbook now handles authentication directly with Zitadel using OIDC Authorization Code + PKCE.

Pangolin is used only as transport and reverse-proxy infrastructure in this deployment model. Pangolin should not own the Spellbook login flow.

Current auth flow:

1. Browser reaches the frontend through Pangolin/Newt.
2. Frontend redirects to Zitadel for login.
3. Frontend exchanges the authorization code and stores the encrypted session cookie.
4. Frontend passes the ID token to SpacetimeDB for authenticated access.

## Network Model

The browser needs to reach three public surfaces:

| Surface | Purpose |
|---------|---------|
| App origin | SvelteKit frontend and auth callbacks |
| Search origin | Browser-side MeiliSearch access |
| Database origin | Browser-side SpacetimeDB WebSocket access |

Example placeholder layout:

| Example URL | Service |
|-------------|---------|
| `https://spellbook.example.com` | Frontend |
| `https://spellbook-search.example.com` | MeiliSearch |
| `wss://spellbook-db.example.com` | SpacetimeDB |

## Compose Expectations

The checked-in [podman-compose.yml](/home/kyle/CodingProjects/spellbook/podman-compose.yml) expects:

- `spacetimedb` on the internal network
- `meilisearch` on the internal network
- `worker` talking to MeiliSearch over the internal network
- `frontend` talking to MeiliSearch internally for key lookup and externally for browser-facing URLs
- `newt` forwarding external traffic through Pangolin

## Required Environment Variables

### Frontend

| Variable | Description |
|----------|-------------|
| `ZITADEL_ISSUER` | Zitadel issuer URL |
| `ZITADEL_CLIENT_ID` | Public OIDC client ID |
| `APP_ORIGIN` | Public frontend origin |
| `AUTH_SESSION_SECRET` | 32-byte base64url secret for encrypted cookies |
| `PUBLIC_MEILISEARCH_URL` | Browser-facing MeiliSearch URL |
| `PUBLIC_SPACETIMEDB_URL` | Browser-facing SpacetimeDB URL |
| `PUBLIC_SPACETIMEDB_MODULE` | SpacetimeDB database name, default `spellbook` |
| `MEILISEARCH_INTERNAL_URL` | Internal MeiliSearch URL used by the server |
| `MEILI_MASTER_KEY` | Used by the frontend server to fetch the search-only key from MeiliSearch |

### Worker and MeiliSearch

| Variable | Description |
|----------|-------------|
| `MEILI_MASTER_KEY` | MeiliSearch admin key |
| `AGGRESSIVE_PRELOAD` | `true` loads `all_cards` in the background |
| `SYNC_INTERVAL` | `daily`, `weekly`, or `manual` |
| `LANGUAGES` | Comma-separated language codes |

### Pangolin / Newt

| Variable | Description |
|----------|-------------|
| `PANGOLIN_ENDPOINT` | Pangolin endpoint |
| `NEWT_ID` | Site ID from Pangolin |
| `NEWT_SECRET` | Site secret from Pangolin |

## MeiliSearch Search Key Behavior

Do not treat `PUBLIC_MEILISEARCH_SEARCH_KEY` as a required operator-side variable for the current app.

Current behavior:

- the frontend server uses `MEILISEARCH_INTERNAL_URL` and `MEILI_MASTER_KEY`
- it fetches the default search-only key from MeiliSearch at runtime
- it exposes that key to authenticated sessions through SvelteKit server data

This matches the current implementation in `frontend/src/hooks.server.ts`.

## Zitadel Notes

Spellbook expects:

- a browser-safe public client
- no client secret
- Authorization Code + PKCE
- callback route at `/auth/callback`

See [zitadel.md](/home/kyle/CodingProjects/spellbook/docs/zitadel.md) for the exact generic setup.

## Pangolin Setup Notes

If you use Pangolin:

- route the frontend, search, and database surfaces independently
- disable Pangolin IAP for Spellbook itself
- let Spellbook own the OIDC login flow

Separate public origins are still useful because the browser talks directly to the frontend, MeiliSearch, and SpacetimeDB.

## Local Development

For local development, expose ports with an override compose file or run the services directly.

Typical local values:

```env
APP_ORIGIN=http://localhost:5173
PUBLIC_MEILISEARCH_URL=http://localhost:7700
PUBLIC_SPACETIMEDB_URL=ws://localhost:3000
MEILISEARCH_INTERNAL_URL=http://localhost:7700
```

## Resetting SpacetimeDB Ownership

If you need to reset local SpacetimeDB ownership for a clean publish cycle:

```bash
podman-compose down
podman volume rm spellbook_spacetimedb_data spellbook_spacetimedb_config spellbook_stdb_publish_config
podman-compose up -d
```
