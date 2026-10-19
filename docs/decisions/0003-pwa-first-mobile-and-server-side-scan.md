# ADR-0003: PWA-First Mobile Client And Server-Side Scan Pipeline

- Status: Accepted
- Date: 2026-04-17
- Last Reviewed: 2026-10-19
- Source of Truth: recorded decision
- Update Triggers: independent Android design applicability, accepted PWA/QR delivery applicability, decision applicability, supersession, related document changes
- Supersedes: [ADR-0002](./0002-android-first-mobile-and-server-side-scan.md)
- Partially Superseded By: [ADR-0023](./0023-local-recognition-in-scanner-clients.md) for future capture and recognition placement; [ADR-0024](./0024-independent-applications.md) for independent Android delivery
- Related Docs: [System Overview](../architecture/system-overview.md), [Mobile And Scan Architecture](../architecture/mobile-and-scan.md), [Deployment](../operations/deployment.md), [Auth](../architecture/auth.md), [Product specification](../product/specification.md), [ADR-0015](./0015-shared-backend-use-cases-and-client-contracts.md), [Application contract](../architecture/application-contract.md), [ADR-0023](./0023-local-recognition-in-scanner-clients.md)

## Current applicability

On 2026-10-19, the maintainer rejected PWA-first as the next phone-app planning default and selected a separate Android application against the shared backend. [ADR-0023's dated clarification](./0023-local-recognition-in-scanner-clients.md#independent-android-design-clarification-2026-10-19) records that scope. The historical single-client and capability-gap guardrails below do not prohibit this selected client direction. [ADR-0024](./0024-independent-applications.md) selects Kotlin/Compose and the independent runtime contract. This supersedes the future single-client/native exclusion in this record; the existing PWA remains available. The historical Decision below is unchanged.

On 2026-10-07, [ADR-0023](./0023-local-recognition-in-scanner-clients.md) replaces the fixed capture/recognition allocation below with a local-recognition direction and an open client responsibility review. The historical Decision section remains a record of the earlier choice, not an active server-inference requirement. MTG card camera capture and recognition runtimes remain open. Existing website upload/review behavior remains implemented. The 2026-10-16 install/QR delivery selects a shared SvelteKit PWA; it does not implement MTG recognition.

SvelteKit remains the implemented web and mobile-web client. On 2026-10-06, the maintainer selected API preparation now and a separate app delivery later, reopening the exclusive single-client restriction below. That earlier deferral is narrowed by the accepted 2026-10-16 same-origin SvelteKit PWA/QR delivery. Separate native packaging remains unselected. The [system overview](../architecture/system-overview.md#accepted-boundary-redesign) links the accepted module contract. Q56 accepted backend/API preparation while keeping separate app delivery and technology selection for a later pass. This does not restore the removed Android prototype or claim an implemented native client.

[ADR-0010](./0010-postgres-catalog.md) replaces the historical MeiliSearch catalog with PostgreSQL. [ADR-0009](./0009-local-authentication.md) replaces the OIDC authentication choice. The manifest and public-only service worker are integrated. The accepted delivery adds QR camera scanning and explicit account authorization. Page/navigation integration and browser/Android acceptance remain pending on 2026-10-17; card camera capture and production recognition are not implemented. Unused vector infrastructure has been removed. See [mobile and scan](../architecture/mobile-and-scan.md) for implementation status.

## Context

ADR-0002 committed to a thin native Android client built in Kotlin and Jetpack Compose, with a dedicated mobile API under `/api/mobile/v1/...` and a separate native Zitadel client.

In practice, the Android shell that was built:

- duplicated search, inventory, and decks as placeholder screens with no implementation
- only implemented a CameraX preview for scan capture
- was never released and was not on a path to parity with the SvelteKit web product

The existing SvelteKit frontend already implements search, inventory, and decks against the base app persistence layer and MeiliSearch. The scan pipeline (configurable artifact storage, scan-worker, vector index) is server-side and does not require a native client.

Continuing the native-first direction would require rewriting the web product's feature surface a second time in Compose without a capability gap that justifies it.

## Decision

Spellbook will adopt a PWA-first mobile architecture backed by the existing SvelteKit frontend.

The implementation constraints are:

- the SvelteKit frontend is the single client codebase for web and mobile
- mobile installability is delivered through a web app manifest and service worker
- camera capture for scan uses the browser `getUserMedia` API
- mobile auth uses the existing SvelteKit session cookie flow against the configured OIDC provider
- scans remain stored server-side
- scan recognition remains server-side
- review-first inventory mutation remains mandatory
- the `/api/mobile/v1/...` surface and bearer-token validation are retained as optional future hooks (for example, a Capacitor wrapper) but are not required for the PWA client
- the native Android Kotlin and Jetpack Compose source tree is removed

The backend pieces introduced by ADR-0002 are preserved:

- configurable artifact storage for original uploads and normalized crops, with local filesystem storage for development and S3-compatible storage for production
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
