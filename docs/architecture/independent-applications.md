# Independent applications implementation contract

- Status: Implemented first slice, native target verification pending
- Last Reviewed: 2026-10-20
- Source of Truth: accepted maintainer direction and existing application contracts
- Update Triggers: Python API/worker language selection and migration planning, independent API/web ownership and relocated code references, HTTP extraction, native delivery, credential forwarding, application ownership, acceptance evidence
- Related Docs: [System overview](./system-overview.md), [Application contract](./application-contract.md), [Auth](./auth.md), [Mobile handoff](../product/mobile-app-exploration.md), [ADR-0024](../decisions/0024-independent-applications.md), [Verification](../operations/github-automation.md), [Backend language evaluation](../integrations/backend-language-evaluation.md), [Python direction](../decisions/0025-python-api-and-workers.md)

## Outcome and ownership

Retain `frontend/`, `backend/` and `contracts/`, with independent Catalog and Scan packages under `backend/workers/`.
Add the independent Gradle project `android/`.
SvelteKit owns rendering, native form actions and browser presentation.
The Node API owns credential authentication, PostgreSQL, application use cases, Scan storage, runners and SavedState lifetime.
Android owns native navigation, presentation, credentials and bounded local state.
Contracts contain serialized DTOs and pure shared validation/presentation helpers only.
No web runtime may import backend implementation, PostgreSQL, Drizzle or password hashing.

