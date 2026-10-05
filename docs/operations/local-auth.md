# Local authentication and account recovery

- Status: Canonical
- Last Reviewed: 2026-10-05
- Source of Truth: code
- Update Triggers: registration policy, credential recovery command, migration, reverse proxy origin, demo mode and seed data
- Related Docs: [Authentication architecture](../architecture/auth.md), [Deployment](./deployment.md), [Postgres](../architecture/postgres.md), [ADR-0009](../decisions/0009-local-authentication.md)

New users register at `/auth/register` and sign in at `/auth/login`. Registration is public. The [authentication contract](../architecture/auth.md) defines credential rules, sessions, and JSON API login.

## Existing OIDC accounts

Run the database migrations before serving the updated application. Existing account IDs and owned data remain intact. Old OIDC sessions stop working; historical identity mappings do not provide local credentials.

Enroll each existing account with the operator command below. Do not create a replacement account or link an account by matching email. Select the intended `user_profiles.account_id` from the database and verify the account owner before assigning credentials.

## Set or reset a password

Use the pinned Node 26 release and install the frontend dependencies first. Set `DATABASE_URL` to the target database in the protected root `.env`, or supply it through the existing secret store. The connection must be reachable from the operator's environment.

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

OIDC, Zitadel, and `AUTH_SESSION_SECRET` settings are obsolete. Set the public origin through the deployment configuration so SvelteKit can enforce same-origin form requests. Compose passes `APP_ORIGIN` into the SvelteKit build. Rebuild the frontend after changing the public origin; adapter-node 6 does not read runtime `ORIGIN`.

Behind a proxy, configure trusted client-address headers using the [deployment procedure](./deployment.md). Without this setting, multiple users can share the proxy address and its attempt limit.

For multiple frontend replicas, configure a shared rate limit at the reverse proxy. The built-in attempt limit is per process.

## Demo mode

Use a disposable PostgreSQL database whose name ends in `_demo` or `_design`. Set `DATABASE_URL` and `APP_ORIGIN`, then run from `frontend/` with the pinned Node version:

```sh
pnpm db:migrate
pnpm dev:demo --host 0.0.0.0
```

`dev:demo` seeds the database and starts Vite with `DEMO_MODE=true`. Sign in with username `demo` and password `demo`. The seed contains a limited real-card catalog, a 100-card Commander deck, an empty deck, and inventory with exact, alternate, and missing copies. Card records come from Scryfall; images retain their source URLs. This is a shared editable account. Changes persist across server restarts.

The seed refuses databases with other usernames. To explicitly delete all accounts and their related data in the selected disposable database and recreate the demo:

```sh
pnpm demo:seed --reset-users
```

Reset also replaces the active sample catalog and revokes existing sessions through account deletion. Ordinary `pnpm demo:seed` preserves an existing demo account and edits. The seed transaction rolls back on failure. No external card API is needed to seed; image display still requires network access.

For a built demo server, seed before starting and set `DEMO_MODE=true` in its runtime environment. Normal deployments leave it unset. Demo mode does not replace ordinary authentication with an automatic session.
