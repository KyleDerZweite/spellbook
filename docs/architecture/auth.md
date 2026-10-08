# Authentication

- Status: Canonical
- Last Reviewed: 2026-10-08
- Source of Truth: code
- Update Triggers: credentials, sessions, trusted actor authority, protected routes, bearer tokens, origin checks, demo mode, account preferences, profile card validation, password changes, summary reporting failures, post-login destinations, agent discovery, workspace ownership, application resource lifetime and native operator ownership, SavedState stream authority and origin policy
- Related Docs: [Postgres](./postgres.md), [Frontend](./frontend.md), [Routes](../product/routing-and-games.md), [Local authentication operations](../operations/local-auth.md), [Deployment](../operations/deployment.md), [ADR-0009](../decisions/0009-local-authentication.md), [Application contract](./application-contract.md)

Spellbook authenticates local accounts by username and password. `user_profiles.account_id` remains the stable ownership key for inventories, decks, and scans. Registration generates a new account ID; operator enrollment preserves an existing account ID.

## Application ownership

The backend [local-authentication use case](../../backend/src/auth/local.ts) owns credential validation, hashing, rate/derivation limits and database sessions. [Frontend composition](../../frontend/src/lib/server/composition.ts) supplies database/build-analysis and demo-mode configuration to the [backend application constructor](../../backend/src/application.ts). Backend owns database construction and resource lifetime. [`contracts/src/auth.ts`](../../contracts/src/auth.ts) owns the safe user/session/application shapes; `expiresAt` is an ISO string at this boundary. Frontend owns cookies, origin checks, native forms, expiry conversion to Date and HTTP error mapping. Native authentication helpers and error classes come from the resource-free [transport facade](../../backend/src/transport.ts). Existing public response shapes remain unchanged.

The shared [profile contract](../../contracts/src/profile.ts) owns avatar/artwork IDs, defaults, ID validation, contact-email normalization and profile patch/read types. [profile-card.ts](../../contracts/src/profile-card.ts) owns full card validation, limits, mana grammar, defaults and KPI names. Frontend owns labels/image paths and current-metric rendering. The backend [Profile use case](../../backend/src/profile/profile.ts) owns preference/card persistence and aggregate profile totals. Settings forms and account HTTP adapters call these same use cases. Password handling delegates to backend Auth; the removed Settings/Profile persistence imports no longer need boundary exceptions.

Backend authentication, session validation and inspection produce server-side actors associated with their validated session. The backend's `requireActor` revalidates that session and derives current account identity from the database, including when called inside a writing transaction. A copied or fabricated `AuthUser` DTO has no actor authority. Changing a trusted object's account fields cannot select a different account. HTTP adapters authenticate credentials again rather than accepting a serialized actor as authority.

The backend also provides current-password-confirmed rotation and JSON-safe session inspection. Rotation checks the verified credential again under the account-row lock, updates the hash, revokes old sessions and creates its replacement in one transaction. Web password handling and the account API both call this rotation use case. Session inspection is exposed through the account HTTP adapter; the entry-point table below lists implemented routes.

## Credentials and sessions

The explicit demo deployment supplies a Demo profile-card fallback only for username `demo` when no valid card definition is stored. Saved definitions and normal account defaults take precedence. This does not reset avatar, artwork, inventory or deck edits.

