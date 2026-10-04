# Authentication

- Status: Canonical
- Last Reviewed: 2026-10-03
- Source of Truth: code
- Update Triggers: credentials, sessions, protected routes, bearer tokens, origin checks
- Related Docs: [Postgres](./postgres.md), [Frontend](./frontend.md), [Local authentication operations](../operations/local-auth.md), [Deployment](../operations/deployment.md), [ADR-0009](../decisions/0009-local-authentication.md)

Spellbook authenticates local accounts by username and password. `user_profiles.account_id` remains the stable ownership key for inventories, decks, and scans. Registration generates a new account ID; operator enrollment preserves an existing account ID.

## Credentials and sessions

`local_credentials` stores a unique normalized username and salted scrypt password hash. Usernames contain 3 to 32 ASCII letters, digits, underscores, or hyphens, start with a letter or digit, and are trimmed and lowercased. Passwords contain 12 to 128 characters. Scrypt uses `N=32768`, `r=8`, `p=3`, a random 16-byte salt, and a 64-byte result.

Sessions use random 32-byte opaque tokens. `auth_sessions` stores only the token's SHA-256 digest, account ID, creation time, and fixed 30-day expiry. Validation checks the database on each request. Logout revokes the current session; operator password recovery revokes every session for that account.

The browser receives the `spellbook_session` cookie with `HttpOnly`, `SameSite=Lax`, and `Secure` on HTTPS. The cookie contains the opaque token. The installed web app uses this same session. There is no refresh token or identity-provider callback.

## Entry points

| Endpoint                  | Behavior                                                         |
| ------------------------- | ---------------------------------------------------------------- |
| `/auth/register`          | Local account registration page and form action                  |
| `/auth/login`             | Local login page and form action                                 |
| `POST /auth/logout`       | Revoke the browser session and redirect to `/`                   |
| `POST /api/auth/register` | Accept JSON credentials and return a session token with HTTP 201 |
| `POST /api/auth/login`    | Accept JSON credentials and return a session token with HTTP 200 |
| `POST /api/auth/logout`   | Revoke the supplied bearer token and return HTTP 204             |

JSON credentials have `username` and `password` fields. Successful responses contain `user`, `token`, and `expiresAt`; JSON login does not set a cookie. `/api/mobile/v1/mtg/...` accepts `Authorization: Bearer <token>` or a browser session. An explicit invalid bearer header fails instead of falling back to a cookie.

Browser mutations require a matching request origin. JSON login and registration allow a missing origin for non-browser clients but reject a foreign origin. Cookie-authenticated API mutations also require the same origin.

SvelteKit delegates form-origin checks through `csrf.trustedOrigins: ['*']` to the [central form guard](../../frontend/src/lib/server/auth/csrf.ts). The server hook invokes that guard before redirects or session handling. It requires a matching origin for `POST`, `PUT`, `PATCH`, and `DELETE` requests using URL-encoded, multipart, plain-text, or SvelteKit form data, and requests without a content type.

Native clients may omit `Origin` when they carry a well-formed bearer token in these narrow cases:

- Multipart `POST` to the exact scan-frame upload route.
- Requests with no body and no content type for deck, deck-entry, or inventory-entry `DELETE`, scan-session creation, and `/api/auth/logout`.

The route then validates the token against the session database. An invalid token returns HTTP 401 even if a valid browser cookie is present. For guarded requests, a foreign or literal `null` origin returns HTTP 403 even with a valid bearer token. Other guarded requests with a missing origin return HTTP 403. These checks apply in development and production; JSON handlers retain their own origin checks.

Login and registration share a per-process limit of 20 attempts per client address within 15 minutes. At most four password derivations run concurrently. These limits do not coordinate across replicas; multi-replica deployments need a shared proxy rate limit.

## Access and migration

`/search`, `/inventory`, `/decks`, and `/scan`, including their child routes, require authentication. Legacy MTG and collection URLs redirect before the guard. `returnTo` accepts only local paths.

Registration is public. Email verification, emailed reset links, and a self-service password-change page are not implemented. The [operator procedure](../operations/local-auth.md) covers recovery and enrollment of accounts created under OIDC.

Migration `0004` adds credentials and sessions without changing account IDs. Historical `auth_identities` records remain in the database but do not authenticate requests. OIDC tokens, provider configuration, and encrypted legacy sessions are no longer accepted.
