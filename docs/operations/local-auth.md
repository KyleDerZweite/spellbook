# Local authentication and account recovery

- Status: Canonical
- Last Reviewed: 2026-10-29
- Source of Truth: code
- Update Triggers: explicit static Demo valuation and simplified History presentation, local Demo Catalog preservation, canonical root operator commands and pre-release account scope, Python source activation and server contraction, prepared Python operator entrypoints and bundled canonical fixtures, independent API/web ownership and relocated code references, single root environment and demo launch configuration, registration policy, credential recovery command and backend operator lifetime, migration, reverse proxy origin, demo mode, versioned English Catalog publication and private starter preservation, original shipped Upgrades Unleashed Inventory and guarded replacement
- Related Docs: [Authentication architecture](../architecture/auth.md), [Deployment](./deployment.md), [Postgres](../architecture/postgres.md), [ADR-0009](../decisions/0009-local-authentication.md), [Catalog](../architecture/catalog.md), [Manual Demo Catalog updates](./deployment.md#manual-demo-catalog-update), [Pre-release policy](../../CONTRIBUTING.md#replacing-interfaces)

New users register at `/auth/register` and sign in at `/auth/login`.
Registration is public.
The [authentication contract](../architecture/auth.md) defines credential rules, sessions, and JSON API login.

## Existing OIDC accounts

Use the current database schema before serving the application.
The [pre-release policy](../../CONTRIBUTING.md#replacing-interfaces) does not guarantee upgrades from historical account or schema formats.
For an account supported by the current schema, assigning local credentials through the operator preserves its account ID and owned data.
Old OIDC sessions stop working; historical identity mappings do not provide local credentials.

Enroll each existing account with the operator command below.
Do not create a replacement account or link an account by matching email.
Select the intended `user_profiles.account_id` from the database and verify the account owner before assigning credentials.

## Set or reset a password

Prepare installed Python packages with `pnpm setup:python` using the pinned toolchain.
Set `DATABASE_URL` to the target database in the protected root `.env`, or supply it through the existing secret store.
The connection must be reachable from the operator's environment.

Run from the repository root:

```sh
pnpm operator:password ACCOUNT_ID USERNAME < /secure/path/password-file
```

The existing account ID and desired local username are arguments.
The password is read from standard input, not a process argument.
Keep the input file private and remove temporary password files after use.

The root `operator:password` command invokes the installed Python CLI, which owns arguments and bounded stdin intake.
It calls the [backend password operator](../../backend/core/src/spellbook_core/operators/local_password.py), which owns the database pool and atomic credential/display-username update and session revocation.
It supports the operator's authorized target database, including production, without Demo suffix restrictions.
Owned data remains intact.
It rejects missing account IDs and usernames already assigned to another local account.
Successful execution prints `Local credentials saved. Existing sessions revoked.`

The API package installs `spellbook-operator-password ACCOUNT_ID USERNAME`, with the same bounded stdin and account/session behavior.
Run it in the prepared API environment with `DATABASE_URL` supplied by the protected caller environment; it does not load `.env`.
Root wrappers load protected root `.env`; direct Python commands use the caller environment.
Production rollout remains separately authorized.

For a compose deployment, run the same script in the migration image, which includes the source and inherits the internal database connection.
From the repository root:

```sh
podman-compose run --rm -T db-migrate /app/backend/api/.venv/bin/spellbook-operator-password ACCOUNT_ID USERNAME < /secure/path/password-file
```

The frontend runtime image does not include the recovery script.
Users then sign in with the assigned username and password.
There is no email-based or self-service recovery flow.

## Deployment settings

OIDC, Zitadel, and `AUTH_SESSION_SECRET` settings are obsolete.
Set the public origin through the deployment configuration so SvelteKit can enforce same-origin form requests.
Compose passes `APP_ORIGIN` into the web build and the API runtime.
`API_INTERNAL_URL` selects only the private transport destination.
Rebuild the frontend after changing the public origin; adapter-node 6 does not read runtime `ORIGIN`.

Behind a proxy, configure web ingress address trust and the explicit API socket-peer allowlist using the [deployment procedure](./deployment.md).
Without this setting, multiple users can share the proxy address and its attempt limit.

For multiple API replicas, configure a shared rate limit at the reverse proxy.
The built-in attempt limit is per process.

## Demo mode

Use a disposable PostgreSQL database whose name ends in `_demo` or `_design`.
Set `DATABASE_URL` in the ignored root `.env` and set `DEV_APP_ORIGIN` if the local browser origin differs from `http://localhost:5173`, then run from the root with the pinned Node version:

```sh
fnm exec --using 26.10.0 pnpm setup:python
./demo.sh
```

`./demo.sh` runs the one-shot migrator, seeds Demo and starts API, State, Scan and Vite with `DEMO_MODE=true`.
The local launcher omits the live Catalog worker in Demo mode to preserve the bundled Catalog; remote card images still require network access.
Web receives only its safe presentation flag; API owns Demo authentication enforcement.
Direct Vite startup alone does not start the API.
Sign in with username `demo` and password `demo`.
Public Search uses the versioned English Catalog bundle described by [Catalog](../architecture/catalog.md#storage-and-publication).
The versioned [Upgrades Unleashed fixture](../../backend/scripts/demo/upgrades-unleashed.json) creates the original English Kamigawa: Neon Dynasty Commander Deck and Inventory with 76 entries and 101 copies, plus an empty Next brew Deck.
The Deck remains the official 100-card list; Inventory adds one owner-confirmed normal nonfoil Chishiro alongside the foil commander.
This additional copy is recorded separately in `inventoryExtras`, outside the official product list.
It preserves the shipped two Mossfire Valley copies acknowledged by [Wizards](https://magic.wizards.com/en/news/feature/kamigawa-neon-dynasty-commander-decklists-2022-02-07).
This baseline requires an owner-selected replacement for the extra copy before singleton Commander play.
Tokens and the display commander are excluded.
Regular NEC printings represent 69 names; four spells and the normal NEO 289 Mountain and NEO 291 Forest represent the remaining names.
Exact sealed basic artwork variants and physical condition are unverified.
Chishiro and Kaima are recorded as foil, the remaining cards as nonfoil, with NM as the Demo condition.
[WPN product contents](https://wpn.wizards.com/en/products/kamigawa-neon-dynasty) identify two foil legendary cards and 98 additional cards.
Public Catalog and private starters have separate responsibilities.
Card images retain Scryfall source URLs.
This is a shared editable account; changes persist across server restarts.

The seed refuses databases with other usernames.
To explicitly delete all accounts and their related data in the selected disposable database and recreate the demo, run from the repository root:

```sh
pnpm demo:seed --reset-users
```

The installed Python Demo commands load and verify public fixtures, then call the [backend Demo operators](../../backend/core/src/spellbook_core/operators/demo.py) with explicit inputs.
Backend owns SQL, transactions and pool cleanup.
Backend owns these native implementations and fixtures.
Root `pnpm demo:seed` and `pnpm demo:replace-inventory` invoke the installed Python CLI.

Ordinary `pnpm demo:seed` refreshes the versioned public Catalog before returning for an existing Demo account, preserving credentials, Decks, Inventory, revisions, Notes and other private edits.
Only explicit `--reset-users` deletes private users and revokes their sessions through account deletion.
A complete already-active bundle is a Catalog pointer/timestamp no-op.
The existing seed transaction rolls back Catalog and private changes together on failure.
No external card API is needed to seed; images still require network access.
Demo publication does not publish live Price state or establish provider freshness.
The Demo valuation provider reads a versioned [snapshot](../../backend/core/src/spellbook_core/mtg/demo_prices.json) of Scryfall EUR references for the 75 exact starter printings.
References are explicitly `Demo` and `Static`; their original retrieval date does not become a fresh market date.
The same Inventory and Deck estimators multiply these references by actual saved quantities.
Other printings and unavailable finishes remain unknown.
Only explicit `DEMO_MODE=true` selects this provider in API and State; normal deployments retain ordinary source selection and expiry.

Ordinary seeding also adds a 30-day illustrative Inventory scenario using the original starter's printing, finish, condition and quantity identities.
Its fixed factors describe example movement, not historical market observations or the account's former actions.
The normal private history tables store its holdings and copied references with `policy_version=demo-scenario-v1`.
Reporting dates end yesterday in `VALUE_HISTORY_TIMEZONE`, default Europe/Berlin.
Existing dates, private edits and actual captures are preserved on conflict.
Re-seeding fills missing scenario dates without rewriting stored points; later State captures use the real current Demo holdings.
The shared Dashboard and History view disclose Demo prices, and card references/public history identify the Demo source.
There are no browser-only responses or special Demo routes.
Guarded local import and preservation of private state are verified and recorded with [slice 19](https://github.com/KyleDerZweite/spellbook/issues/192).
The prepared Python API package provides `spellbook-demo-seed` and `spellbook-demo-replace-inventory` with the same explicit `--reset-users` and `--apply` options.
Demo target guards and preservation rules still apply.
Installed wheels and sdists bundle unchanged canonical fixtures under `spellbook_api/operators/assets`; source runs use `backend/scripts/demo`, and both retain `--fixtures-dir`.
The installed CLI help, asset hashes, fixture discovery and bundle validation are tested without connecting to a database.
Root executed the installed password command and eight guarded native Operator scenarios at `e120f5bb`; the migration evidence baseline records their scope.
Those results do not establish later state-worker or deployment acceptance.
Deployment remains separate.

## Replace the original private Demo starter

Ordinary seeding preserves existing accounts.
For an untouched legacy Demo Inventory, preview the scoped replacement from the repository root with installed Python packages and protected root environment:

```sh
pnpm demo:replace-inventory
```

The command requires a database name ending in `_demo` or `_design`, a sole Demo profile with matching local Demo credentials, one MTG Inventory at its original revision 0 or 1, and the exact old 43-entry, 72-copy fixture.
It refuses changed entries, Notes, Notes revisions, Boxes, memberships, receipts with a status other than `applied`, receipts from a source other than `web`, or missing active Catalog identities.
Completed current-version web mutation receipts remain untouched; their original acknowledgements stay available for retries.
Preview uses a read-only transaction and writes nothing.
Review the account and Inventory IDs in its output and retain a protected backup before applying:

```sh
pnpm demo:replace-inventory --apply
```

Apply locks the Inventory parent, replaces only its entries, advances its revision once, and adds the complete named 100-card Upgrades Unleashed Deck.
The new Inventory contains 76 entries and 101 copies, including the separately confirmed nonfoil Chishiro.
It preserves other Decks, credentials, sessions and profile data.
Existing SavedState triggers publish Inventory and Deck changes after commit.
Any failure rolls back the replacement and new Deck together.
If a Deck named Upgrades Unleashed already exists, the command reports `preserved` and changes nothing, even if that Deck or the Inventory was edited.
This status does not claim the Inventory already matches the precon.
It never uses `--reset-users`.

Fixture and guard checks live in `backend/core/tests/test_operator_fixtures.py` and API CLI tests.
Guarded PostgreSQL coverage lives in `backend/core/tests/test_operators_postgres.py` and requires `SPELLBOOK_OPERATORS_NATIVE_DATABASE` matching the assigned empty migrated `_demo` or `_design` database.
Run it explicitly with the installed API environment, which supplies Psycopg Pool.
Absent opt-ins are unexecuted integration evidence, not a successful database check.

For a built demo server, seed before starting and set `DEMO_MODE=true` in both API and web runtime environments.
Normal deployments leave it unset.
Demo mode does not replace ordinary authentication with an automatic session.
