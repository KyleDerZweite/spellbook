# Deployment Guide

- Status: Canonical
- Last Reviewed: 2026-04-08
- Source of Truth: mixed
- Update Triggers: service topology changes, env var changes, auth boundary changes, compose changes
- Related Docs: [Operations Docs](./README.md), [Zitadel](./zitadel.md), [Auth Architecture](../architecture/auth.md), [System Overview](../architecture/system-overview.md)

This guide documents the current generic self-hosted deployment shape for Spellbook.

For live domains, client IDs, operator contacts, and other instance-specific notes, keep a separate private note based on [private-instance-template.md](./private-instance-template.md).

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

## MeiliSearch Search Key Behavior

Do not treat `PUBLIC_MEILISEARCH_SEARCH_KEY` as a required operator-side variable for the current app.

Current behavior:

- the frontend server uses `MEILISEARCH_INTERNAL_URL` and `MEILI_MASTER_KEY`
- it fetches the default search-only key from MeiliSearch at runtime
- it exposes that key to authenticated sessions through SvelteKit server data

This matches the current implementation in `frontend/src/hooks.server.ts`.
