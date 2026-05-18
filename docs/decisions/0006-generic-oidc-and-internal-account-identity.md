# ADR-0006: Generic OIDC And Internal Account Identity

- Status: Accepted
- Date: 2026-05-17
- Related Docs: [Auth Architecture](../architecture/auth.md), [Postgres](../architecture/postgres.md), [OIDC Auth Setup](../operations/oidc.md), [Zitadel Provider Notes](../operations/zitadel.md), [Deployment](../operations/deployment.md)

## Context

Spellbook originally integrated directly with Zitadel. That worked for the current deployment, but it made the app shape depend on one identity provider and used the provider subject as the application ownership key.

That coupling creates two problems:

- future operators may already use another OIDC provider such as Keycloak, Authentik, Authelia, WorkOS, Clerk, Google Workspace, or Microsoft Entra ID
- changing providers can change external subject identifiers and break access to existing inventory, deck, and scan data

Spellbook should stay simple and self-hostable without taking on local password-auth responsibilities before they are clearly needed.

## Decision

Spellbook uses generic OIDC as the canonical external auth contract.

The implementation keeps the existing SvelteKit Authorization Code + PKCE flow and encrypted session cookie, but renames the provider boundary from Zitadel-specific code and env vars to generic OIDC.

New deployments should configure:

- `OIDC_ISSUER`
- `OIDC_CLIENT_ID`
- optional `OIDC_MOBILE_CLIENT_ID`

Legacy `ZITADEL_*` env vars remain accepted as a compatibility fallback.

Spellbook now stores provider identity separately from app ownership:

- `user_profiles.account_id` is the internal Spellbook account key used by app data
- `auth_identities` maps `provider_type + issuer + subject` to that internal account key

Users are auto-provisioned on first successful OIDC login. Spellbook does not auto-link unrelated providers by email.

## Consequences

### Positive

- Zitadel remains supported without being required
- other OIDC providers can be used without changing application code
- future provider migrations do not require domain data to use provider subjects directly
- no local password-auth security surface is introduced yet

### Negative

- auth state now has one additional table
- existing Zitadel env names are legacy compatibility rather than the canonical operator surface
- supporting built-in auth later still requires a separate decision and implementation

### Neutral

- the `account_id` column name remains in existing domain tables to avoid a broad schema rename
- existing deployments that used the provider subject as `account_id` are linked on first login when the subject already exists as a local account id

## Follow-Up

- consider built-in auth only if an external OIDC provider becomes too heavy for the target deployment model
- if built-in auth is added, prefer a maintained auth library over hand-rolled password storage and recovery flows
