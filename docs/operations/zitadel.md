# Zitadel Setup

- Status: Canonical
- Last Reviewed: 2026-05-17
- Source of Truth: code
- Update Triggers: auth flow changes, env var changes, callback path changes, scope changes
- Related Docs: [OIDC Auth Setup](./oidc.md), [Operations Docs](./README.md), [Auth Architecture](../architecture/auth.md), [Routing and Games](../product/routing-and-games.md), [Deployment](./deployment.md)

Spellbook supports Zitadel through the generic OIDC integration.

Use this file for Zitadel-specific provider setup notes. Use [OIDC Auth Setup](./oidc.md) for the canonical auth contract.

## Zitadel App Type

The frontend expects:

- Authorization Code + PKCE
- a public browser-safe client
- no client secret
- hosted Zitadel login pages

The mobile surface is served as a PWA on the same SvelteKit origin and uses the same public browser-safe client. No separate native client id is required for the PWA itself.

## Required Environment Variables

```env
OIDC_ISSUER=https://auth.example.com
OIDC_CLIENT_ID=your-public-client-id
APP_ORIGIN=https://spellbook.example.com
AUTH_SESSION_SECRET=your-32-byte-base64url-secret
```

Optional:

```env
OIDC_MOBILE_CLIENT_ID=your-bearer-token-client-id
```

The optional mobile client id is only consumed by the `/api/mobile/v1/:game/...` bearer-token validator for future non-browser clients. It is not required for the PWA.

## Scopes

Spellbook currently requests:

- `openid`
- `profile`
- `email`
- `offline_access`

## What Working Login Looks Like

1. Visiting `/auth/login` redirects to Zitadel through the generic OIDC flow.
2. Zitadel shows its hosted login page.
3. Zitadel redirects back to `/auth/callback`.
4. Spellbook creates or updates the local app account mapping.
5. Spellbook stores an encrypted session cookie.
6. Protected routes such as `/search` open normally.

## Current Protected Route Examples

- `/search`
- `/inventory`
- `/decks`

These are examples of current code behavior. User-facing routes are flat; the active game lives in client state, not the URL (see [Routing and Games](../product/routing-and-games.md)).
