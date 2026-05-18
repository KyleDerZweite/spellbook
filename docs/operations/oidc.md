# OIDC Auth Setup

- Status: Canonical
- Last Reviewed: 2026-05-17
- Source of Truth: code
- Update Triggers: auth flow changes, env var changes, callback path changes, scope changes, supported identity-provider changes
- Related Docs: [Operations Docs](./README.md), [Zitadel Provider Notes](./zitadel.md), [Auth Architecture](../architecture/auth.md), [Deployment](./deployment.md), [ADR-0006](../decisions/0006-generic-oidc-and-internal-account-identity.md)

Spellbook uses generic OpenID Connect for hosted login.

Any provider with standard OIDC discovery can be used, including Zitadel, Keycloak, Authentik, Authelia, Google Workspace, Microsoft Entra ID, WorkOS, or Clerk.

## Required Provider Capabilities

The provider must support:

- OIDC discovery at `/.well-known/openid-configuration`
- Authorization Code + PKCE
- public browser-safe client
- redirect URI back to `/auth/callback`
- ID tokens signed by a JWKS published in discovery metadata

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

`OIDC_MOBILE_CLIENT_ID` is only used by the optional `/api/mobile/v1/:game/...` bearer-token API. The PWA uses the normal browser session and does not require a separate mobile client.

Legacy `ZITADEL_*` env vars are still accepted as a compatibility fallback, but new deployments should use `OIDC_*`.

## Scopes

Spellbook requests:

- `openid`
- `profile`
- `email`
- `offline_access`

## User Provisioning

Spellbook auto-provisions users on first successful OIDC login.

The provider remains the identity source. Spellbook stores:

- an internal app account in `user_profiles`
- the provider mapping in `auth_identities`

The lookup key is:

```text
provider_type + issuer + subject
```

Spellbook does not auto-link unrelated provider accounts by email. This avoids unsafe account linking when two identity providers assert the same email address.

## What Working Login Looks Like

1. Visiting `/auth/login` redirects to the configured OIDC provider.
2. The provider shows its hosted login page.
3. The provider redirects back to `/auth/callback`.
4. Spellbook creates or updates the local app account mapping.
5. Spellbook stores an encrypted session cookie.
6. Protected routes such as `/search` open normally.
