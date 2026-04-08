# Zitadel Setup

Spellbook uses Zitadel directly for login. The frontend expects a hosted Zitadel login page, Authorization Code + PKCE, and a browser-safe client without a client secret.

## Create the Spellbook application

Create a new **User Agent** application in Zitadel for Spellbook.

Why this type:
- Spellbook currently exchanges the authorization code with `client_id` + PKCE only.
- The app does **not** send a client secret.
- A confidential Web application would require different backend code and extra secret handling.

## Required app settings

For the current hosted deployment, configure these values:

- Issuer: `https://auth.kylehub.dev`
- Frontend origin: `https://spellbook.kylehub.dev`
- Redirect URI: `https://spellbook.kylehub.dev/auth/callback`
- Post logout redirect URI: `https://spellbook.kylehub.dev/`

Scopes requested by Spellbook:

- `openid`
- `profile`
- `email`
- `offline_access`

## Client ID

Set `.env` `ZITADEL_CLIENT_ID` to the **Client ID** shown in the Zitadel application configuration.

Do not use:
- the application resource ID
- a guessed project suffix
- an internal display name

For the current deployment, the correct value is:

```env
ZITADEL_CLIENT_ID=350854248520548356
```

## Spellbook `.env` values

These values must align between Zitadel and Spellbook:

```env
ZITADEL_ISSUER=https://auth.kylehub.dev
ZITADEL_CLIENT_ID=350854248520548356
APP_ORIGIN=https://spellbook.kylehub.dev
AUTH_SESSION_SECRET=<32-byte-base64url-secret>
```

## What should happen when it works

1. Visiting `/auth/login` redirects to `https://auth.kylehub.dev/oauth/v2/authorize`
2. Zitadel redirects to its hosted login page
3. After login, Zitadel redirects back to `/auth/callback`
4. Spellbook stores its encrypted session cookie
5. Protected routes like `/mtg/search` open normally

## Common failure modes

### `Errors.App.NotFound`

Cause:
- `ZITADEL_CLIENT_ID` is wrong

Fix:
- copy the exact Client ID from Zitadel into `.env`
- recreate the frontend container so the new env is loaded

### Redirect back to `/` instead of the intended page

Cause:
- `returnTo` was invalid or missing

Fix:
- start from `/auth/login?returnTo=/mtg/search`

### Callback or logout rejected by Zitadel

Cause:
- redirect URIs in the app config do not match the public Spellbook URLs exactly

Fix:
- ensure the callback is `https://spellbook.kylehub.dev/auth/callback`
- ensure post logout is `https://spellbook.kylehub.dev/`

## Branding the hosted login

If you want the Zitadel-hosted login to feel like Spellbook:

- configure a custom domain for Zitadel
- upload the Spellbook logo
- set brand colors and typography in Zitadel branding
- customize login texts so they reference Spellbook instead of a generic tenant

This keeps the hosted login flow intact while matching the product better.

If you want a fully custom login UI owned by Spellbook, that is a separate implementation project. It would replace the hosted login page with a dedicated OIDC login frontend and needs extra work around password, MFA, recovery, and compliance flows.
