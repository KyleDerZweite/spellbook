# Local authentication and account recovery

- Status: Canonical
- Last Reviewed: 2026-10-03
- Source of Truth: code
- Update Triggers: registration policy, credential recovery command, migration, reverse proxy origin
- Related Docs: [Authentication architecture](../architecture/auth.md), [Deployment](./deployment.md), [Postgres](../architecture/postgres.md), [ADR-0009](../decisions/0009-local-authentication.md)

New users register at `/auth/register` and sign in at `/auth/login`. Registration is public. The [authentication contract](../architecture/auth.md) defines credential rules, sessions, and JSON API login.

## Existing OIDC accounts

Run the database migrations before serving the updated application. Existing account IDs and owned data remain intact. Old OIDC sessions stop working; historical identity mappings do not provide local credentials.

Enroll each existing account with the operator command below. Do not create a replacement account or link an account by matching email. Select the intended `user_profiles.account_id` from the database and verify the account owner before assigning credentials.

## Set or reset a password

Use Node 24 and install the frontend dependencies first. Set `DATABASE_URL` to the target database in the protected root `.env`, or supply it through the existing secret store. The connection must be reachable from the operator's environment.

Run from `frontend/`:

```sh
node --env-file=../.env scripts/set-local-password.mjs ACCOUNT_ID USERNAME < /secure/path/password-file
```

The existing account ID and desired local username are arguments. The password is read from standard input, not a process argument. Keep the input file private and remove temporary password files after use.

The command updates the account's local credentials and display username, preserves owned data, and revokes all sessions for that account. It rejects missing account IDs and usernames already assigned to another local account. Successful execution prints `Local credentials saved. Existing sessions revoked.`

For a compose deployment, run the same script in the migration image, which includes the source and inherits the internal database connection. From the repository root:

```sh
podman-compose run --rm -T db-migrate node scripts/set-local-password.mjs ACCOUNT_ID USERNAME < /secure/path/password-file
```

The frontend runtime image does not include the recovery script. Users then sign in with the assigned username and password. There is no email-based or self-service recovery flow.

## Deployment settings

OIDC, Zitadel, and `AUTH_SESSION_SECRET` settings are obsolete. Set the public origin through the deployment configuration so SvelteKit can enforce same-origin form requests. Compose maps `APP_ORIGIN` to adapter-node's `ORIGIN` variable.

Behind a proxy, configure trusted client-address headers using the [deployment procedure](./deployment.md). Without this setting, multiple users can share the proxy address and its attempt limit.

For multiple frontend replicas, configure a shared rate limit at the reverse proxy. The built-in attempt limit is per process.
