# Mobile And Scan Architecture

- Status: Canonical
- Last Reviewed: 2026-04-17
- Source of Truth: code
- Update Triggers: PWA manifest or service worker changes, mobile API changes, scan worker changes, object storage changes, vector-search changes
- Related Docs: [System Overview](./system-overview.md), [Frontend](./frontend.md), [Auth](./auth.md), [SpacetimeDB](./spacetimedb.md), [Deployment](../operations/deployment.md), [ADR-0003](../decisions/0003-pwa-first-mobile-and-server-side-scan.md)

Spellbook delivers mobile through the existing SvelteKit frontend as an installable PWA, with the scan pipeline handled server-side.

## Current Boundaries

- SvelteKit frontend: web and mobile client, installable via web app manifest
- frontend server: session auth, MeiliSearch access, scan artifact upload orchestration
- SpacetimeDB: user-scoped inventory, deck, scan session, review queue, and idempotency records
- MinIO: original uploads and normalized crop storage
- scan-worker: scan processing boundary
- vector index: reference-image embedding lookup

## PWA Surface

The installable mobile surface is the same SvelteKit application served at the public origin. No separate client codebase exists.

PWA plumbing lives in:

- `frontend/static/manifest.webmanifest` for install metadata, icons, theme, and shortcuts
- `frontend/src/app.html` links the manifest and sets `theme-color` and viewport

A service worker for offline caching is planned but not yet implemented. Until it lands, the PWA behaves as an installable online-only shell.

## Scan Capture On Mobile

Scan capture runs in the browser on the installed PWA:

- the camera is opened through `getUserMedia`
- a still frame is captured and posted to the frontend
- recognition happens server-side

The native CameraX capture path from the previous Android shell is removed.

## Current Mobile API Surface

The SvelteKit server still exposes a mobile contract under `/api/mobile/v1/:game/...` (currently `mtg`) with bearer-token validation. The game segment is retained on this surface so future games can be added without breaking pinned mobile clients.

Current route groups:

- search
- inventory
- decks
- scan

These endpoints are retained as an optional integration boundary (for example, a future Capacitor wrap or third-party client). The PWA itself does not require them and uses the session-cookie flow against the standard web routes.

## Current Scan Flow

1. The PWA captures a still image in the browser.
2. The frontend server stores the original upload in MinIO-compatible object storage.
3. The frontend server forwards the artifact metadata to `scan-worker`.
4. `scan-worker` returns a scan result payload.
5. The frontend server records scan artifact metadata and candidate payloads in SpacetimeDB.
6. Review items are committed through `batch_add_to_inventory`.

The current scan worker implementation is a scaffold that preserves the service boundary and response contract. It is not yet a production recognizer.

## Current PWA Constraints

- online-only operation for scan v1
- no mandatory Google Play Services, Firebase, or app store dependency
- install is optional and must never be required for core features
- iOS PWA limitations apply (no background sync, limited push, stricter storage quotas)

## Current Stability Model

- scan never mutates inventory directly from upload
- inventory batch commits are idempotent by `requestId`
- object storage and scan processing are isolated from the existing web inventory and deck routes
