# Mobile and scan

- Status: Canonical
- Last Reviewed: 2026-10-03
- Source of Truth: code
- Update Triggers: manifest, service worker, API authentication, request validation and limits, deck availability, artifact storage, scan processing
- Related Docs: [Frontend](./frontend.md), [Auth](./auth.md), [Postgres](./postgres.md), [Deployment](../operations/deployment.md), [Proposed card robot](../integrations/card-robot.md), [ADR-0003](../decisions/0003-pwa-first-mobile-and-server-side-scan.md)

Spellbook has one web client. Its manifest in `frontend/static/manifest.webmanifest` provides install metadata; `frontend/src/app.html` links it. A service worker and offline caching are not implemented. The `/scan` workspace supports image upload, candidate review, manual printing selection, and explicit inventory commit. Direct browser camera capture remains planned.

## Implemented API boundary

The `/api/mobile/v1/mtg/...` API exposes search, inventory, decks, import/export, and scan orchestration. External clients authenticate with local session bearer tokens; the `/scan` workspace uses its browser cookie with origin protection on mutations. See [authentication](./auth.md) for acquisition and revocation.

Authenticated clients can read `GET /api/mobile/v1/mtg/decks/{deckId}/availability`. The route checks deck ownership and reuses the shared allocation function to compare that deck with current aggregate inventory. Its response contains entry counts and totals for required, exact, alternate, and missing copies. It makes no inventory changes or cross-deck reservations. See the [product specification](../product/specification.md#deck-availability) for allocation semantics and [OpenAPI](../../frontend/src/routes/openapi.json/+server.ts) for the wire schema.

## Request validation

JSON handlers use the shared [request reader](../../frontend/src/lib/server/http/request.ts). They require `application/json`, valid UTF-8, and a top-level object. The reader counts streamed bytes and rejects bodies over 1 MiB, including requests without a trustworthy `Content-Length`. Wrong media types return HTTP 415, malformed JSON or non-object bodies return HTTP 400, and oversized bodies return HTTP 413.

Supplied scalar values keep their declared types. Strings are not coerced into numbers, and numeric values must be finite. Route and domain validation enforce UUID identifiers, supported roles and finishes, quantities, and ownership. Omitted or null optional values use only the handler's documented defaults.

Search and printing pagination accept decimal integer query strings, not negative values, fractions, exponent notation, or nonfinite values. Search `limit` defaults to 20 and accepts 0 through 100. Printing `limit` defaults to 100 and accepts 1 through 100. Both offsets default to zero and accept integers through 1,000,000. Invalid pagination returns HTTP 400.

[Postgres](./postgres.md#mutation-replay) owns request fingerprint storage and HTTP 409 replay conflicts. The [OpenAPI route](../../frontend/src/routes/openapi.json/+server.ts) owns endpoint-specific fields and responses.

## Scan uploads

Native scanners submit frames with a valid `Authorization: Bearer <token>` header and may omit `Origin`. The exact multipart frame endpoint has a narrow exception in the [form-origin guard](./auth.md#entry-points); other form routes do not share it. A foreign origin fails even with a bearer token, and an invalid bearer token never falls back to a browser cookie. Browser cookie uploads require the matching application origin.

Frame submission requires `multipart/form-data` with a `file` field. The streamed multipart body is limited to 12 MiB, and the image itself to 10 MiB. Empty or malformed uploads return HTTP 400. Unsupported media types and signatures that do not match the declared JPEG, PNG, or WebP MIME type return HTTP 415. Oversized data returns HTTP 413 before storage.

The adapter's [deployment limit](../operations/deployment.md#configuration) allows the multipart envelope. Application checks still apply independently of the adapter and reverse proxy.

Scan API processing follows this order:

1. A client creates a scan session and uploads an image.
2. SvelteKit stores the original image in configured local or S3-compatible storage.
3. SvelteKit passes artifact metadata to `scan-worker`.
4. The worker returns `no_match`, zero quality, empty OCR tokens, and no candidates.
5. SvelteKit records artifact metadata and review state in Postgres.
6. Explicit review commits use the idempotent inventory repository.

The worker reports the original object key as its normalized object key because it has not created a normalized image. Its `stub-v1` model versions identify the scaffold. It does not read images, recognize cards, run OCR, generate embeddings, or call a vector database.

Storage and worker processing finish before recording the artifact. The worker request times out after 30 seconds. A failed upload, worker call, or database recording attempts to delete the newly created original object. Storage deletion can also fail; cleanup is best effort, and the failure is logged. Without a database commit or another concurrent change, the session remains open for retry. Processing failures return a generic HTTP 502; validation and ownership failures keep their specific responses.

## External scanner results

The [OpenAPI route](../../frontend/src/routes/openapi.json/+server.ts) owns wire schemas. Current scanner operations include:

| Operation          | Route under `/api/mobile/v1/mtg`                                | Behavior                                                                               |
| ------------------ | --------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| List sessions      | `GET /scan/sessions`                                            | Up to 100 owned sessions, newest update first                                          |
| Read image         | `GET /scan/artifacts/{artifactId}/image`                        | The owned original image, checked as JPEG, PNG, or WebP, with `no-store` and `nosniff` |
| Submit recognition | `POST /scan/sessions/{sessionId}/artifacts/{artifactId}/result` | Replace an owned artifact's candidate result without changing inventory                |

A recognition submission includes `status`, `modelVersion`, and up to 20 distinct printing candidates. Each candidate includes `catalogCardId`, finite `confidence` from 0 to 1, and optional notes. The server resolves authoritative card metadata through the active [catalog generation](./catalog.md); a client cannot choose ownership or substitute catalog names and identities.

`matched` requires at least one candidate, `ambiguous` requires at least two, and `no_match` or `failed` requires none. Writes lock the session and reject committed or cancelled sessions. Repeated submissions replace the same artifact result and create no additional artifact or inventory entry. The endpoint has no event ID, payload digest, or stale-result version check. A delayed result can replace a newer candidate result while the session remains open for review.

Session creation and frame upload have no caller-supplied idempotency key. Review commits use the existing `requestId` boundary. These are separate guarantees; commit idempotency does not make the entire capture pipeline replay-safe.

This endpoint accepts results from an external recognizer, but Spellbook's own worker remains a scaffold. Device jobs, tray routing, physical copies, locations, and deck assignments remain proposed in the [card robot integration](../integrations/card-robot.md).

## Data boundaries

Binary uploads live outside Postgres. Postgres stores account ownership, scan session state, artifact metadata, review entries, and mutation request IDs. Uploading an image never adds cards directly to inventory.

Development uses a shared named volume for local artifacts. Production can use an existing S3-compatible bucket. See [deployment](../operations/deployment.md) for configuration.

Recognition and capture work must preserve explicit review before inventory changes. [ADR-0003](../decisions/0003-pwa-first-mobile-and-server-side-scan.md) records the single-client decision; its proposed recognition pipeline is not current functionality.