`local_credentials` stores a unique normalized username and salted scrypt password hash. Usernames contain 3 to 32 ASCII letters, digits, underscores, or hyphens, start with a letter or digit, and are trimmed and lowercased. Passwords contain 12 to 128 characters. Explicit `DEMO_MODE=true` permits the seeded `demo` account to sign in with `demo`, still using password hashing and ordinary sessions. This mode rejects registration and other usernames. The login page displays the demo credentials; the registration page redirects to login. [Demo setup](../operations/local-auth.md#demo-mode) owns seeding and reset commands. Scrypt uses `N=32768`, `r=8`, `p=3`, a random 16-byte salt, and a 64-byte result.

Sessions use random 32-byte opaque tokens. `auth_sessions` stores only the token's SHA-256 digest, account ID, creation time, and fixed 30-day expiry. Validation checks the database on each request. Logout revokes the current session. Operator password recovery and self-service password changes revoke every old session for that account.

`user_profiles.avatar_id` stores the account's selected sprite, with `wizard` as the default. Migration `0007_profile_avatar.sql` adds this field for existing accounts without changing their identities or sessions. Login, registration, and session validation return `avatarId` with the user. The authenticated `/settings` action accepts `intent=avatar`, validates choices against the shared [avatar IDs](../../contracts/src/profile.ts), and updates only the current account's avatar. Apply the normal database migrations before deploying code that reads this field.

`user_profiles.artwork_id` stores the selected profile artwork, with `grove` as the default. Migration `0008_profile_artwork.sql` adds the field for existing accounts. Registration accepts an optional `artworkId` from the shared [artwork IDs](../../contracts/src/profile.ts). Omission uses the default; an explicit invalid choice rejects registration before account creation. Login and session validation return the stored `artworkId`. The authenticated `/settings/profile-card` form requires artwork from that collection and delegates only edited artwork/card fields to the backend Profile patch. It does not require or change an avatar. Submitted account IDs never select the update target.

Migration `0009_profile_card.sql` adds nullable `user_profiles.profile_card` JSONB for the private card design. The authenticated `/settings` and `/settings/profile-card` loads read it through the account-scoped [Profile use case](../../backend/src/profile/profile.ts), independently of inventory totals. Missing or invalid stored designs use the shared username-based default without writing it. Session and login responses retain their existing user shape.

The `/settings/profile-card` action validates complete card submissions through the shared [card validator](../../contracts/src/profile-card.ts), including field types, limits, mana symbols and KPI placeholders. Backend validates the saved card merged with supplied fields under the account-row lock, then saves supplied preference/card changes atomically. Unknown fields or invalid merged cards fail without partial changes. Invalid submissions return field errors, safe submitted strings and the legendary boolean for correction. An omitted native legendary checkbox means false. The database stores placeholder text, while the presentation resolves current account metrics.

The `/settings` action also accepts `intent=email`. It trims an optional contact email and accepts an empty value or a valid email address of at most 254 characters. Email changes preserve the avatar, artwork, card and username. Contact email is not verified and does not authenticate an account or enable recovery. Each Settings action requires the same origin and uses `locals.user.accountId` for ownership.

The `/settings/password` form requires the current password, a new password of 12 to 128 characters, and matching confirmation. It reuses the authentication rate and derivation limits. Invalid fields or an incorrect current password leave credentials and sessions unchanged. The credential update checks that the verified hash is still current under the same account-row lock used by session issuance and operator recovery. One transaction stores the new salted scrypt hash, revokes old sessions and issues a fresh session with the expected new hash. The browser receives the replacement cookie through the ordinary session helper. Responses contain only success, a message and field errors, never submitted passwords. Explicit demo mode rejects password changes and preserves `demo` / `demo`.

The browser receives the `spellbook_session` cookie with `HttpOnly`, `SameSite=Lax`, and `Secure` on HTTPS. The cookie contains the opaque token. The installed web app uses this same session. There is no refresh token or identity-provider callback.

## Account HTTP contract

The [account adapter](../../frontend/src/lib/server/account.ts) and [OpenAPI](../../frontend/src/routes/openapi.json/+server.ts) own HTTP parsing, responses and exact schemas. These routes accept a validated bearer session or browser cookie. An explicit Authorization header takes precedence; invalid bearer credentials never fall back to cookies. Cookie mutations require matching Origin. Successful account responses use HTTP 200 and `Cache-Control: no-store`.

`GET /api/account/profile` returns `{ user, card, totals, statsError }`. Totals are aggregate profile metrics, or null with a visible `statsError` when unavailable. `PATCH` accepts optional `email`, `avatarId`, `artworkId` and partial `profileCard` fields. Omitted fields retain their saved values. Backend revalidates the session-produced actor and merges card fields under the account lock; disjoint edits survive, while the same supplied field uses the last successful save. Empty patches are authenticated no-ops returning the current profile. Invalid/unknown fields return HTTP 400 with `{ kind: 'ValidationFailed', message, fields }`.

Enhanced card forms submit only edited fields. Native forms carry `baselineCard` and `baselineArtworkId`, allowing the adapter to derive the user's edits from the submitted baseline rather than overwrite disjoint later changes. Invalid baselines fail with retained inputs and a reload instruction. An unchanged valid form remains an authenticated no-op. This baseline is a change detector, not actor authority or an optimistic text revision.

If concurrent changes make the merged card invalid, native and enhanced saves return HTTP 400 with field errors and the submitted draft. This includes changes committed between the adapter's read and the backend write. The editor keeps the submitted fields available for correction and retry.

`GET /api/account/dashboard` returns the [DashboardSummary](../../contracts/src/dashboard.ts) contract. `GET /api/auth/session` returns `{ user, expiresAt }` for the selected validated session, without its token or stored hash. `POST /api/account/password` accepts only `currentPassword` and `newPassword`, rotates through backend Auth and returns `{ token, expiresAt }`. Expiry is an ISO string. Cookie callers receive a replacement cookie; bearer callers receive the replacement token without a cookie. Incorrect passwords or invalid fields return HTTP 400; revoked/expired sessions return HTTP 401 and rate limits return HTTP 429. Existing demo password immutability remains enforced.

If totals exceed the exact JSON-number reporting range, Dashboard returns HTTP 503 with `{ status: 503, message: 'Your collection totals exceed the supported reporting range.' }`. Profile reads remain HTTP 200 with `totals: null` and that message in `statsError`, so preferences remain available. [Postgres](./postgres.md#dashboard-summary-reads) owns aggregate arithmetic and its reporting boundary. Per-entry quantity limits remain unchanged.

## Saved-state stream

`GET /api/account/events` uses the canonical Authorization-before-cookie authentication rule. Malformed or invalid explicit Authorization never falls back to cookies. Native EventSource uses same-origin cookies; header-capable clients use bearer authentication. The route rejects all query parameters and supports no URL credentials or client-selected account identity.

A missing Origin is accepted. A supplied Origin must match the compiled application origin; foreign and literal `null` Origins return 403. Missing/invalid sessions return 401 instead of a login redirect. Listener startup failures return 503 with `Saved state temporarily unavailable`. Responses use `Content-Type: text/event-stream`, `Cache-Control: no-store` and `X-Accel-Buffering: no`. [OpenAPI](../../frontend/src/routes/openapi.json/+server.ts) owns the additive route and status contract. Existing versioned MTG paths remain unchanged.

Backend Auth `actorSession` derives the bound account and expiry from its private trusted-actor binding and returns a safe session DTO without token/hash. Frontend-supplied identity or expiry confers no stream authority. The server stream adapter frames only backend-authorized delivery; reserved events receive a fresh session check at actual delivery. Request cancellation reaches subscription setup before attachment and prevents a late setup completion from attaching it. [The application contract](./application-contract.md#saved-state-synchronization) owns delivery revalidation, expiry, queues and listener recovery.

## Entry points

| Endpoint                                                 | Behavior                                                              |
| -------------------------------------------------------- | --------------------------------------------------------------------- |
| `/settings`                                              | Contact email and avatar load and separate form intents               |
| `/settings/profile-card`                                 | Private card definition and artwork load and form action              |
| `/settings/password`                                     | Current-password-confirmed change and fresh browser session           |
| `/auth/register`                                         | Local account registration page and form action                       |
| `/auth/login`                                            | Local login page and form action                                      |
| `POST /auth/logout`                                      | Revoke the browser session and redirect to `/`                        |
| `POST /api/auth/register`                                | Accept JSON credentials and return a session token with HTTP 201      |
| `POST /api/auth/login`                                   | Accept JSON credentials and return a session token with HTTP 200      |
| `GET /api/account/profile`, `PATCH /api/account/profile` | Read current profile and patch supplied preference/card fields        |
| `GET /api/account/dashboard`                             | Read account aggregates, deck availability and bounded recent entries |
| `POST /api/account/password`                             | Rotate credentials and return a replacement session                   |
| `GET /api/account/events`                                | Session-bound SavedState event stream                                 |
| `GET /api/auth/session`                                  | Inspect the selected authenticated session                            |
| `POST /api/auth/logout`                                  | Revoke the supplied bearer token and return HTTP 204                  |

JSON credentials have `username` and `password` fields. Registration also accepts the optional `artworkId` preference. Successful responses contain `user`, `token`, and `expiresAt`; JSON login does not set a cookie. `/api/mobile/v1/mtg/...` accepts `Authorization: Bearer <token>` or a browser session. An explicit invalid bearer header fails instead of falling back to a cookie.

Browser mutations require a matching request origin. JSON login and registration allow a missing origin for non-browser clients but reject a foreign origin. Cookie-authenticated API mutations also require the same origin.

SvelteKit delegates form-origin checks through `csrf.trustedOrigins: ['*']` to the [central form guard](../../frontend/src/lib/server/auth/csrf.ts). The server hook invokes that guard before redirects or session handling. It requires a matching origin for `POST`, `PUT`, `PATCH`, and `DELETE` requests using URL-encoded, multipart, plain-text, or SvelteKit form data, and requests without a content type.

Native clients may omit `Origin` when they carry a well-formed bearer token in these narrow cases:

- Multipart `POST` to the exact scan-frame upload route.
- Requests with no body and no content type for deck, deck-entry, or inventory-entry `DELETE`, scan-session creation, and `/api/auth/logout`.

The route then validates the token against the session database. An invalid token returns HTTP 401 even if a valid browser cookie is present. For guarded requests, a foreign or literal `null` origin returns HTTP 403 even with a valid bearer token. Other guarded requests with a missing origin return HTTP 403. These checks apply in development and production; JSON handlers retain their own origin checks.

Login, registration and password changes share a per-process limit of 20 attempts per client address within 15 minutes. At most four password derivations run concurrently. These limits do not coordinate across replicas; multi-replica deployments need a shared proxy rate limit.

## Access and migration

`/mtg/dashboard`, `/mtg/inventory`, `/mtg/decks`, `/mtg/scan`, and `/settings`, including their child routes, require authentication. Catalog browsing at `/mtg/search` and read-only `/api/catalog/*` endpoints is public. Saving inventory or decks still requires authentication. Legacy MTG and collection URLs redirect before the guard. The public root remains the landing after sign-in. Login and registration default to `/mtg/inventory`; a safe explicit `returnTo` preserves its path and query, including a deck selection or `/`. The guard supplies the protected destination with its query. `returnTo` must start with one slash and contain no backslashes or control characters; absent or rejected values use the inventory default.

Registration is public. Email verification and emailed reset links are not implemented. The [operator procedure](../operations/local-auth.md) covers recovery and enrollment of accounts created under OIDC.

Migration `0004` adds credentials and sessions without changing account IDs. Historical `auth_identities` records remain in the database but do not authenticate requests. OIDC tokens, provider configuration, and encrypted legacy sessions are no longer accepted.

## Agent account creation

`GET /llms.txt` provides a public Markdown overview, application and API links, and ordinary local account registration and credential storage rules for agents. The shared HTML head discovers it through `rel="describedby"`, following the [llms.txt proposal](https://llmstxt.org/). `/agents.md` permanently redirects to `/llms.txt`. The current JSON API remains the authentication owner, with full-account sessions rather than delegated scopes. Demo mode publishes a disabled-registration guide. The [provider evaluation](./auth-provider-evaluation.md#future-authmd-integration) records the separate future auth.md protocol work.

Category commands and Deck writes acquire the owning Profile lock before the internal `requireActorForWrite` session fence. Auth locks the trusted session row `FOR SHARE` and checks live expiry after the wait. A concurrent logout either revokes before validation, causing rollback, or waits until the authorized transaction finishes. Ordinary `requireActor` remains nonlocking for read-only GET transactions.
