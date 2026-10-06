# Routes and supported game

- Status: Canonical
- Last Reviewed: 2026-10-07
- Source of Truth: route handlers and server hooks
- Update Triggers: route additions or removals, development preview routes, HTTP methods, authentication protection, compatibility redirects, supported game
- Related Docs: [Product specification](./specification.md), [Authentication](../architecture/auth.md), [Mobile and scan](../architecture/mobile-and-scan.md), [Frontend architecture](../architecture/frontend.md), [Product index](./README.md)

Spellbook supports MTG. Game-specific pages use the `/mtg/` prefix. Public home, authentication, account settings, and legal pages remain shared; versioned integration endpoints keep their existing paths. The header game icon sits immediately before the theme control. It identifies Magic with the Mana Font planeswalker symbol and a tooltip. Cycling is inactive while MTG is the only available game. The `/mtg/` layout owns workspace game identity; the cookie retains the selection for shared pages. Unsupported cookie values reset to MTG. Additional games require their own catalog and workflow implementation before becoming selectable.

The [route source](../../frontend/src/routes/) owns implemented handlers. The [server hooks](../../frontend/src/hooks.server.ts) own page protection and redirects. `/openapi.json` exposes authentication, account and versioned MTG API contracts.

## Pages and account routes

| Route                         | Access and behavior                                                         |
| ----------------------------- | --------------------------------------------------------------------------- |
| `/`                           | Public landing for signed-out and signed-in users                           |
| `/mtg/dashboard`              | Authenticated account summaries and per-deck availability                   |
| `/mtg/search`                 | Public catalog search and printing details                                  |
| `/mtg/inventory`              | Authenticated bounded Inventory pages, GET filters and form actions         |
| `/mtg/scan`                   | Authenticated image upload, candidate review, and explicit inventory commit |
| `/mtg/decks`                  | Authenticated deck library; `?deck=ID` opens the editor and form actions    |
| `/mtg/decks/[deckId]/export`  | Authenticated text export of an owned deck                                  |
| `/settings`                   | Authenticated contact email and Edit avatar dialog; excluded from indexing  |
| `/settings/profile-card`      | Authenticated private card editor and artwork save; excluded from indexing  |
| `/settings/password`          | Authenticated current-password-confirmed change; disabled in demo mode      |
| `/auth/login`                 | Local sign-in page and form action                                          |
| `/auth/register`              | Local account registration page and form action                             |
| `/auth/logout`                | POST revokes the browser session and clears its cookie                      |
| `/privacy`, `/terms`          | Public information pages                                                    |
| `/api/auth/register`          | POST creates a local account and returns a bearer session                   |
| `/api/auth/login`             | POST verifies local credentials and returns a bearer session                |
| `/api/account/profile`        | Authenticated GET profile read and PATCH supplied preference/card fields    |
| `/api/account/dashboard`      | Authenticated GET account aggregates and deck availability summaries        |
| `/api/account/password`       | Authenticated POST password rotation and replacement session                |
| `/api/auth/session`           | Authenticated GET selected-session inspection                               |
| `/api/auth/logout`            | POST revokes the presented bearer session                                   |
| `/openapi.json`               | API description                                                             |
| `/llms.txt`                   | Public Markdown overview, application links, and agent registration rules   |
| `/agents.md`                  | Permanent same-origin redirect to `/llms.txt`                               |
| `/robots.txt`, `/sitemap.xml` | Search-engine metadata                                                      |

`GET /llms.txt` provides a public Markdown overview and links to the application and API, with instructions for creating a new account through the existing registration API. The shared HTML head links to it with `rel="describedby"`. Demo deployments instead state that registration is disabled. `/agents.md` returns HTTP 308 to `/llms.txt` without duplicating the guide. This guide does not implement the proposed auth.md protocol.

The font comparison and numbered landing prototype routes are removed. The `review=landing` composition override is removed; `/` is the landing review target for any session. The brand links to `/`. Normal primary Search clicks and Ctrl+K or Cmd+K open the shared catalog overlay above the current page. The landing form opens it with the submitted query. Search links retain `/mtg/search` for modified clicks and no-JavaScript navigation. The visible query URL supports direct visits and reloads as a full page; Full view replaces the overlay entry. Close, Escape and Back return to the background page, and Forward reopens Search. [Frontend architecture](../architecture/frontend.md) owns session, history and page composition. The first navigation item is Dashboard for signed-in users and Home for guests.

