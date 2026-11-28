# Independent applications implementation contract

- Status: Independent Python API and workers implemented; Expo mobile app planned
- Last Reviewed: 2026-11-28
- Source of Truth: accepted maintainer direction and existing application contracts
- Update Triggers:
  - Mobile client ownership, API contract and acceptance
  - managed Category removal
  - native global search read and shared DTO
  - raw Web header multiplicity and native boolean queries
  - native FastAPI HTTP contract and pre-release receipt scope
  - ADR-0029 immediate removal of replaced API interfaces
  - versioned MTG routes and module ownership
  - canonical-only versioned game API and client upgrades
  - Python source activation and implementation status
  - Python API/worker language selection and migration planning
  - independent API/web ownership and relocated code references
  - HTTP extraction
  - native delivery
  - credential forwarding
  - application ownership
  - acceptance evidence
- Related Docs:
  - [System overview](./system-overview.md)
  - [Application contract](./application-contract.md)
  - [Auth](./auth.md)
  - [Mobile handoff](../product/mobile-app-exploration.md)
  - [ADR-0031](../decisions/0031-expo-mobile-app-replacing-kotlin-android.md)
  - [ADR-0024](../decisions/0024-independent-applications.md)
  - [Verification](../operations/github-automation.md)
  - [Backend language evaluation](../integrations/backend-language-evaluation.md)
  - [Python direction](../decisions/0025-python-api-and-workers.md)

## Outcome and ownership

Retain `frontend/`, `backend/` and `contracts/`, with independent Catalog and Scan packages under
`backend/workers/`. SvelteKit owns rendering, native form actions and browser presentation. The
Python API owns credential authentication, PostgreSQL, application use cases, transient Scan
processing and SavedState lifetime. The independent Python State process owns the ValueHistory
scheduler. The planned mobile app owns native navigation, presentation, credentials and bounded
local state. Contracts contain serialized DTOs and pure shared validation/presentation helpers only.
No web runtime may import backend implementation, PostgreSQL, Drizzle or password hashing.

The unmerged integration candidate uses Python API/Core and workers by default.
[ADR-0027](../decisions/0027-python-functional-migration-acceptance.md) owns functional acceptance
and separate production authority. The [migration contract](./python-backend-migration.md) owns the
pre-release policy, current-version correctness and remaining runtime evidence. The replaced
TypeScript server is removed; Python functional tests and installed-Python HTTP consumers own
current coverage. Frontend, contracts and unchanged SQL/Demo assets retain their owners. A new
monorepo orchestrator, hardware control and a complex offline write queue remain outside its scope.
SvelteKit continues to deliver the PWA.

## HTTP module interface

### Selected versioned game API

[ADR-0028](../decisions/0028-versioned-game-api.md) selects versioned game routes in PR 276.
[ADR-0029](../decisions/0029-remove-replaced-interfaces.md) removes replaced interfaces immediately
and requires older clients to update. Canonical routes use `/api/v1/auth/...`, `/api/v1/account/...`
and `/api/v1/mtg/...`. The latter owns Catalog search/printing reads under `/catalog`, Inventory,
Decks, Valuation, Scan, Dashboard and the nine closed mutation commands under `/commands`. Raw-form
bridges use `/api/v1/web/auth/login`, `/api/v1/web/auth/register` and `/api/v1/web/password`. Page
paths remain `/mtg/...`, `/auth/...` and `/settings/...`.

MTG-owned HTTP and Core modules live in `spellbook_api.http.mtg` and `spellbook_core.mtg`. The
factories declare only canonical paths, with no legacy dispatch or path translation. Internal
consumers use the new Python modules without legacy re-export shims. Common identity/authentication,
database, transport and process lifetime retain their shared owners. The shared Profile interface
and response retain their existing body. `spellbook_core.mtg.profile` explicitly owns Profile-card
validation, presentation and MTG totals; shared `spellbook_core.profile` owns identity preferences
and atomic updates. MTG printing DTOs and mutation conflicts belong to `spellbook_core.mtg.models`
and `.errors`. There is no new game registry, generic filter framework, common all-game card schema
or implemented second TCG.

Public Catalog reads remain public; private mutations and reads retain their authentication and
account scope. Old API paths return 404 without aliases or redirects. Web and future mobile clients
use canonical paths. OpenAPI owns the current route inventory; the obsolete legacy route inventory
and transfer map are removed. Current-route tests cover native dispatch, last-value scalar queries,
bodies, 405 method rejection, cache/Origin policy, QR cookies and SSE. Native route checks reject
extra operations and representative removed paths return 404. Current-head production-app HTTP
acceptance remains an integration-owner check.

