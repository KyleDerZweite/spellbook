# Routes and supported game, paused Scan entrypoints

- Status: Canonical
- Last Reviewed: 2026-10-24
- Source of Truth: route handlers and server hooks
- Update Triggers: versioned MTG routes and module ownership, Python source activation and server contraction, independent API/web ownership and relocated code references, PWA launch/connect and QR approval/API routes, route additions or removals, development preview routes and native task queries, HTTP methods, authentication protection, compatibility redirects, supported game, paused Scan entrypoints, private Inventory history routes
- Related Docs: [Product specification](./specification.md), [Authentication](../architecture/auth.md), [Mobile and scan](../architecture/mobile-and-scan.md), [Frontend architecture](../architecture/frontend.md), [Catalog](../architecture/catalog.md), [Product index](./README.md)

Scan presentation is paused.
The existing `/mtg/scan` route and versioned Scan API are retained, but Navigation, Inventory and Dashboard do not link to Scan.
[Mobile and scan](../architecture/mobile-and-scan.md) owns retained capabilities and the later recognition scope.

Spellbook supports MTG.
Game-specific pages use the `/mtg/` prefix.
Public home, authentication, account settings, and legal pages remain shared; canonical API operations use the versioned shared and MTG namespaces selected by [ADR-0028](../decisions/0028-versioned-game-api.md).
Previous API paths remain direct compatibility aliases with their original access policies.
The header game icon sits immediately before the theme control.
It identifies Magic with the Mana Font planeswalker symbol and a tooltip.
Cycling is inactive while MTG is the only available game.
The `/mtg/` layout owns workspace game identity; the cookie retains the selection for shared pages.
Unsupported cookie values reset to MTG.
Additional games require their own catalog and workflow implementation before becoming selectable.

The [web routes](../../frontend/src/routes/) own pages and the same-origin API proxy.
The [backend route registry](../../backend/api/src/spellbook_api/http/application.py) owns API handlers; [server hooks](../../frontend/src/hooks.server.ts) own page protection and redirects.
`/openapi.json` exposes authentication, account and versioned MTG API contracts.

## Pages and account routes

| Route                                      | Access and behavior                                                               |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| `/`                                        | Public landing for signed-out and signed-in users                                 |
| `/mtg/history`                             | Authenticated personal Inventory value history and identity/date filters          |
| `/mtg/dashboard`                           | Authenticated account summaries and per-deck availability                         |
| `/mtg/search`                              | Public catalog search and printing details                                        |
| `/mtg/inventory/[entryId]`                 | Authenticated SSR owned-entry Notes/Groups/reviewed Remove forms                  |
| `/mtg/inventory`                           | Authenticated bounded Inventory pages, GET filters and form actions               |
| `/mtg/scan`                                | Authenticated image upload, candidate review, and explicit inventory commit       |
| `/mtg/categories`                          | Authenticated scoped reusable Category Library and native criteria editor         |
| `/mtg/decks`                               | Authenticated deck library; `deck=ID` selects the editor; native tasks use `flow` |
| `/mtg/decks/[deckId]/export`               | Authenticated text export of an owned deck                                        |
| `/settings`                                | Authenticated contact email and Edit avatar dialog; excluded from indexing        |
| `/settings/profile-card`                   | Authenticated private card editor and artwork save; excluded from indexing        |
| `/settings/password`                       | Authenticated current-password-confirmed change; disabled in demo mode            |
| `/auth/login`                              | Local password form; accepted delivery adds QR sign-in alongside it               |
| `/app`                                     | Accepted public PWA launch/install hub and existing account/workspace links       |
| `/app/connect`                             | Accepted authenticated camera/manual same-instance authorization QR scanner       |
| `/auth/approve`                            | Accepted authenticated explicit Approve/Deny page, selected by `code` query       |
| `/auth/register`                           | Local account registration page and form action                                   |
| `/auth/logout`                             | POST revokes the browser session and clears its cookie                            |
| `/privacy`, `/terms`                       | Public information pages                                                          |
| `/api/v1/auth/register`                    | POST creates a local account and returns a bearer session                         |
| `/api/v1/auth/login`                       | POST verifies local credentials and returns a bearer session                      |
| `/api/v1/auth/qr/requests`                 | POST creates a five-minute browser/device authorization request                   |
| `/api/v1/auth/qr/requests/[code]`          | Authenticated GET inspects public request status                                  |
| `/api/v1/auth/qr/requests/[code]/decision` | Authenticated POST explicitly approves or denies                                  |
| `/api/v1/auth/qr/token`                    | POST redeems with the private requester credential                                |
| `/api/v1/account/profile`                  | Authenticated GET profile read and PATCH supplied preference/card fields          |
| `/api/v1/mtg/dashboard`                    | Authenticated GET account aggregates and deck availability summaries              |
| `/api/v1/account/password`                 | Authenticated POST password rotation and replacement session                      |
| `/api/v1/account/events`                   | Authenticated GET SavedState event stream                                         |
| `/api/v1/auth/session`                     | Authenticated GET selected-session inspection                                     |
| `/api/v1/auth/logout`                      | POST revokes the presented bearer session                                         |
| `/openapi.json`                            | API description                                                                   |
| `/llms.txt`                                | Public Markdown overview, application links, and agent registration rules         |
| `/agents.md`                               | Permanent same-origin redirect to `/llms.txt`                                     |
| `/robots.txt`, `/sitemap.xml`              | Search-engine metadata                                                            |