The existing TypeScript backend remains the implemented baseline.
[ADR-0025](../decisions/0025-python-api-and-workers.md) selects Python for the future API and server workers, with server code grouped under `backend/`.
[Issue 211](https://github.com/KyleDerZweite/spellbook/issues/211) records framework, contract and migration planning.
The [accepted Python migration contract](./python-backend-migration.md) owns that design and its independent review; this document continues to describe the implemented extraction.
This language direction does not implement a rewrite or worker move or change the extraction's application responsibilities.
A new monorepo orchestrator, hardware control and a complex offline write queue remain outside its scope.
Existing PWA compatibility remains available, but it is not the Android application.

## HTTP module interface

`backend/src/http/types.ts` owns `HttpDependencies`, `RouteContext`, `HttpRoute` and `HttpApplication`.
`createHttpApplication(application, {publicOrigin})` supplies `handle(Request, {clientAddress})` and `closeStreams()`.
Route factories accept `HttpDependencies` and return `HttpRoute[]`, with colon-prefixed named path segments.
Factories are `createAuthRoutes`, `createAccountRoutes`, `createSavedStateRoutes`, `createCatalogRoutes`, `createInventoryRoutes`, `createValuationRoutes`, `createScanRoutes`, `createDeckRoutes`, `createCategoryRoutes` and `createWebRoutes`.
The parent integrates their registry sequentially.

Shared helpers retain the current parser signatures in `http/request.ts`.
`http/errors.ts` exports `error(status, body): never`, `json(value, init?)`, and `badRequestIfValidation(cause, fallback?): never`.
The latter preserves existing structured public failures.
`http/auth.ts` exports `requireMobileAuth(context, dependencies)`, returning the authenticated user as `{user}`.
Domain handlers use these helpers rather than SvelteKit imports or simulated framework events.
Dependencies live in factory closures.
Request context has no application, locals, cookie framework or generic method invocation.

All 82 existing explicit API methods retain paths, payloads, status, cache policy and error details.
Add `GET /api/catalog/printings/:printingId` and owned `GET /api/mobile/v1/mtg/category-definitions/:originId` for existing web reads.
`POST /api/web/v1/commands` accepts exactly the nine typed intents in `contracts/src/web.ts`.
Its strict object parser rejects unknown keys and authority fields, preserves absent optional fields, limits JSON to 1 MiB and calls the original use case with the original source and request ID.
Results are the existing DTO directly.
Domain validators, fingerprints and transactions remain backend-owned.

Web commands return the existing safe structured error fields.
The frontend remote decoder reconstructs frontend-local error classes or updates all relevant predicates coherently.
Notes, Quantity, Description, Category and merge conflicts must retain their latest values and revision tokens.
Unexpected infrastructure failures remain generic 500 responses.
No generic RPC, serialized actor authority, SQL details or new global response envelope is introduced.

The command failure codec uses the current REST error body, with protected `status`, `message` and optional `kind`.
The serializer derives `status` from the HTTP error, overriding any conflicting body field.
At 409, `NotesConflict` carries flat `entryId`, `notes`, `notesRevision`; the remote decoder reconstructs `.latest` from those fields.
`QuantityChanged` carries `latestQuantity`, including null.
`DescriptionConflict` carries flat `description`, `descriptionRevision`, reconstructed as `.latest`.
`CategoryConflict` carries `latest`; `CategoryMergeConflict` carries `preview`.
Other known failures retain their existing kind, status and safe message.
The core HTTP owner implements serialization; the web owner implements and tests the matching decoder.
Optional fields are not silently filled.

## Authority and compatibility

The API revalidates credentials into the backend's trusted actor for every request.
API routes preserve bearer-before-cookie selection, including no cookie fallback after an invalid Authorization header.
SSR and form actions select only the browser cookie identity, even if a page request also supplies a bearer header.
Cookie mutations retain Origin protection.
The public `APP_ORIGIN` governs QR URLs, Origin and secure cookies; `API_INTERNAL_URL` only selects the private HTTP destination.
Client addresses come from the socket or explicitly configured trusted proxies.
Arbitrary forwarded headers never establish rate-limit identity.

Browser QR requester secrets and redeemed session tokens remain HttpOnly cookies.
Device credentials remain device-only response data.
Preserve separate Set-Cookie headers, one-use redemption, original-session binding, approval marker binding, password rotation and revoked-session behavior.
Preserve native and enhanced form results, unpublished drafts, explicit conflict recovery and request IDs after ambiguous transport failures.
A successful mutation is not retried because a later reload fails.

After password rotation, the web action sets the replacement cookie and replaces the remote adapter's request-bound credential before any subsequent load in the same lifecycle.
The revoked old token must not authenticate that load.

Three explicit web-form intents preserve rate limits before form decoding: `POST /api/web/v1/auth/login`, `POST /api/web/v1/auth/register` and `POST /api/web/v1/password`.
Web streams the original form body/content type, selected cookie, public Origin and trusted client address.
API bounds and decodes FormData, owns validation and takes the original auth attempt exactly once before decoding.
These routes require the public Origin.
Login/register return the existing JSON authentication DTO or original safe 400 form fields.
Web retains native/enhanced results, old-cookie revocation and redirect.
Password authenticates first, rejects Demo before taking an attempt, then validates current/new/confirmation with the original messages; mismatched confirmation never mutates.
It returns 400 `{success:false,message,errors}`, or 200 `{success:true,token,expiresAt}` with replacement cookie only in cookie mode.
Web retains success presentation and rotates its bound credential.
Optional `demoMode` in HTTP dependencies/options is supplied by the API host.
Existing JSON/mobile auth endpoints are unchanged.
These concrete form intents are separate from the nine closed mutation commands.
The API, web adapter and OpenAPI implement this contract.
The routes preserve invalid-field and malformed-form throttling without a second limiter or an authority-bypassing header.

The Node host owns startup and graceful shutdown.
It aborts disconnected requests, respects stream backpressure, closes SSE before waiting for HTTP connections, then closes application resources.
SSE keeps per-account session revalidation, bounded delivery, heartbeat, no-store and proxy buffering protection.
The web proxy forwards bodies and SSE without buffering.
API schema/OpenAPI and migrations belong to backend; migration SQL, journal and snapshots retain their history.

## Android delivery

Use Kotlin and Jetpack Compose, Navigation3, ViewModel/StateFlow and Ktor in one app module with feature packages.
Pin a compatible stable toolchain, using SDK 37, AGP 9.1.1, Gradle 9.6.1, Kotlin 2.4.21 and the verified modern AndroidX versions.
Document each dependency's purpose.
Production uses HTTPS.
Debug loopback access is isolated through adb reverse, without opening LAN ports or changing firewall rules.

Pin Compose BOM `2026.09.00`, Navigation3 `1.2.0`, Lifecycle `2.11.0`, Activity `1.13.0` and Ktor `3.6.0`.
Use AGP built-in Kotlin with KGP upgraded to `2.4.21`, without applying `kotlin.android`.
Restrict debug cleartext policy to loopback.

Implement the accepted compact Home, Search, Inventory and Deck navigation, colored icons, Settings, login/register and contextual return.
Public Search and Printing detail work as a guest.
Authenticated Home, bounded Inventory and Boxes, entry detail, Deck library, selected Deck and availability read actual API data.
Implement the explicit Inventory add journey through the small plus action, preserving a guest draft through sign-in and using an explicit user-confirmed mutation.
State distinguishes loading, empty, unavailable and retry.
Store session credentials encrypted with an Android Keystore key, scope private state by account, clear it on account changes, and retain only bounded permitted reads and drafts.
No automatic mutation replay queue.

Namespace private state and drafts by backend and account.
Cancel old requests and SSE on changes.
Honor no-store, fixed session expiry and the absence of refresh tokens.
An ambiguous save can retry only the frozen body and original request ID.
Native acceptance includes guest draft through login to explicit Save, lost-response retry, saved-but-reload-failed feedback, account isolation, system Back and keyboard behavior, and real website-to-app SSE refresh.

Card Station uses its accepted name and planned circular eight-box layout.
Until registry, job, telemetry and physical allocation contracts exist, its view must state that no device connection is available.
Camera recognition and device control must not show fabricated successful results.
These capabilities remain future product slices, not silently completed by this restructuring.

## Delivery and acceptance

PR 243 was merged into PR 231, then PR 231 into main at `728703f391bc7d573819ce21ade621d97588b62b`.
Implement on that base using isolated writer worktrees and a shared local integration branch.
Publish the verified integrated result to main as requested, without deploying a service.

[Issue 244](https://github.com/KyleDerZweite/spellbook/issues/244) tracks implementation and final integration evidence.
The accepted inventory is 88 API method/path pairs: the original 82, two reads, one endpoint with nine closed command intents and three raw-form routes.
The accepted OpenAPI inventory is 95 method/path pairs including seven browser-auth methods.
Counts do not establish verified compatibility.

Before integration, independently review this contract against the actual callers.
Writers verify checkout, branch, base, local changes and owned resources.
The HTTP core, domain routes, web cutover, packaging and Android each have one owner.
Integrate their commits sequentially.
Independent final review checks both standards and this contract against the fixed base and current artifact.

Acceptance requires independent API and web builds, enforced import rules, real PostgreSQL and HTTP checks, direct API and same-origin proxy parity, auth/QR/password failures, preserved receipts and text conflicts, two-process SavedState and actual scan-worker compatibility.
Run the existing repository checks adapted to separate processes.
Exercise rendered web SSR/native/enhanced journeys.
Build and install Android on the existing task-owned emulator, run guest Search and authenticated Inventory add against the real API, and inspect native rendering and recovery.
Record exact revision, commands, failures and unavailable evidence.
Emulator evidence does not establish Honor hardware, camera recognition, production deployment or owner acceptance.

As of 2026-10-19, API registry, raw forms, OpenAPI, web remote adapter, packaging, backend migration/fixture ownership, migrated tests and the first native Android slice are integrated.
Independent review identified and verified fixes for QR replacement-cookie ordering, HTTP error/status parity, upload-limit propagation, bounded native streaming and stale account callbacks.
[Repository verification](../operations/github-automation.md) records checks and their limits.
The root-owned emulator attempt exited 139 before boot; no workaround was attempted per maintainer instruction.
Android installation, rendered native journeys, Keystore integration and website-to-app SSE remain unexecuted.
These require owner/device verification before native target acceptance.
No deployment or physical Honor/Card Station acceptance is claimed.