`backend/api/src/spellbook_api/http/types.py` owns `Configuration` and `ApplicationLifetime`.
`create_application(configuration)` returns the HTTP app, pre-drain `close_streams` and idempotent
`close` callbacks. `create_http_application` composes explicitly supplied Auth, Catalog, Inventory,
Deck, Scan, Valuation, Profile, Dashboard and SavedState dependencies. The route factories return
native `APIRouter` instances with `{parameter}` segments. `http/application.py` includes Valuation
before Inventory so `/inventory/value` and `/inventory/value-history` precede
`/inventory/{entryId}`. Literal routes precede parameter routes within each router. FastAPI owns
routing, method selection and dependency execution; no custom route registry, catch-all or OpenAPI
dispatch remains. Typed Path/Query parameters and Pydantic-backed body dependencies validate
transport inputs. Body dependencies authenticate before reading; credential dependencies count
attempts before form decoding, and Scan checks upload authority before Multipart parsing.
Declarative Body/Form/File parameters are avoided where FastAPI would read the body before those
guards. `http/policy.py` owns finite request admission, the 12 MiB host cap, response policy,
ordered cookie cleanup and ordinary-request disconnect settlement. `http/parsing.py` retains bounded
reads and the explicit smaller JSON limits; Starlette/python-multipart owns forms with a small
completion/cleanup guard. Global handlers in `http/errors.py` produce safe 400 validation errors,
retain known conflict fields and headers, and hide unexpected 500 details. Native JSON responses and
Uvicorn/h11 replace Node-specific parsing, number rendering and method emulation. Canonical paths
have no trailing slash, aliases or redirects; HEAD and OPTIONS return native 405 without opening an
SSE subscription. Native scalar queries select the last value; declared lists retain all values and
endpoint-specific duplicate rejection remains explicit. Deck `selectedOnly` uses native Boolean
parsing; invalid values return 400 instead of falling back to false. Application methods, SQL and
the current-version receipt fingerprint serializer remain in Core. Core imports neither HTTP nor a
client framework; workers import Core without importing API. The native Python boundary checker
enforces those directions. Frontend requests use the remote application and carry no serialized
actor or database handle.

Canonical reads include `GET /api/v1/mtg/catalog/printings/{printingId}`.
`POST /api/v1/mtg/commands` accepts exactly the nine typed intents in `contracts/src/web.ts`. Its
strict Pydantic command models reject unknown keys and authority fields, preserve absent optional
fields, limit JSON to 1 MiB and call the original use case with the original source and request ID.
Results are the existing DTO directly. Domain validators, fingerprints and transactions remain
backend-owned.

Web commands return the existing safe structured error fields. The frontend remote decoder
reconstructs frontend-local error classes or updates all relevant predicates coherently. Notes,
Quantity, Description and merge conflicts must retain their latest values and revision tokens.
Unexpected infrastructure failures remain generic 500 responses. No generic RPC, serialized actor
authority, SQL details or new global response envelope is introduced.

The command failure codec uses the current REST error body, with protected `status`, `message` and
optional `kind`. The serializer derives `status` from the HTTP error, overriding any conflicting
body field. At 409, `NotesConflict` carries flat `entryId`, `notes`, `notesRevision`; the remote
decoder reconstructs `.latest` from those fields. `QuantityChanged` carries `latestQuantity`,
including null. `DescriptionConflict` carries flat `description`, `descriptionRevision`,
reconstructed as `.latest`. Other known failures retain their existing kind, status and safe
message. The core HTTP owner implements serialization; the web owner implements and tests the
matching decoder. Optional fields are not silently filled.

## Authority and compatibility

The API revalidates credentials into the backend's trusted actor for every request. Mobile/API
routes preserve bearer-before-cookie selection, including no cookie fallback after an invalid
Authorization header. The shared Web hook rejects repeated Authorization, Origin and Content-Type
lines using adapter-node's original `platform.req.rawHeaders`, before proxy, session or form-action
work. It returns a safe 400 with no-store and noindex headers because normalized Fetch headers can
join or discard those duplicates. The closed web command endpoint retains this direct API credential
selection; SSR/forms forward only the selected browser cookie. SSR and form actions select only the
browser cookie identity, even if a page request also supplies a bearer header. Cookie mutations
retain Origin protection. The public `APP_ORIGIN` governs QR URLs, Origin and secure cookies;
`API_INTERNAL_URL` only selects the private HTTP destination. Client addresses come from the socket
or explicitly configured trusted proxies. Arbitrary forwarded headers never establish rate-limit
identity.

