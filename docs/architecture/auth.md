# Auth

- Status: Canonical
- Last Reviewed: 2026-04-08
- Source of Truth: code
- Update Triggers: login flow changes, session model changes, protected route changes, token handoff changes
- Related Docs: [System Overview](./system-overview.md), [Frontend](./frontend.md), [Zitadel](../operations/zitadel.md), [Deployment](../operations/deployment.md)

Spellbook currently uses direct Zitadel authentication.

## Current Auth Boundary

- Zitadel owns identity
- SvelteKit owns the browser-facing login and callback flow
- SvelteKit stores the encrypted session cookie
- SpacetimeDB receives the ID token for authenticated access
- Pangolin is transport and reverse proxy infrastructure only

## Current Session Model

- encrypted cookie-backed session
- refresh flow when the session is near expiry
- `returnTo` sanitization defaults to `/mtg/search`

## Current Protected Route Model

Protected path prefixes in the frontend currently include:

- `/mtg`
- `/collections`
- `/search`

The latter two are transitional and still protected because they redirect into MTG flows.
