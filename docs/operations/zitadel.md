# Zitadel Setup

- Status: Canonical
- Last Reviewed: 2026-04-18
- Source of Truth: code
- Update Triggers: auth flow changes, env var changes, callback path changes, scope changes
- Related Docs: [Operations Docs](./README.md), [Auth Architecture](../architecture/auth.md), [Routing and Games](../product/routing-and-games.md), [Deployment](./deployment.md)

Spellbook uses Zitadel directly for login.

The current frontend expects:

- Authorization Code + PKCE
- a public browser-safe client
- no client secret
- hosted Zitadel login pages

The mobile surface is served as a PWA on the same SvelteKit origin and uses the same public browser-safe client. No separate native client id is required for the PWA itself.

`ZITADEL_MOBILE_CLIENT_ID` is retained as an optional variable consumed by the `/api/mobile/v1/:game/...` bearer-token validator for future non-browser clients (for example, a Capacitor wrap). It is not required for the PWA.

## Required Environment Variables

```env
ZITADEL_ISSUER=https://auth.example.com
ZITADEL_CLIENT_ID=your-public-client-id
APP_ORIGIN=https://spellbook.example.com
AUTH_SESSION_SECRET=your-32-byte-base64url-secret
```

Optional:

```env
ZITADEL_MOBILE_CLIENT_ID=your-bearer-token-client-id
```

## Scopes

Spellbook currently requests:

- `openid`
- `profile`
- `email`
- `offline_access`

## What Working Login Looks Like

1. Visiting `/auth/login` redirects to Zitadel.
2. Zitadel shows its hosted login page.
3. Zitadel redirects back to `/auth/callback`.
4. Spellbook stores an encrypted session cookie.
5. Protected routes such as `/search` open normally.

## Current Protected Route Examples

- `/search`
- `/inventory`
- `/decks`

These are examples of current code behavior. User-facing routes are flat; the active game lives in client state, not the URL (see [Routing and Games](../product/routing-and-games.md)).