The QR API is integrated.
The `/app`, `/app/connect`, `/auth/approve` and login presentation rows describe the accepted delivery; the PWA pages and navigation are implemented.
Target verification is recorded with the change.
[Frontend](../architecture/frontend.md#pwa-and-qr-presentation) owns presentation, and [Authentication](../architecture/auth.md#pwa-and-qr-sign-in-implementation-contract) owns the QR protocol.
All `/auth/*` and `/app*` page responses use `no-store` and `Referrer-Policy: no-referrer`.

`GET /llms.txt` provides a public Markdown overview and links to the application and API, with instructions for creating a new account through the existing registration API.
The shared HTML head links to it with `rel="describedby"`.
Demo deployments instead state that registration is disabled.
`/agents.md` returns HTTP 308 to `/llms.txt` without duplicating the guide.
This guide does not implement the proposed auth.md protocol.

The font comparison and numbered landing prototype routes are removed.
The `review=landing` composition override is removed; `/` is the landing review target for any session.
The brand links to `/`.
Normal primary Search clicks and Ctrl+K or Cmd+K open the shared catalog overlay above the current page.
The landing form opens it with the submitted query.
Search links retain `/mtg/search` for modified clicks and no-JavaScript navigation.
The visible query URL supports direct visits and reloads as a full page; Full view replaces the overlay entry.
Close, Escape and Back return to the background page, and Forward reopens Search.
[Frontend architecture](../architecture/frontend.md) owns session, history and page composition.
The first navigation item is Dashboard for signed-in users and Home for guests.

Public `/mtg/search` native GET state includes `q`, repeated supported filters, `pageSize`, one-based `page` and independent `printing` selection.
Numeric modes and native Lazy links read one bounded selected page.
[Catalog](../architecture/catalog.md#browser-result-window) owns limits and publication coherence.
The reusable native selected-printing panel remains a coordinated Card-stage integration.

The Deck page supports `flow=create|edit|import|delete|search` for native task entry.
[Frontend](../architecture/frontend.md#shared-deck-ui) owns the form adapters and shared presentation responsibilities.
These queries add no API path or method.

Category controls use `localCategory`, `preview` and `previewOffset` for pure native GET selection/paging.
Their POST actions delegate to the [Category owner](../architecture/category-rules.md#entry-reviewreset-transactions).

Signed-out access to protected pages redirects to `/auth/login` with the local path and query preserved.
Login and registration default to `/mtg/inventory` when no safe destination is supplied.
An explicit safe `returnTo`, including `/` or `/mtg/decks?deck=ID`, remains authoritative.
Versioned MTG endpoints accept a bearer session or the authenticated browser session.
An Authorization header takes precedence and an invalid bearer token fails without cookie fallback.
Unsafe cookie-authenticated requests require same-origin protection.
The [authentication document](../architecture/auth.md) owns credential and session rules.

There is no OIDC callback route, game-switching page, play route, public deck page, MTG card camera-capture page or offline workspace.
Authorization QR camera scanning belongs to `/app/connect`.
The public `offline.html` fallback contains no account workspace.

Public read-only browser endpoints are `GET` and `POST /api/v1/mtg/catalog/search`, `GET /api/v1/mtg/catalog/cards/{oracleId}/printings` and `GET /api/v1/mtg/catalog/printings/{printingId}`.
The legacy `/api/catalog/...` aliases use these same public handlers; legacy mobile Catalog aliases continue to require authentication.
Inventory and deck mutations remain authenticated.

## Web adapter API

`POST /api/v1/mtg/commands` accepts exactly the nine typed intents owned by [contracts/src/web.ts](../../contracts/src/web.ts).
It is a closed mutation adapter, with unchanged source, request-ID, receipt and conflict semantics.
`POST /api/v1/web/auth/login`, `/api/v1/web/auth/register` and `/api/v1/web/password` are the selected raw-form routes; the API takes the original auth attempt before decoding.
The [implementation contract](../architecture/independent-applications.md#authority-and-compatibility) owns their details.
The backend form and OpenAPI changes are implemented in the unmerged candidate; final integrated client/runtime verification remains pending.

## Versioned MTG API

All paths below begin with `/api/v1/mtg`.
Canonical Catalog reads are public; private MTG operations accept bearer or browser sessions.
The previous `/api/mobile/v1/mtg/...` aliases preserve their original access policies.

| Relative path                                              | Purpose                                                        |
| ---------------------------------------------------------- | -------------------------------------------------------------- |
| `/catalog/search`                                          | Catalog queries                                                |
| `/category-definitions/[originId]`                         | Authenticated read of one owned reusable definition            |
| `/catalog/cards/[oracleId]/printings`                      | Printings for a canonical card                                 |
| `/inventory/value`                                         | Authenticated current Inventory estimate and coverage          |
| `/inventory/value-history`                                 | Authenticated closed daily checkpoints and explicit gaps       |
| `/inventory`                                               | Account inventory                                              |
| `/inventory/batch-add`                                     | Batch additions                                                |
| `/inventory/bulk`                                          | Idempotent inventory mutations                                 |
| `/inventory/import/preview`                                | Text import interpretation                                     |
| `/inventory/import/commit`                                 | Resolved inventory import                                      |
| `/inventory/[entryId]`                                     | Owned entry GET and legacy mutation                            |
| `/decks`                                                   | Account deck list and creation                                 |
| `/decks/search`                                            | Authenticated Catalog search with bounded ownership aggregates |
| `/decks/ownership`                                         | Owned-printing aggregates for at most 100 canonical identities |
| `/decks/[deckId]`                                          | Owned deck retrieval, metadata changes, and deletion           |
| `/decks/[deckId]/availability`                             | Owned deck availability counts without inventory mutation      |
| `/category-definitions`                                    | Scoped definition pages and immutable version saves            |
| `/category-definitions/[originId]/archive`                 | Future-adoption archive or restore                             |
| `/decks/[deckId]/categories/[categoryId]`                  | Local label PATCH or all-role replacement/suppression DELETE   |
| `/decks/[deckId]/category-previews`                        | Entry Review/Reset POST with explicit restoration selections   |
| `/category-previews/[previewId]`                           | Stable paged consequences GET                                  |
| `/category-previews/[previewId]/commit`                    | Complete atomic reviewed commit POST                           |
| `/decks/[deckId]/cards`                                    | Deck entries and additions                                     |
| `/decks/[deckId]/cards/bulk`                               | Idempotent deck entry mutations                                |
| `/decks/[deckId]/export`                                   | Arena-style text export                                        |
| `/decks/import/preview`                                    | Deck text interpretation and warnings                          |
| `/decks/import/commit`                                     | Resolved deck import                                           |
| `/deck-cards/[entryId]`                                    | Deck entry mutation                                            |
| `/scan/sessions`                                           | Account scan session creation and latest-session listing       |
| `/scan/sessions/[sessionId]/frames`                        | Scan artifact submission                                       |
| `/scan/sessions/[sessionId]/result`                        | Candidate retrieval                                            |
| `/scan/sessions/[sessionId]/artifacts/[artifactId]/result` | Catalog-validated external candidate-result replacement        |
| `/scan/artifacts/[artifactId]/image`                       | Owned original image retrieval                                 |
| `/scan/review/commit`                                      | Explicit inventory commit of reviewed candidates               |

`GET /inventory/[entryId]/location` locates an owned entry within a normalized query at an expected revision.
[The Inventory HTTP contract](../architecture/mobile-and-scan.md#bounded-inventory-http-reads) records the experimental v1 snapshot-to-page migration and errors.

The [product specification](./specification.md) owns import semantics and scan limitations.
Refer to the OpenAPI contract for methods, request bodies, response schemas, and error responses rather than inferring them from this route list.

## Compatibility redirects

Legacy flat paths `/search`, `/inventory`, `/decks`, and `/scan`, including child paths, return HTTP 308 to the same path under `/mtg`.
Query strings and request methods are preserved.
`/collections` and `/collections/` redirect to `/mtg/inventory`.
`/mtg` and `/mtg/` redirect to `/mtg/search`.

Redirects run before the destination authentication guard.
Other game prefixes have no routes until their catalog and workflows are implemented.
[ADR-0013](../decisions/0013-game-prefixed-workspaces.md) records this change.
