# Deployment Guide

- Status: Canonical
- Last Reviewed: 2026-04-25
- Source of Truth: mixed
- Update Triggers: service topology changes, env var changes, auth boundary changes, compose changes
- Related Docs: [Operations Docs](./README.md), [Zitadel](./zitadel.md), [Auth Architecture](../architecture/auth.md), [System Overview](../architecture/system-overview.md)

This guide documents the current generic self-hosted deployment shape for Spellbook.

For live domains, client IDs, operator contacts, and other instance-specific notes, keep a separate private note based on [private-instance-template.md](./private-instance-template.md).

## Current Architecture

Spellbook currently runs with the core services below under `podman-compose`:

| Service | Role |
|---------|------|
| `postgres` | Durable database for user-scoped application data |
| `db-migrate` | One-shot Drizzle migration runner |
| `meilisearch` | Card catalog search engine |
| `worker` | Python sync pipeline for MTG catalog ingestion |
| `frontend` | SvelteKit app server |
| `newt` | Pangolin tunnel agent |

The mobile and scan foundation adds these services:

| Service | Role |
|---------|------|
| `minio` | S3-compatible object storage for retained scan artifacts |
| `scan-worker` | Scan-processing boundary for normalization, OCR, embeddings, and reranking |
| `qdrant` | Vector index for image embedding retrieval |

## Auth Model

Spellbook now handles authentication directly with Zitadel using OIDC Authorization Code + PKCE.

Pangolin is used only as transport and reverse-proxy infrastructure in this deployment model. Pangolin should not own the Spellbook login flow.

## Required Environment Variables

### Frontend

| Variable | Description |
|----------|-------------|
| `ZITADEL_ISSUER` | Zitadel issuer URL |
| `ZITADEL_CLIENT_ID` | Public OIDC client ID |
| `ZITADEL_MOBILE_CLIENT_ID` | Optional. Bearer-token client id for `/api/mobile/v1/...`. Not required for the PWA |
| `APP_ORIGIN` | Public frontend origin |
| `AUTH_SESSION_SECRET` | 32-byte base64url secret for encrypted cookies |
| `DATABASE_URL` | Postgres connection string |
| `PUBLIC_MEILISEARCH_URL` | Browser-facing MeiliSearch URL |
| `MEILISEARCH_INTERNAL_URL` | Internal MeiliSearch URL used by the server |
| `MEILI_MASTER_KEY` | Used by the frontend server to fetch the search-only key from MeiliSearch |
| `MINIO_ENDPOINT` | S3-compatible endpoint for scan artifact storage |
| `MINIO_REGION` | Object storage region, typically `us-east-1` for local MinIO |
| `MINIO_BUCKET` | Bucket name for retained scan artifacts |
| `MINIO_ACCESS_KEY` | MinIO access key |
| `MINIO_SECRET_KEY` | MinIO secret key |
| `SCAN_WORKER_URL` | Internal URL for the scan-worker service |

### Postgres

| Variable | Description |
|----------|-------------|
| `POSTGRES_DB` | Database name, default `spellbook` |
| `POSTGRES_USER` | Database user, default `spellbook` |
| `POSTGRES_PASSWORD` | Database password used by the Postgres container and internal `DATABASE_URL` |

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

## Scan Artifact Storage

Current scan uploads are stored outside Postgres.

Operational guidance:

- store original uploads and normalized crops in MinIO-compatible object storage
- keep object lifecycle policy aligned with the current product retention decision
- do not store binary artifacts directly in Postgres tables

## Fedora And SELinux

The current compose file is intentionally biased toward named volumes instead of host bind mounts for persistent state.

That choice keeps the default deployment more portable across Podman on Fedora and Docker or Podman on Ubuntu:

- Podman-managed named volumes avoid most manual SELinux relabel work on Fedora
- the same compose file stays valid on non-SELinux hosts

If an operator replaces a named volume with a host bind mount on a Fedora or other SELinux-enforcing host:

- use `:Z` for a private bind mount used by one container
- use `:z` only when multiple containers must share the same host path
- these SELinux bind-mount options are ignored on platforms without SELinux

Current Fedora-specific note:

- the verified SELinux alerts seen during `podman-compose up` in this repo come from Podman's rootless `pasta` network helper, not from the Spellbook data volumes
- this is a host Podman configuration issue rather than a compose-file volume-label issue
- if those `pasta` alerts are noisy on Fedora, prefer changing Podman's rootless network helper to `slirp4netns` in the local `containers.conf` instead of weakening container labeling in the shared compose file
- that host-side workaround requires `slirp4netns` to be installed on the Fedora machine

Example user-level Podman config on Fedora:

```toml
[network]
default_rootless_network_cmd = "slirp4netns"
```

Place that in `~/.config/containers/containers.conf`, then recreate the stack.
