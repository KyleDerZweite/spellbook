# Zitadel Setup

Spellbook uses Zitadel directly for login.

The current frontend expects:

- Authorization Code + PKCE
- a public browser-safe client
- no client secret
- hosted Zitadel login pages

## Create the Application

Create a public browser-oriented application in Zitadel for Spellbook.

Required characteristics:

- usable without a client secret
- allowed redirect to the frontend callback route
- allowed post-logout redirect back to the frontend origin

## Required App Values

Use your own public origins.

Example placeholders:

- app origin: `https://spellbook.example.com`
- callback URI: `https://spellbook.example.com/auth/callback`
- post logout redirect URI: `https://spellbook.example.com/`

## Required Environment Variables

Set these in the frontend environment:

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

Examples of currently protected app routes:

- `/mtg/`
- `/mtg/search`
- `/mtg/inventory`
- `/mtg/decks`

These are examples of current code behavior, not the full future platform route contract.

## Common Failure Modes

### Application not found

Cause:

- wrong `ZITADEL_CLIENT_ID`

Fix:

- copy the exact public client ID from Zitadel

### Callback rejected

Cause:

- callback URI mismatch

Fix:

- ensure Zitadel allows `https://your-app-origin/auth/callback`

### Logout rejected

Cause:

- post logout redirect mismatch

Fix:

- ensure Zitadel allows your public app origin as post logout redirect

### Redirect goes to the wrong page after login

Cause:

- invalid or missing `returnTo`

Fix:

- start from a valid internal route such as `/auth/login?returnTo=/mtg/search`

## Branding Notes

If you want the hosted login flow to feel like Spellbook:

- configure a custom Zitadel domain
- upload Spellbook branding assets
- set colors and typography in Zitadel branding

## Non-Goal

This document is generic on purpose. Do not store live instance domains or real client IDs here. Keep those in a private operator note based on [private-instance-template.md](/home/kyle/CodingProjects/spellbook/docs/private-instance-template.md).
