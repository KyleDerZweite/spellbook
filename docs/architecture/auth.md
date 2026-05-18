# Auth

- Status: Canonical
- Last Reviewed: 2026-05-17
- Source of Truth: code
- Update Triggers: login flow changes, session model changes, protected route changes, token handoff changes
- Related Docs: [System Overview](./system-overview.md), [Frontend](./frontend.md), [Mobile And Scan](./mobile-and-scan.md), [Routing and Games](../product/routing-and-games.md), [OIDC Auth Setup](../operations/oidc.md), [Zitadel Provider Notes](../operations/zitadel.md), [Deployment](../operations/deployment.md), [ADR-0006](../decisions/0006-generic-oidc-and-internal-account-identity.md)

Spellbook currently uses generic OIDC authentication.

## Current Auth Boundary

- the configured OIDC provider owns identity
- SvelteKit owns the browser-facing login and callback flow
- SvelteKit stores the encrypted session cookie
- Postgres ownership is enforced by SvelteKit server code using the internal Spellbook account id from the session or validated bearer token
- Pangolin is transport and reverse proxy infrastructure only

The mobile client is the same SvelteKit app installed as a PWA and reuses the browser session cookie. No separate mobile auth flow is required for the PWA.

A second entrypoint is retained for non-browser clients:

- the `/api/mobile/v1/...` surface accepts bearer tokens from an optional OIDC client id configured via `OIDC_MOBILE_CLIENT_ID`
- this is optional and unused by the PWA

## Current Identity Model

`user_profiles.account_id` is the stable Spellbook account key used by inventory, deck, and scan data.

External provider identity is stored separately in `auth_identities`:

- `provider_type`
- `issuer`
- `subject`
- `account_id`

On first successful OIDC login, Spellbook auto-provisions the local account and identity mapping. Existing deployments that previously used the provider subject as `account_id` are linked on first login when the subject already exists as a local account id.

Spellbook does not auto-link unrelated identity providers by email.

## Current Session Model

- encrypted cookie-backed session
- refresh flow when the session is near expiry
- `returnTo` sanitization rejects values that are not same-origin paths and falls back to `/`

## Mobile Session Model

- PWA clients reuse the standard web session cookie
- optional bearer tokens may be sent to `/api/mobile/v1/:game/...` by non-browser clients
- bearer token validation uses the configured mobile client id when present

## Current Protected Route Model

Protected path prefixes in the frontend currently include:

- `/search`
- `/inventory`
- `/decks`

Legacy `/mtg/*` and `/collections*` URLs are 308-redirected to the matching flat path before the auth guard runs, so older bookmarks still land on a protected page that prompts a login when needed.