Signed-out access to protected pages redirects to `/auth/login` with the local path and query preserved. Login and registration default to `/mtg/inventory` when no safe destination is supplied. An explicit safe `returnTo`, including `/` or `/mtg/decks?deck=ID`, remains authoritative. Versioned MTG endpoints accept a bearer session or the authenticated browser session. An Authorization header takes precedence and an invalid bearer token fails without cookie fallback. Unsafe cookie-authenticated requests require same-origin protection. The [authentication document](../architecture/auth.md) owns credential and session rules.

There is no OIDC callback route, game-switching page, play route, public deck page, camera capture page, or offline workspace.

Public read-only browser endpoints are `GET` and `POST /api/catalog/search` and `GET /api/catalog/cards/{oracleId}/printings`. They use the same validated search and printing contracts as their versioned counterparts. Inventory and deck mutations remain authenticated.

## Versioned MTG API

All paths below begin with `/api/mobile/v1/mtg`. The historical `mobile` name does not restrict clients to mobile devices.

| Relative path                                              | Purpose                                                   |
| ---------------------------------------------------------- | --------------------------------------------------------- |
| `/search`                                                  | Catalog queries                                           |
| `/cards/[oracleId]/printings`                              | Printings for a canonical card                            |
| `/inventory`                                               | Account inventory                                         |
| `/inventory/batch-add`                                     | Batch additions                                           |
| `/inventory/bulk`                                          | Idempotent inventory mutations                            |
| `/inventory/import/preview`                                | Text import interpretation                                |
| `/inventory/import/commit`                                 | Resolved inventory import                                 |
| `/inventory/[entryId]`                                     | Owned entry GET and legacy mutation                       |
| `/decks`                                                   | Account deck list and creation                            |
| `/decks/[deckId]`                                          | Owned deck retrieval, metadata changes, and deletion      |
| `/decks/[deckId]/availability`                             | Owned deck availability counts without inventory mutation |
| `/decks/[deckId]/cards`                                    | Deck entries and additions                                |
| `/decks/[deckId]/cards/bulk`                               | Idempotent deck entry mutations                           |
| `/decks/[deckId]/export`                                   | Arena-style text export                                   |
| `/decks/import/preview`                                    | Deck text interpretation and warnings                     |
| `/decks/import/commit`                                     | Resolved deck import                                      |
| `/deck-cards/[entryId]`                                    | Deck entry mutation                                       |
| `/scan/sessions`                                           | Account scan session creation and latest-session listing  |
| `/scan/sessions/[sessionId]/frames`                        | Scan artifact submission                                  |
| `/scan/sessions/[sessionId]/result`                        | Candidate retrieval                                       |
| `/scan/sessions/[sessionId]/artifacts/[artifactId]/result` | Catalog-validated external candidate-result replacement   |
| `/scan/artifacts/[artifactId]/image`                       | Owned original image retrieval                            |
| `/scan/review/commit`                                      | Explicit inventory commit of reviewed candidates          |

`GET /inventory/[entryId]/location` locates an owned entry within a normalized query at an expected revision. [The Inventory HTTP contract](../architecture/mobile-and-scan.md#bounded-inventory-http-reads) records the experimental v1 snapshot-to-page migration and errors.

The [product specification](./specification.md) owns import semantics and scan limitations. Refer to the OpenAPI contract for methods, request bodies, response schemas, and error responses rather than inferring them from this route list.

## Compatibility redirects

Legacy flat paths `/search`, `/inventory`, `/decks`, and `/scan`, including child paths, return HTTP 308 to the same path under `/mtg`. Query strings and request methods are preserved. `/collections` and `/collections/` redirect to `/mtg/inventory`. `/mtg` and `/mtg/` redirect to `/mtg/search`.

Redirects run before the destination authentication guard. Other game prefixes have no routes until their catalog and workflows are implemented. [ADR-0013](../decisions/0013-game-prefixed-workspaces.md) records this change.