Browser QR requester secrets and redeemed session tokens remain HttpOnly cookies. Device credentials
remain device-only response data. Preserve separate Set-Cookie headers, one-use redemption,
original-session binding, approval marker binding, password rotation and revoked-session behavior.
Preserve native and enhanced form results, unpublished drafts, explicit conflict recovery and
request IDs after ambiguous transport failures. A successful mutation is not retried because a later
reload fails.

After password rotation, the web action sets the replacement cookie and replaces the remote
adapter's request-bound credential before any subsequent load in the same lifecycle. The revoked old
token must not authenticate that load.

Three explicit web-form intents preserve rate limits before form decoding:
`POST /api/v1/web/auth/login`, `POST /api/v1/web/auth/register` and `POST /api/v1/web/password`. Web
streams the original form body/content type, selected cookie, public Origin and trusted client
address. API bounds and decodes FormData, owns validation and takes the original auth attempt
exactly once before decoding. These routes require the public Origin. Login/register return the
existing JSON authentication DTO or original safe 400 form fields. Web retains native/enhanced
results, old-cookie revocation and redirect. Password authenticates first, rejects Demo before
taking an attempt, then validates current/new/confirmation with the original messages; mismatched
confirmation never mutates. It returns 400 `{success:false,message,errors}`, or 200
`{success:true,token,expiresAt}` with replacement cookie only in cookie mode. Web retains success
presentation and rotates its bound credential. Optional `demoMode` in HTTP dependencies/options is
supplied by the API host. Existing JSON/mobile auth endpoints are unchanged. These concrete form
intents are separate from the nine closed mutation commands. The API, web adapter and OpenAPI
implement this contract. The routes preserve invalid-field and malformed-form throttling without a
second limiter or an authority-bypassing header.

The Python host owns startup and graceful shutdown. It aborts disconnected requests, respects stream
backpressure, closes SSE before waiting for HTTP connections, then closes application resources. SSE
keeps per-account session revalidation, bounded delivery, heartbeat, no-store and proxy buffering
protection. The web proxy forwards bodies and SSE without buffering. Malformed path encodings
rejected by SvelteKit before proxy dispatch use its native 400 response; well-formed API requests
retain API response bodies and policy. API schema/OpenAPI and migrations belong to backend;
migration SQL, journal and snapshots retain their history.

## Mobile delivery

[ADR-0031](../decisions/0031-expo-mobile-app-replacing-kotlin-android.md) selects Expo and React
Native for a single iOS and Android application in `apps/mobile/`. The mobile MVP is tracked
separately in [issue #461](https://github.com/KyleDerZweite/spellbook/issues/461). The app uses the
existing [OpenAPI contract](../../contracts/openapi.json).

The mobile app owns native navigation, presentation, secure session storage and bounded local state.
Keep private state and drafts scoped by backend and account. Honor session expiry and clear private
state on logout or session invalidation. The initial design is online-first, with explicit
user-confirmed mutations and no automatic mutation replay. Verify auth, account isolation, and real
API journeys on the target devices when the MVP ships.

Cardstation registry, device control and local recognition remain separate product slices.

## Delivery and acceptance

PR 243 was merged into PR 231, then PR 231 into main at `728703f391bc7d573819ce21ade621d97588b62b`.
Implement on that base using isolated writer worktrees and a shared local integration branch.
Publish the verified integrated result to main as requested, without deploying a service.

[Issue 244](https://github.com/KyleDerZweite/spellbook/issues/244) tracks implementation and final
integration evidence. Canonical OpenAPI contains 86 API method/path pairs and seven unchanged
browser-auth methods; Discovery is served separately. Tests compare the complete current registry
with OpenAPI, deriving operation sets instead of maintaining a second route inventory. Counts do not
establish functional correctness.

Before integration, independently review this contract against the actual callers. Writers verify
checkout, branch, base, local changes and owned resources. The HTTP core, domain routes, web cutover
and packaging each have one owner. Integrate their commits sequentially. Independent final review
checks both standards and this contract against the fixed base and current artifact.

Acceptance requires independent API and web builds, enforced import rules, real PostgreSQL and HTTP
checks, direct API and same-origin proxy parity, auth/QR/password failures, preserved receipts and
text conflicts, two-process SavedState and actual scan-worker compatibility. Run the existing
repository checks adapted to separate processes. Exercise rendered web SSR/native/enhanced journeys.
API registry, raw forms, OpenAPI, web remote adapter, packaging, backend migration/fixture
ownership, migrated tests and explicit MTG modules are implemented and reviewed. Exact revisions,
review findings and current-head checks belong to PR 276. Independent review identified and verified
fixes for QR replacement-cookie ordering, HTTP error/status parity, upload-limit propagation,
bounded native streaming and stale account callbacks.
[Repository verification](../operations/github-automation.md) records checks and their limits.
Mobile acceptance belongs to the Expo delivery.
