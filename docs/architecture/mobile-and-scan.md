# Mobile And Scan Architecture

- Status: Canonical
- Last Reviewed: 2026-04-11
- Source of Truth: code
- Update Triggers: mobile API changes, scan worker changes, object storage changes, vector-search changes, Android client boundary changes
- Related Docs: [System Overview](./system-overview.md), [Frontend](./frontend.md), [Auth](./auth.md), [SpacetimeDB](./spacetimedb.md), [Deployment](../operations/deployment.md), [ADR-0002](../decisions/0002-android-first-mobile-and-server-side-scan.md)

Spellbook now has a mobile foundation for an Android-first client and a server-side scan workflow.

## Current Boundaries

- Android app: thin native client for MTG search, inventory, decks, and scan capture
- frontend server: mobile API, bearer-token auth validation, MeiliSearch access, scan artifact upload
- SpacetimeDB: user-scoped inventory, deck, scan session, review queue, and idempotency records
- MinIO: original uploads and normalized crop storage
- scan-worker: scan processing boundary
- vector index: reference-image embedding lookup

## Current Mobile API Surface

The SvelteKit server exposes the current mobile contract under `/api/mobile/v1/mtg/...`.

Current route groups:

- search
- inventory
- decks
- scan

These endpoints are server-side adapters over the existing MTG catalog and SpacetimeDB module.

## Current Scan Flow

1. Android captures a still image.
2. The mobile API stores the original upload in MinIO-compatible object storage.
3. The mobile API forwards the artifact metadata to `scan-worker`.
4. `scan-worker` returns a scan result payload.
5. The mobile API records scan artifact metadata and candidate payloads in SpacetimeDB.
6. Review items are committed through `batch_add_to_inventory`.

The current scan worker implementation is a scaffold that preserves the service boundary and response contract. It is not yet a production recognizer.

## Current Android Constraints

- Kotlin + Jetpack Compose
- CameraX capture
- no mandatory Google Play Services dependency
- browser-based OIDC login with PKCE
- online-only operation for scan v1

## Current Stability Model

- scan never mutates inventory directly from upload
- inventory batch commits are idempotent by `requestId`
- object storage and scan processing are isolated from the existing web inventory and deck routes
