# ADR-0003: PWA-First Mobile Client And Server-Side Scan Pipeline

- Status: Accepted
- Date: 2026-04-17
- Supersedes: [ADR-0002](./0002-android-first-mobile-and-server-side-scan.md)
- Related Docs: [System Overview](../architecture/system-overview.md), [Mobile And Scan Architecture](../architecture/mobile-and-scan.md), [Deployment](../operations/deployment.md), [Auth](../architecture/auth.md), [Feature Status](../product/feature-status.md)

## Context

ADR-0002 committed to a thin native Android client built in Kotlin and Jetpack Compose, with a dedicated mobile API under `/api/mobile/v1/...` and a separate native Zitadel client.

In practice, the Android shell that was built:

- duplicated search, inventory, and decks as placeholder screens with no implementation
- only implemented a CameraX preview for scan capture
- was never released and was not on a path to parity with the SvelteKit web product

The existing SvelteKit frontend already implements search, inventory, and decks against the base app persistence layer and MeiliSearch. The scan pipeline (MinIO artifact storage, scan-worker, vector index) is server-side and does not require a native client.

Continuing the native-first direction would require rewriting the web product's feature surface a second time in Compose without a capability gap that justifies it.

## Decision

Spellbook will adopt a PWA-first mobile architecture backed by the existing SvelteKit frontend.

The implementation constraints are:

- the SvelteKit frontend is the single client codebase for web and mobile
- mobile installability is delivered through a web app manifest and service worker
- camera capture for scan uses the browser `getUserMedia` API
- mobile auth uses the existing SvelteKit session cookie flow against Zitadel
- scans remain stored server-side
- scan recognition remains server-side
- review-first inventory mutation remains mandatory
- the `/api/mobile/v1/...` surface and bearer-token validation are retained as optional future hooks (for example, a Capacitor wrapper) but are not required for the PWA client
- the native Android Kotlin and Jetpack Compose source tree is removed

The backend pieces introduced by ADR-0002 are preserved:

- MinIO-compatible object storage for original uploads and normalized crops
- the `scan-worker` service
- the vector index service
- database tables for scan session and review workflow state
- idempotent batch inventory mutation

The scan pipeline remains hybrid: image embeddings for retrieval, OCR for deterministic clues, metadata reranking against the MTG catalog, human review before inventory mutation.

## Consequences

### Positive

- one frontend codebase covers desktop and mobile
- instant updates without app store review
- no duplicated search, inventory, or deck implementations
- no dependency on Google Play Services, Firebase, or any store billing
- users install from a URL, keeping the GrapheneOS-safe property of ADR-0002
- scan backend work from ADR-0002 stays intact

### Negative

- iOS PWA support is weaker than Android (no background sync, limited push, stricter storage quotas)
- deep native capabilities (BLE, background workers, rich push) are not available without wrapping later
- discoverability through app stores is lost unless a Capacitor wrap or TWA is added later

### Guardrails

- do not reintroduce a parallel native codebase without a documented capability gap
- do not auto-add scan results directly to inventory
- do not store binary image blobs in the application database
- do not require PWA install for any core feature; install must stay an enhancement
- if a native wrap becomes necessary, prefer wrapping the PWA (for example with Capacitor) over a second-codebase rewrite
