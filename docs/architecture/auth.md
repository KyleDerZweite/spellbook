# Auth

- Status: Canonical
- Last Reviewed: 2026-04-17
- Source of Truth: code
- Update Triggers: login flow changes, session model changes, protected route changes, token handoff changes
- Related Docs: [System Overview](./system-overview.md), [Frontend](./frontend.md), [Mobile And Scan](./mobile-and-scan.md), [Zitadel](../operations/zitadel.md), [Deployment](../operations/deployment.md)

Spellbook currently uses direct Zitadel authentication.

## Current Auth Boundary

- Zitadel owns identity
- SvelteKit owns the browser-facing login and callback flow
- SvelteKit stores the encrypted session cookie
- SpacetimeDB receives the ID token for authenticated access
- Pangolin is transport and reverse proxy infrastructure only

The mobile client is the same SvelteKit app installed as a PWA and reuses the browser session cookie. No separate mobile auth flow is required for the PWA.

A second entrypoint is retained for non-browser clients:

- the `/api/mobile/v1/...` surface accepts bearer tokens from a Zitadel client id configured via `ZITADEL_MOBILE_CLIENT_ID`
- this is optional and unused by the PWA

## Current Session Model

- encrypted cookie-backed session
- refresh flow when the session is near expiry
- `returnTo` sanitization defaults to `/mtg/search`

## Mobile Session Model

- PWA clients reuse the standard web session cookie
- optional bearer tokens may be sent to `/api/mobile/v1/...` by non-browser clients
- bearer token validation uses the configured mobile client id when present

## Current Protected Route Model

Protected path prefixes in the frontend currently include:

- `/mtg`
- `/collections`
- `/search`

The latter two are transitional and still protected because they redirect into MTG flows.
