# Mobile and scan

- Status: Canonical
- Last Reviewed: 2026-10-07
- Source of Truth: code, proposed recognition design, primary documentation
- Update Triggers: public reference/history exception/private price reads and source precision, manifest, service worker, API authentication, request validation and limits, deck availability, artifact storage, Scan contracts and legacy replay, scan processing, recognition evaluation, owned-card search, bounded Inventory wire migration, Deck wire contracts and revisions, device runtime selection, category initialization/manual decisions/merge previews
- Related Docs: [Application contract](./application-contract.md), [Frontend](./frontend.md), [Auth](./auth.md), [Postgres](./postgres.md), [Catalog](./catalog.md), [Domain model](../../GLOSSARY.md), [Deployment](../operations/deployment.md), [Category rules](./category-rules.md), [Proposed card robot](../integrations/card-robot.md), [ADR-0003](../decisions/0003-pwa-first-mobile-and-server-side-scan.md)

Spellbook has one web client. Its manifest in `frontend/static/manifest.webmanifest` provides install metadata; `frontend/src/app.html` links it. A service worker and offline caching are not implemented. The `/mtg/scan` workspace supports image upload, candidate review, manual printing selection, and explicit inventory commit. Direct browser camera capture remains planned.

## Bounded Inventory HTTP reads

The accepted experimental v1 migration replaces `GET /api/mobile/v1/mtg/inventory` snapshot reads with an InventoryPage DTO. It accepts normalized filters/order/group plus offset and limit, defaulting to 50 with a maximum of 100. Supplying `revision` pins the request; drift returns HTTP 409 with `{ kind: 'RevisionChanged', revision }`. Entries, loaded memberships, query identity and complete counts/set/group metadata share one snapshot. Timestamps are ISO strings and revisions are decimal strings.

