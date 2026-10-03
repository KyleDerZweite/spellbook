# Routes and supported game

- Status: Canonical
- Last Reviewed: 2026-10-03
- Source of Truth: route handlers and server hooks
- Update Triggers: route additions or removals, HTTP methods, authentication protection, compatibility redirects, supported game
- Related Docs: [Product specification](./specification.md), [Authentication](../architecture/auth.md), [Mobile and scan](../architecture/mobile-and-scan.md), [Frontend architecture](../architecture/frontend.md), [Product index](./README.md)

Spellbook supports MTG. Pages use flat paths, and versioned integration endpoints retain the `mtg` segment. Existing game fields and the active-game cookie are compatibility details, not a commitment to additional games.

The [route source](../../frontend/src/routes/) owns implemented handlers. The [server hooks](../../frontend/src/hooks.server.ts) own page protection and redirects. `/openapi.json` exposes the versioned API description.

## Pages and account routes

| Route                         | Access and behavior                                                         |
| ----------------------------- | --------------------------------------------------------------------------- |
| `/`                           | Public entry page                                                           |
| `/search`                     | Authenticated catalog search                                                |
| `/inventory`                  | Authenticated inventory workspace and form actions                          |
| `/scan`                       | Authenticated image upload, candidate review, and explicit inventory commit |
| `/decks`                      | Authenticated deck workspace and form actions                               |
| `/decks/[deckId]/export`      | Authenticated text export of an owned deck                                  |
| `/auth/login`                 | Local sign-in page and form action                                          |
| `/auth/register`              | Local account registration page and form action                             |
| `/auth/logout`                | POST revokes the browser session and clears its cookie                      |
| `/privacy`, `/terms`          | Public information pages                                                    |
| `/api/auth/register`          | POST creates a local account and returns a bearer session                   |
| `/api/auth/login`             | POST verifies local credentials and returns a bearer session                |
| `/api/auth/logout`            | POST revokes the presented bearer session                                   |
| `/openapi.json`               | API description                                                             |
| `/robots.txt`, `/sitemap.xml` | Search-engine metadata                                                      |

Signed-out access to protected pages redirects to `/auth/login` with a local return path. Versioned MTG endpoints accept a bearer session or the authenticated browser session. An Authorization header takes precedence and an invalid bearer token fails without cookie fallback. Unsafe cookie-authenticated requests require same-origin protection. The [authentication document](../architecture/auth.md) owns credential and session rules.

There is no OIDC callback route, game-switching page, play route, public deck page, camera capture page, or offline workspace.

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
| `/inventory/[entryId]`                                     | Owned entry mutation                                      |
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

The [product specification](./specification.md) owns import semantics and scan limitations. Refer to the OpenAPI contract for methods, request bodies, response schemas, and error responses rather than inferring them from this route list.

## Compatibility redirects

These exact paths return HTTP 308 and preserve the query string:

| Legacy path                     | Destination  |
| ------------------------------- | ------------ |
| `/mtg`, `/mtg/`                 | `/`          |
| `/mtg/search`                   | `/search`    |
| `/mtg/inventory`                | `/inventory` |
| `/mtg/decks`                    | `/decks`     |
| `/collections`, `/collections/` | `/inventory` |

These mappings are not wildcard redirects. Arbitrary `/mtg/*` or `/collections/*` paths are not guaranteed aliases. Redirects run before page authentication so the destination applies its own access rules.
