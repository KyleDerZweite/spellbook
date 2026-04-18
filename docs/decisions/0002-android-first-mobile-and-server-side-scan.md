# ADR-0002: Android-First Mobile Client And Server-Side Scan Pipeline

- Status: Superseded by [ADR-0003](./0003-pwa-first-mobile-and-server-side-scan.md)
- Date: 2026-04-11
- Superseded: 2026-04-17
- Related Docs: [System Overview](../architecture/system-overview.md), [Mobile And Scan Architecture](../architecture/mobile-and-scan.md), [Deployment](../operations/deployment.md), [Auth](../architecture/auth.md), [Feature Status](../product/feature-status.md)

> Superseded. The native Android shell was never released and duplicated the existing SvelteKit surfaces. See [ADR-0003](./0003-pwa-first-mobile-and-server-side-scan.md) for the PWA-first replacement. The server-side scan pipeline decision from this ADR is preserved by ADR-0003.

## Context

Spellbook already implements MTG search, inventory, and decks in the web product.

The next product expansion needs to add:

- Android mobile support
- GrapheneOS-safe operation without mandatory Google Play Services
- card scanning with retained scan artifacts
- review-first inventory mutation

The existing architecture has no mobile API, no scan artifact storage, and no dedicated scan-processing service.

## Decision

Spellbook will adopt an Android-first mobile architecture with a thin native client and a server-heavy scan pipeline.

The implementation constraints are:

- Android only for the first native release
- Kotlin + Jetpack Compose for the native app
- CameraX for still-image capture
- Authorization Code + PKCE via system browser or Custom Tabs
- no embedded WebView auth
- no mandatory Google Play Services dependency anywhere in the APK
- no Firebase / FCM, Play Integrity, SafetyNet, or Google Sign-In dependency
- MTG only for the first mobile release
- mobile includes search, inventory, decks, and scan
- play remains out of scope for mobile
- scans are stored server-side
- scan recognition is server-side
- review-first inventory mutation is mandatory

The backend additions are:

- SvelteKit mobile API under `/api/mobile/v1/...`
- MinIO-compatible object storage for original uploads and normalized crops
- a dedicated `scan-worker` service
- a vector index service for image embeddings
- SpacetimeDB tables for scan session and review workflow state
- an idempotent `batch_add_to_inventory` reducer

The scan pipeline is hybrid:

- image embeddings for retrieval
- OCR for deterministic clues
- metadata reranking against the MTG catalog
- human review before any inventory mutation

## Consequences

### Positive

- mobile clients stay simple and GrapheneOS-safe
- server-side recognition can improve without forcing mobile rework
- retained scan artifacts create an evaluation and tuning corpus
- inventory mutation stays tied to the canonical SpacetimeDB data model
- existing web routes and web product behavior remain intact

### Negative

- deployment grows to include MinIO, scan-worker, and vector infrastructure
- scan feature availability now depends on additional services
- initial Android release requires a separate native codebase

### Guardrails

- do not introduce Play Services-backed ML or auth dependencies into the Android app
- do not store binary image blobs in SpacetimeDB
- do not auto-add scan results directly to inventory
- do not treat the Android shell as released product surface until auth, inventory, decks, and scan review flows are verified end to end