`GET /inventory/{entryId}` returns an owned entry, memberships and revision, or 404. `GET /inventory/{entryId}/location` requires the expected revision and returns the matching absolute index or null; drift returns the same 409 shape. All relative paths use the versioned MTG prefix. Invalid queries return 400; invalid selected groups return 400 in the API and 404 in native page loading. [The application contract](./application-contract.md#inventory-query-contract) owns normalization and ordering; [OpenAPI](../../frontend/src/routes/openapi.json/+server.ts) owns exact wire schemas.

If Inventory counts or a location index cannot be represented as a nonnegative safe JSON integer, API reads and native page loading return HTTP 500 with `Inventory totals cannot be represented exactly.` They never return rounded counts. [Postgres](./postgres.md#inventory-read-and-write-consistency) owns decoding and SQL aggregate rules.

Inventory POST/batch-add, PATCH/DELETE, bulk and import commit now return `InventoryAcknowledgement`, replacing snapshots, nullable current entries and `{ ok: true }` removals in experimental v1. Scan review wraps that original acknowledgement in its explicit committed/legacy union below. Every mutation requires a caller-retained request ID. PATCH supplies quantity or signed delta and/or Notes; omitted fields remain unchanged. Notes requires `notesRevision`. Ordinary delta reductions floor at one. Reviewed DELETE additionally requires `expectedQuantity` in its JSON body. Import commits return compact resolved/unresolved/ambiguous counts; preview retains review diagnostics.

New account-scoped Group routes are `GET/POST /inventory/groups`, `PATCH/DELETE /inventory/groups/{groupId}` and `PUT /inventory/{entryId}/groups`; the latter replaces complete whole-entry membership. Explicit `PATCH /inventory/{entryId}/position` reorders entries. All relative paths use `/api/mobile/v1/mtg`. Unsupported Sources, enums and quantities fail with controlled 400 before SQL. Missing owned subjects return 404; changed request intent, stale Notes and reviewed-quantity drift return 409. Successful retries consume the original receipt and refetch current bounded page/detail state separately. The [application contract](./application-contract.md#inventory-query-contract) owns legacy receipt limitations, atomic lock order and exact replay semantics; [OpenAPI](../../frontend/src/routes/openapi.json/+server.ts) owns requests/responses. Scan uses the backend-owned module and compact response union described below.

## Implemented API boundary

The `/api/mobile/v1/mtg/...` API exposes search, inventory, decks, import/export, and scan orchestration. The account routes expose Profile read/patch, Dashboard summaries, password rotation and session inspection through the same backend use cases as Settings/Dashboard. [Authentication](./auth.md#account-http-contract) owns their exact contract; [route inventory](../product/routing-and-games.md) lists their paths. External clients authenticate with local session bearer tokens; the `/mtg/scan` workspace uses its browser cookie with origin protection on mutations. See [authentication](./auth.md) for acquisition and revocation.

Authenticated clients can read `GET /api/mobile/v1/mtg/decks/{deckId}/availability`. The route checks deck ownership and reuses the shared allocation function to compare that deck with current aggregate inventory. Its response contains entry counts and totals for required, exact, alternate, and missing copies. It makes no inventory changes or cross-deck reservations. See the [product specification](../product/specification.md#deck-availability) for allocation semantics and [OpenAPI](../../frontend/src/routes/openapi.json/+server.ts) for the wire schema.

## Deck HTTP contract

Experimental v1 Deck responses now use explicit [Deck DTOs](../../contracts/src/decks.ts), ISO timestamps and decimal revision strings. `GET /api/mobile/v1/mtg/decks` returns library metadata, totals and covers; optional `deck=UUID` loads one owned composition and its relevant ownership aggregates. It removes the previous full `inventoryCards` and `mutationRequests` fields. `GET /decks/{deckId}` adds legality warnings and resolved safe documents. Existing paths, authentication and text export formats remain.

`GET /decks/search?q=...` returns Catalog hits with account-owned aggregates. `GET /decks/ownership` accepts repeated `canonicalCardId` values, at most 100, and returns owned-printing quantities. Relative paths use `/api/mobile/v1/mtg`. These reads never transfer full Inventory. Availability keeps its existing exact-before-alternate calculation.

Metadata PATCH changes supplied fields. Sending Description requires `descriptionRevision`; a stale save returns 409 with `kind: DescriptionConflict`, saved `description` and `descriptionRevision`. Card add/PATCH/DELETE, bulk and import commit return compact acknowledgements containing `requestId`, `deckId`, `revision`, `changes` and `removedEntryIds`. Each change identifies the entry, printing and role, with resulting quantity and applied delta. Add/PATCH require a caller-stable request ID; card DELETE supplies it in the query. PATCH supports atomic signed delta or the retained absolute quantity/role path. Ordinary negative deltas floor at one; explicit removal and bulk decrement can delete.

Clients of the former snapshot mutations must retain the request ID for a failed intent, consume the original acknowledgement and fetch current state separately. Changed-payload reuse returns 409 `RequestConflict`; Description conflict requires deliberate review/rebase. [The application contract](./application-contract.md#implemented-deck-application-boundary) owns replay and semantic replacement; [OpenAPI](../../frontend/src/routes/openapi.json/+server.ts) owns exact schemas and validation. Deck aggregate results outside the safe JSON integer range fail explicitly rather than return rounded quantities.

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
2. Backend Scan stores the original image in configured local or S3-compatible storage.
3. Backend Scan passes artifact metadata to `scan-worker`.
4. The worker returns `no_match`, zero quality, empty OCR tokens, and no candidates.
5. Backend Scan records artifact metadata and review state in Postgres.
6. Explicit review commits compose the private Inventory writer in one authorized transaction.

The worker reports the original object key as its normalized object key because it has not created a normalized image. Its `stub-v1` model versions identify the scaffold. It does not read images, recognize cards, run OCR, generate embeddings, or call a vector database.

Storage and worker processing finish outside the short recording transaction. Backend validates at most 1 MiB of worker JSON, 20 distinct candidates, 100 OCR tokens, bounded model names and integer scores. Only the exact original object key is accepted from the current worker. Public DTOs omit storage keys and account IDs; candidate display identity is resolved from authoritative Catalog. The worker request times out after 30 seconds.

Recording locks Profile/account, revalidates the session-produced actor, then locks the owned ScanSession. Upload requires `open`; result replacement and review commit accept `open` or `pending_review`. A successful attachment moves to `pending_review`; review commit moves to `committed`. Closed sessions return 409, foreign or absent subjects return 404. Storage failure, worker failure or confirmed rollback attempts deletion of only the newly generated object. Cancellation before commit dispatch rolls back before cleanup. After an uncertain COMMIT, Backend destroys the original connection and checks under the same ordered account/session locks. A committed attachment or an indeterminate recovery retains its object. Cleanup failures log a safe message without keys or credentials. Generic processing failures return 502; infrastructure reads/writes return sanitized 503.

The local acceptance seam uses the actual Python scaffold, real PostgreSQL and filesystem storage, including a loopback TCP proxy that drops a server-completed COMMIT response. It does not establish real S3-compatible storage integration or recognition quality. Production S3 configuration remains supported; verification against an operator-owned bucket is separate evidence.

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

## Selected reads and compact review commits

Selected session reads use a repeatable-read snapshot with independent artifact/review UUID cursors, default 50 and maximum 100 rows per collection. Complete owned counts and the latest result are included even when its artifact is outside the current page. Lists return at most 100 owned sessions. All timestamps are ISO strings. Images require current authority before storage access and again before delivery, with checked JPEG/PNG/WebP bytes, `no-store` and `nosniff`.

Experimental v1 changes in place: old database-shaped Scan rows and raw worker results become explicit JSON-safe session, artifact, result and review DTOs. Review requests now send `{requestId,sessionId,items:[{id?,scanArtifactId,catalogCardId,finish,condition,quantity}]}`. Display metadata, scores and identity supplied by clients are not write authority. Manual Catalog selection remains valid after `no_match`. The frontend retains an immutable attempted body and request ID for network retry, preserves failure drafts and refetches only current bounded selected state after success. A confirmed write retains its original acknowledgement while the separate selected-state read runs. If that read fails, the saved state remains confirmed and `Retry saved scan details` retries only the read. Read recovery merges saved review fields only when the submitted selection baseline is still current; later selections and unmounted session lifetimes cannot be overwritten. Workspace synchronization remains slice 9; native no-JavaScript Scan entry is not implemented.

New receipts use the `scan-intent-v3` fingerprint and return `{kind:'Committed',sessionId,acknowledgement}` containing the original compact Inventory acknowledgement. Scan persists selections, Inventory effects/revision, receipt and committed state atomically with lock order Profile/account, ScanSession, Inventory parent, sorted entries, then sorted groups. No full Inventory snapshot or unrelated position reflow occurs.

Historical v1 and `scan-v2` hashes/acknowledgements remain unchanged. To retry a non-null legacy hash, provide bounded `legacyVerification` with its exact original version and original submitted items; this evidence verifies the old hash and never authorizes new Inventory effects or re-resolves old metadata. Missing evidence returns 409 `LegacyReplayEvidenceRequired`; changed evidence returns the existing request conflict. A verified original acknowledgement returns `Committed` with the verified session and unchanged acknowledgement. If the original acknowledgement is null, the retry returns `{kind:'LegacyNoRepeat',requestId,binding:'VerifiedLegacyHash',acknowledgement}`. Null legacy hashes return the same union with `UnverifiedLegacyHash`: they prevent another quantity effect but cannot establish payload/session equality. A null original acknowledgement retains the parent's exact compact legacy no-repeat acknowledgement. This response does not claim the requested session became committed. Replay always follows account locking and current authority revalidation, including after Catalog pruning or later Inventory changes.

## Data boundaries

Binary uploads live outside Postgres. Postgres stores account ownership, scan session state, artifact metadata, review entries, and mutation request IDs. Uploading an image never adds cards directly to inventory.

Development uses a shared named volume for local artifacts. Production can use an existing S3-compatible bucket. See [deployment](../operations/deployment.md) for configuration.

Recognition and capture work must preserve explicit review before inventory changes. [ADR-0003](../decisions/0003-pwa-first-mobile-and-server-side-scan.md) records the single-client decision; its proposed recognition pipeline is not current functionality.

## Proposed recognition pipeline

This proposal is not implemented. Retain the Python scan-worker boundary, PostgreSQL catalog, and explicit review transaction. Start with one presented card and a CPU baseline. Do not add an OCR package, model, vector extension, or another search service before testing representative labeled captures.

1. Read the authorized artifact and decode it with bounded dimensions and memory. Detect the card boundary, reject unusable captures, correct orientation and perspective, and save a real normalized crop. Measure blur and glare as capture-quality evidence, not identification confidence.
2. Read the name and bottom-line set, collector-number, and language clues. Preserve uncertain text and missing fields. Collector numbers are strings and can include letters or symbols. Account for older frames without modern identifiers, localized names, split cards, and separate faces.
3. Pass the extracted evidence to the application catalog layer for PostgreSQL lookup. Prefer consistent set, collector number, language, and name evidence. Otherwise retrieve a bounded name shortlist with the existing text and trigram search, then examine its printings. Keep distinct printing candidates instead of accepting the representative printing from canonical-card search. Catalog generation changes require revalidation of candidates before confirmation.
4. Show the image, candidate printings, and the evidence behind each suggestion. Keep manual correction and recapture available. Conflicting identifiers or indistinguishable reprints require review; a high text score alone cannot resolve them.
5. Ask the user to confirm the printing, quantity, finish, and condition. Use the existing account-scoped, idempotent review commit to update inventory. Recognition never authorizes that transaction by itself.

Keep candidate lookup in the application's catalog layer so the worker does not need write access to accounts or inventory. Wiring OCR evidence into that lookup requires a new internal contract; today's worker and external-result endpoints do not implement this pipeline. If measured processing exceeds the current request timeout, add a durable job lifecycle before supporting longer work. The [system overview](./system-overview.md) owns runtime boundaries and operating constraints.

## Proposed visual matching

Evaluate the following methods in order, retaining a more complex method only when it fixes measured failures:

| Method                                      | Useful evidence                                                                         | Limit                                                                                                                            |
| ------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| OCR plus catalog fields                     | Names and printing identifiers can distinguish reprints with the same artwork.          | Small text, glare, unusual frames, languages, and missing identifiers can prevent a match.                                       |
| Perceptual hash or aligned image comparison | A normalized full-card or artwork crop can cheaply rank a shortlist.                    | Crop, rotation, sleeves, and lighting affect similarity. Shared artwork cannot establish the printing.                           |
| Learned image embeddings                    | A tested model may retrieve useful candidates when text or simple image matching fails. | Requires model evaluation, reference-image processing, memory, and versioned retrieval data. Similarity does not prove identity. |

[OpenCV's transform API](https://github.com/opencv/opencv/blob/4.x/modules/imgproc/include/opencv2/imgproc.hpp) provides perspective transforms. Its [perceptual hash implementation](https://github.com/opencv/opencv_contrib/blob/4.x/modules/img_hash/include/opencv2/img_hash/phash.hpp) is one candidate for the second baseline. [Tesseract's image-quality guidance](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html) explains preprocessing and region-specific segmentation; [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) is another OCR candidate to evaluate. These references establish available tools, not recognition accuracy on MTG cards or a selected dependency.

Reference hashes or embeddings would derive from catalog imagery and be keyed by printing, face, source-image digest, and model or preprocessing version. These are visual recognition features, separate from the catalog's text and trigram indexes. They must publish consistently with the catalog generation. Scryfall's [card fields](https://scryfall.com/docs/api/cards) distinguish printing IDs, language, collector numbers, and artwork IDs shared across reprints. Image availability and shared artwork remain retrieval limits.

If an embedding baseline materially improves recognition and exact comparison becomes too slow, evaluate [pgvector](https://github.com/pgvector/pgvector) inside the existing PostgreSQL deployment. Start with exact nearest-neighbor retrieval; add an approximate index only after measuring recall, latency, and memory with the real filters. pgvector, embeddings, and visual reference indexes are not installed. No separate vector service is proposed.

## Proposed owned-card indexing

The global catalog contains public printing reference data. An inventory entry records one account's quantity, finish, and condition for a printing. The [domain model](../../GLOSSARY.md) owns these definitions; an individual physical copy currently has no persistent identifier.

For server-side owned search, filter inventory by the authenticated account and join its printing IDs to the active PostgreSQL catalog generation. Apply catalog text and printing filters there, together with owned quantity, finish, and condition filters. Reuse existing indexes first and inspect representative query plans before adding indexes. Never copy private quantities, notes, images, or ownership markers into the global catalog or create a separate search document for each owned copy.

Catalog publication does not remove owned entries. Current bounded Inventory search filters stored entry metadata in SQL and uses the active catalog only for set metadata/progress. Rich catalog-field joined owned search remains proposed. Candidate retrieval searches global printings, since an import may identify a card the account does not yet own.

Catalog identity and image similarity cannot distinguish two physical copies of the same printing. Deduplicating by printing ID would incorrectly discard a second legitimate copy; treating every photograph as a copy would double-count recaptures. Proposed capture or event identifiers prevent software replay, while a later physical-card cycle or copy record must establish whether the card itself is new. The current candidate endpoint's missing stale-result and event protocol remains a separate follow-up, as described above. A single ordinary capture does not reliably establish foil treatment or condition. Keep those fields under user confirmation; do not infer them from a printing's available finishes.

## Recognition evaluation and device limits

Before choosing a package or model, label captures from the intended cameras and cards. Include sleeves, glare, blur, rotation, alternate frames, shared-art reprints, multiple languages, double-faced cards, unreadable text, and cards absent from the catalog. Split evaluation by physical copy and capture session so near-duplicate photographs cannot inflate the result.

Measure exact-printing top-one accuracy, shortlist recall, false matches on unknown cards, rejection and correction rates, and end-to-end latency. Record preprocessing, inference, retrieval, peak RAM, and GPU memory separately. Choose confidence thresholds from held-out data and the cost of a wrong printing; scores from different methods are not interchangeable probabilities.

A Jetson remains an optional capture or recognition host. [NVIDIA's Jetson PyTorch installation guide](https://docs.nvidia.com/deeplearning/frameworks/install-pytorch-jetson-platform/index.html) ties its wheels to specified JetPack releases. Verify the exact board, ARM64 packages, Python version, CUDA and runtime versions, model operators, and memory on that board. The current server Python runtime does not establish compatibility with an OCR or GPU package. A device can submit captures to the server while local inference remains unproven.

The [card robot proposal](../integrations/card-robot.md) owns physical jobs, movement events, and recovery. Recognition can select candidates only for the stack actually fed into the device. Sorting already owned cards must not import them again, and repeated images of one held card must not count as additional copies. Inventory elsewhere does not establish physical access. Tray placement, copy tracking, and deck assignment require their own confirmed device outcomes and future persistence.

External recognition sources above were reviewed on 2026-10-03. No OCR accuracy, embedding advantage, Jetson compatibility, or robot throughput has been measured for Spellbook.

## Primary Deck entry category HTTP contract

Authenticated `GET /api/mobile/v1/mtg/decks/{deckId}/categories` reads the JSON-safe adopted bundle, decisions and safe source status without mutation. `POST /decks/{deckId}/categories/initialize` accepts only `{requestId}` and returns the original compact initialization acknowledgement. `PATCH /deck-cards/{entryId}/category` accepts only `{deckId, categoryId: UUID|null, expectedDecisionRevision, requestId}` and records Manual provenance. Ownership comes from the trusted actor; missing/foreign Deck, entry and definition identities return the same 404. Unknown fields fail 400, stale decisions return 409 with current saved state and conflicting request intent returns 409.

`POST /decks/{deckId}/categories/merge-preview` accepts `{entryId, catalogCardId, role, quantity}` and returns destination/source decision consequences and a revision-bound token. Existing move/replace operations and scalar entry PATCH accept optional `categoryPreview`. A conflicting merge without a current token returns 409 with a fresh preview. Confirmation keeps the destination's complete decision; original Deck acknowledgements include compact category decision revisions/affected IDs. Category JSON bodies are bounded to 16 KiB; tokens are bounded to 12,000 characters. Cookie mutations preserve existing Origin validation and bearer behavior. Web initialization, native/enhanced Manual save and merge-confirmation forms call these same backend commands. [Category rules](./category-rules.md#implemented-starter-entry-decisions) owns source/evaluation lifecycle. Account editing, Review/Reset, whole-deck and combo operations remain planned.

## Reference price HTTP contract

Public `GET /api/mobile/v1/mtg/prices` requires one UUID `printingId` and `finish=nonfoil|foil`. This is an explicit public read exception under the otherwise authenticated integration prefix. No public POST batch exists without a caller need. Authenticated `POST /api/mobile/v1/mtg/inventory/prices` accepts only `entryIds`, 1 to 100 distinct UUIDs. Backend derives printing/finish/quantity from owned entries. Any missing/foreign entry produces a sanitized 404; invalid or extra fields, duplicate IDs and over-limit input produce 400. Cookie POST keeps the existing same-origin check; bearer authority remains session-produced.

Reads return 200 for evaluated Known/Unknown market results and 503 for operational read failures. Response-level evaluatedAt/publications are consistent across the batch. Coverage counts only requested owned quantities; stale is a subset of covered. [OpenAPI](../../frontend/src/routes/openapi.json/+server.ts) owns exact schemas and [value persistence](./value-and-costs.md#implemented-scryfall-references) owns observation eligibility. All responses are JSON-safe and no-store. Responses expose enabled optional providers and bounded public market history. Account totals and personal history remain planned.

Public `GET /api/mobile/v1/mtg/prices/history` accepts one printingId/finish, optional days 1 to 90 (default30) and repeated source filters (at most three distinct configured sources). It returns at most270 dated public points with actual time precision and immutable source/point digests, never private holdings. Invalid/extra queries return400; operational reads return503. Current reference responses include safe sourceStatuses and distinguish Instant sourceTime from Day sourceDate/asOf/freshnessPolicy. [Value persistence](./value-and-costs.md#optional-references-and-public-source-history) owns provider selection and history.
