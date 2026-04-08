# Zitadel Setup

- Status: Canonical
- Last Reviewed: 2026-04-08
- Source of Truth: code
- Update Triggers: auth flow changes, env var changes, callback path changes, scope changes
- Related Docs: [Operations Docs](./README.md), [Auth Architecture](../architecture/auth.md), [Deployment](./deployment.md)

Spellbook uses Zitadel directly for login.

The current frontend expects:

- Authorization Code + PKCE
- a public browser-safe client
- no client secret
- hosted Zitadel login pages

## Required Environment Variables

```env
ZITADEL_ISSUER=https://auth.example.com
ZITADEL_CLIENT_ID=your-public-client-id
APP_ORIGIN=https://spellbook.example.com
AUTH_SESSION_SECRET=your-32-byte-base64url-secret
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
5. Protected MTG routes such as `/mtg/search` open normally.

## Current Protected Route Examples

- `/mtg/`
- `/mtg/search`
- `/mtg/inventory`
- `/mtg/decks`

These are examples of current code behavior, not the full future platform route contract.
