# ADR-0009: Local authentication with stable account ownership

- Status: Accepted
- Date: 2026-10-03
- Last Reviewed: 2026-10-03
- Source of Truth: code and product decision
- Update Triggers: authentication strategy, registration policy, identity migration
- Supersedes: [ADR-0006](./0006-generic-oidc-and-internal-account-identity.md)
- Related Docs: [Authentication](../architecture/auth.md), [Account recovery](../operations/local-auth.md), [Postgres](../architecture/postgres.md), [Deployment](../operations/deployment.md)

The self-hosted application should run without a separate identity provider. Spellbook now owns username and password authentication and database-backed sessions. Node's maintained cryptographic implementation supplies scrypt and secure randomness; no separate authentication framework is required for this limited flow.

This removes provider setup and token-validation dependencies but transfers password storage, recovery, and abuse protection to Spellbook operators. Public registration is implemented. Recovery uses an operator command; email delivery, self-service reset, federation, and multi-factor authentication remain outside the implemented contract.

Stable internal account IDs survive the change. The migration adds local credentials and hashed opaque sessions while retaining historical provider mappings. Existing users require explicit operator enrollment, which avoids linking accounts by unverified email or username. Password recovery revokes all account sessions.

The application keeps local password derivation and attempt limits. Replicated deployments require shared proxy rate limiting because process-local limits cannot coordinate across replicas. The [authentication document](../architecture/auth.md) owns the detailed security contract.
