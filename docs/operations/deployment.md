# Deployment

- Status: Canonical
- Last Reviewed: 2026-11-11
- Source of Truth: repo config
- Update Triggers:
  - Three-file Compose selection, isolated projects, root configuration and standalone defaults.
  - Compose services, independent images, startup commands and graceful shutdown.
  - Stable server ingress, Development tunnels, loopback ports and origin builds.
  - Database migration ownership, retained data, recovery and operator commands.
  - Automatic Demo update eligibility, completion evidence, documentation-only restarts and proposed
    workflow improvements.
  - One-time migration of installations still using Compose overlays.
  - Catalog publication, Demo bundles, private reset and source refresh.
  - Transient Scan processing, worker ownership, value-history scheduling and reporting.
  - Authentication, QR sessions, PWA operation and current runtime acceptance.
- Related Docs:
  - [Postgres](../architecture/postgres.md)
  - [Operations](./README.md)
  - [Local authentication](./local-auth.md)
  - [System overview](../architecture/system-overview.md)
  - [Private instance template](./private-instance-template.md)
  - [GitHub automation](./github-automation.md)
  - [PostgreSQL upgrade](./postgres-upgrade.md)
  - [Catalog](../architecture/catalog.md)
  - [Python direction](../decisions/0025-python-api-and-workers.md)

The repository has exactly three Compose files. [`compose.yml`](../../compose.yml) is standalone
self-hosting without configuration. [`compose.dev.yml`](../../compose.dev.yml) is configured private
Development with Newt. [`compose.prod.yml`](../../compose.prod.yml) contains hosted Production, Demo
and the independent stable connector. There are no Compose overlays or generated image YAML files.
Keep live domains, account details and secret references in private operator notes.

API, Catalog and State wait for successful one-shot migration; Scan remains independent. State is
the sole scheduled ValueHistory owner. API performs synchronous effects and enqueues work but starts
no schedulers. Configuration changes do not authorize deployment, a database reset or retirement of
a retained rollback artifact.

## Standalone self-hosting

With Podman and podman-compose installed, run from a checkout without creating `.env`:

```sh
podman-compose -f compose.yml up --build -d
```

Open `http://localhost:3000` and register a normal account. Only frontend publishes a host port,
bound to `127.0.0.1`. API shares frontend's network namespace and binds to loopback; PostgreSQL and
workers publish no ports. PostgreSQL uses trust authentication inside the private application
network. Scan frames pass through API and worker memory only. No Newt or storage service or Demo
account is required. Startup runs migrations without Demo seeding. The database starts empty; the
opt-in Catalog worker imports public data separately:

```sh
podman-compose -f compose.yml --profile catalog run --rm worker
podman-compose -f compose.yml down
```

Stopping without `--volumes` retains data. For a different port with direct Compose, set both
`LOCAL_PORT` and `LOCAL_APP_ORIGIN` to matching values before building. Standalone optional keys are
listed in [`.env.example`](../../.env.example); the defaults need none of them.

## Demo deployment

Keep exactly one private root `.env` per configured checkout, restricted to mode 600 and outside
Git. [`.env.example`](../../.env.example) inventories `PROD_*`, `DEMO_*` and `DEV_*` source keys.
Native commands retain unprefixed variables. The [hosted launcher](../../scripts/compose.mjs) maps
only the selected environment to internal `HOSTED_*` interpolation variables in memory. Do not
configure these internal variables directly. Changing key names does not rotate existing database
credentials.

Demo uses production image entrypoints without source mounts or reload servers. Set
`DEMO_APP_ORIGIN`, `DEMO_POSTGRES_PASSWORD`, `DEMO_FRONTEND_ALIAS` and `DEMO_IMAGE_REVISION`.
`DEMO_POSTGRES_DB` defaults to `spellbook_demo` and must end in `_demo` or `_design`. Startup
migrates and seeds the bundled searchable Catalog before API and State start. Demo enables the
shared `demo` account and static example prices; registration remains disabled. Seeding preserves
private edits and an existing active Catalog publication. Scan frames are transient in memory. The
live Catalog worker is opt-in. Catalog card images still use remote Scryfall URLs.

Hosted commands select an explicit full Git revision through `DEMO_IMAGE_REVISION`,
`PROD_IMAGE_REVISION` or `--revision FULL_SHA`. Each first-party image is
`localhost/spellbook-demo-<service>:git-<first-12-characters>` or
`localhost/spellbook-production-<service>:git-<first-12-characters>`. The service names include
`db-migrate`, `api`, `frontend`, `state-worker`, `scan-worker` and `worker`. This retains the
existing Demo tag convention. `build` requires a clean checkout at that exact revision and refuses
to overwrite any existing selected tag. It checks the source again after building. A failed or
interrupted build requires operator inspection of partial tags before retrying. `up` requires all
six selected local images, uses `--no-build` and recreates services, including the one-shot
migrator. First-party images use `pull_policy: never`; rollout never falls back to a generated name
or `latest`. `run` also requires the selected local images and does not start dependencies. Use it
only against an already prepared database and completed migration. Config output can contain
secrets; keep real output in protected operator tooling, outside logs.

From a clean selected checkout, set the matching revision in private `.env`, then use:

```sh
pnpm compose demo build
pnpm compose demo up
pnpm compose demo down
```

An existing complete set of immutable local images can be selected without rebuilding, including
during recovery. An origin change requires a new image revision and an origin-matched frontend
build. No hosted application service publishes host ports. Verify login, Search, Inventory, Decks
and long-lived streams through the public origin after an authorized rollout. User services own
reboot startup; container restart policies alone do not establish it.

## Stable server site and optional Development

The connector uses `PROD_PANGOLIN_ENDPOINT`, `PROD_NEWT_ID`, `PROD_NEWT_SECRET` and
`PROD_INGRESS_NETWORK`. It requires no application database, origin or image revision. Its
independent project remains `spellbook-site`, with service `newt` and only the `site` profile. An
explicit site command starts no applications. The shared ingress network is external in all three
hosted modes, so stopping a project retains it. On a new server, create the configured network once
before starting the connector. For the default inventory value, the commands are:

```sh
podman network create --opt isolate=true spellbook-prod-ingress
pnpm compose site up
pnpm compose demo up
```

Reuse an existing network instead of creating or replacing it. Frontend and its shared API namespace
join both the application network and ingress. PostgreSQL and workers stay on the application
network; Newt joins only ingress. Keep `DEMO_FRONTEND_ALIAS` and `PROD_FRONTEND_ALIAS` unique and
preserve existing Pangolin target aliases. Both project-local application bridges and the shared
Ingress bridge must enable Netavark `isolate=true`. Different bridge names alone do not prevent
cross-network connections on Podman. The option blocks traffic between bridges that both enable it;
same-bridge frontend communication remains intentional. PostgreSQL and workers stay on their project
bridge, and API continues to listen on frontend loopback. No application host ports are published.
Keep outbound access for Catalog. This is the selected Podman deployment policy, not a Docker
bridge-driver option.

Existing networks require a coordinated, volume-preserving recreation to apply driver options. Stop
only the selected application stacks and their connector gracefully under the update and backup
locks. Preserve project names, ingress aliases, subnets and all volumes. Verify actual cross-stack
TCP denial and working same-stack reads, Scan and Catalog access before resuming updates. Never use
`down --volumes` for this operation.

Demo remains project `spellbook-demo`; Production remains project `spellbook`. Production uses
normal accounts and the scheduled Catalog worker. Scan images remain transient without a named
volume or S3 configuration. Production remains stopped until its separate activation is authorized.
Use `pnpm compose production build` and `pnpm compose production up` only for that selected rollout.

Development is a separate persistent environment with normal accounts. Requests to start "dev" mean
Development Compose. Native processes and Vite require an explicit request.

```sh
pnpm dev
pnpm dev:stop
```

The [Development launcher](../../scripts/dev.mjs) selects the file from the presence of root `.env`.
Without `.env`, it uses `compose.yml`, project `spellbook-dev-local` and database `spellbook_dev`.
Open `http://localhost:3000`; `DEV_LOCAL_PORT=5192 pnpm dev` selects a different loopback port and
matching build/API origin. With `.env`, it uses `compose.dev.yml`, project `spellbook-dev` and its
private Newt connector. Set `DEV_APP_ORIGIN`, `DEV_POSTGRES_PASSWORD`, `DEV_PANGOLIN_ENDPOINT`,
`DEV_NEWT_ID` and `DEV_NEWT_SECRET`. Missing keys fail configuration rather than selecting another
mode. Configured Development publishes no host port and defaults to database `spellbook_dev`. Both
modes run migration without Demo seed and keep Catalog opt-in. Keep `.env` available for
`pnpm dev:stop` so it selects the same project.

All application modes retain volume keys `postgres18_data`, `demo_scans` and `worker_data` where
used. Project names provide separate persistent identities, including
`spellbook-demo_postgres18_data` and `spellbook-demo_demo_scans`. The historical `demo_scans` key
also remains in Development and standalone configuration to preserve existing data. Changing files
or modes does not transfer data. Never use `down --volumes` during this configuration cutover. Keep
the Development connector active on only one selected device at a time.

After an authorized startup, verify `/openapi.json`, normal registration/login or Demo login, the
selected origin and retained data. Resolved Compose configuration alone does not establish runtime
health. Configure Pangolin resources with maintenance enabled and type `automatic`. Use an HTTP
target check for `/openapi.json` expecting 200 to check frontend forwarding to API. Keep automatic
maintenance enabled during normal operation; deliberately disabled Production stays disabled.

### Automatic Demo updates

The same protected updater can enroll an explicitly authorized Production installation with its own
target binding, deployment receipt, database export, service and timer. Demo and Production share
the update and host-backup locks. Each environment independently selects the latest successful main
push CI. Production uses internal application health and an external Pangolin SSO redirect check; it
must not make its schema public or use Demo credentials. Its scheduled Catalog worker can
legitimately advance public publication pointers. Keep automatic maintenance and SSO policy intact.
Local Scan volumes remain separate by Compose project and survive updates.

An SSO redirect and healthy application or target checks do not prove that the tunnel forwards
requests. Verify the actual gateway-to-application route after activation or target changes,
including `/` and `/openapi.json`, while preserving SSO. A missing internal tunnel listener can
return 502 after authentication even when direct application and target health checks pass. Internal
tunnel ports are not published application host ports. Do not disable SSO to test routing.

The private Demo updater selects a new `main` revision after its newest push-CI attempt succeeds. As
verified on 2026-11-07, it does not filter revisions by changed paths. Documentation, `.gitignore`
and other repository-only changes can therefore trigger an image build and Demo restart through the
active timer. Updating a checkout alone does not establish which revision is running; use the
deployment receipt and actual image IDs. Private ignored skill edits alone do not create a new Git
revision. Keep the updater's implementation, target binding and access details in protected operator
storage.

An authorized Demo update is complete only when all of the following evidence agrees on the full
selected SHA:

- Source synchronization has passed the existing clean-main, expected-remote and fast-forward
  checks, and the checkout is at the selected SHA.
- The selected SHA's latest push-CI attempt has succeeded under the existing
  [CI coverage](./github-automation.md#ci-coverage) rules. An older successful attempt does not
  establish eligibility after a newer failed or pending attempt.
- The existing deployment receipt records successful deployment of that SHA, with no active failure
  latch.
- Actual image IDs for every running application and the completed `db-migrate` container match the
  selected immutable images, and the public `/openapi.json` health check returns 200.
- The existing [Demo deployment verification](#demo-deployment) passes through the public origin,
  including authenticated Demo login/read/logout and long-lived streams, with Catalog/Price
  publication pointers and retained database/Scan volumes preserved.

Use the existing protected updater and receipt procedures to collect this evidence. Report source
synchronization and CI success separately from deployment completion. A busy update or backup lock
means the update is pending. Unavailable remote evidence leaves deployment verification blocked and
the rollout unverified; neither state establishes successful deployment.

The following workflow improvements are proposals, not implemented behavior:

- Define the Development acceptance checks that must pass before selecting a deployment revision,
  using the existing verification workflow.
- Classify changes before building or restarting, with explicit rules for runtime configuration,
  migrations and dependency changes.
- Reuse complete verified immutable image sets and measure build, rollout and health-check durations
  before choosing further optimizations.
- Define and test recovery against retained images and a disposable database restore, including
  migration compatibility and the failure-latch procedure.

Keep source synchronization, CI success, deployment verification and recovery evidence distinct.
These proposals do not authorize changes to the running updater, automatic recovery or removal of
retained data.

### Operator cutover from overlays

This is a one-time migration only for installations whose units or updater still use the old Compose
overlays or generated image YAML. Ordinary updates after that migration follow
[Demo deployment](#demo-deployment) and the
[automatic update completion criteria](#automatic-demo-updates); they do not repeat this cutover.

The repository replacement does not update an existing server's user units or updater. Before its
next source update, pause the Demo update timer and wait for the current update operation and shared
backup lock to settle. Inspect the existing `spellbook-site.service`, `spellbook-demo.service`,
update service/timer, receipt and generated image override in private operator storage. Preserve
their source revision, actual image IDs, project names, volume names, ingress network and aliases.
Do not stop containers merely to change configuration references.

Update the connector unit to run `pnpm compose site up` and `pnpm compose site down` from its
existing checkout. Update the Demo unit to use `pnpm compose demo up` and `pnpm compose demo down`
with the selected `DEMO_IMAGE_REVISION`. Preserve unit dependencies, working directory, runtime path
and graceful shutdown behavior. The site unit must never enable the application or Catalog profiles.
The external network already exists on an established server; retain it unchanged.

Replace the updater's old file list and generated candidate/current/previous image YAML writes with
explicit launcher calls. After the existing clean-main, expected-remote, newest successful push-CI
and fast-forward checks, capture the full selected SHA. Run
`pnpm compose demo build --revision FULL_SHA` only for new images; adopt existing tags without
rebuilding. Read selected configuration privately through
`pnpm compose demo config --revision FULL_SHA` when the updater needs database/origin metadata.
Retain its host/update locks, pre-update database export, failure receipt, previous revision and
public publication checks. Before restarting the Demo unit, atomically select the new full
`DEMO_IMAGE_REVISION` in the existing protected `.env` without rewriting other values or file
permissions. A failure must retain its failure latch and previous revision; recovery selects the
previous existing immutable images without rebuilding. Retire generated image YAML only after all
unit/updater readers have migrated and its revision/image information is retained in the existing
receipt. Do not leave a compatibility overlay or fall back to the old Compose names.

Reload the user manager after editing units, then perform the separately authorized rollout. Verify
actual image IDs for every running application and the completed `db-migrate` container against the
selected tags. Check public API health, authenticated Demo login/read/logout, unchanged
Catalog/Price publication pointers and retained database/Scan volumes. Confirm the connector still
has the same project, ingress network and target aliases, with Production and Development still
stopped. Only then resume the update timer. For installations still using overlays, these are
migration dependencies; this document does not establish that a target has completed them.

## Prepare a shared UI development session

Use the Demo stack above for UI review with PostgreSQL and the bundled English Catalog.

Sign in at `/auth/login` with the documented Demo credentials. Review Dashboard, Search/Card
details, Inventory and Decks, then Settings against the
[interface acceptance criteria](../product/specification.md#interface-acceptance). Use desktop and
narrow layouts, keyboard navigation, and pending/error states. The
[UI direction](../product/ui-design-direction.md) owns shared controls, brand and scrolling
behavior. Record the selected journey and concrete rough edges before agreeing on a useful
implementation slice with the maintainer.
[Issue 214](https://github.com/KyleDerZweite/spellbook/issues/214) owns the later polish scope and
[issue 168](https://github.com/KyleDerZweite/spellbook/issues/168) owns its deferred implementation.
The landing page and paused Scan presentation retain their existing scope.

The Demo bundle supports Catalog search, Inventory and the starter Deck without provider
credentials. It does not establish fresh market prices, live provider ingestion, production database
access or production recognition. Card images still use remote Scryfall URLs. Use a separate
disposable target for mutating integration tests so they cannot overwrite the shared review session.
Production connection, provider refresh, deployment and owner design acceptance retain their
separate authorization and verification.

## Independent build and start

Python distributions and web build independently:

```sh
uvx --from uv==0.12.23 uv build --project backend/core
uvx --from uv==0.12.23 uv build --project backend/api
uvx --from uv==0.12.23 uv build --project backend/workers/state
APP_ORIGIN=http://127.0.0.1:3000 fnm exec --using 26.10.0 pnpm --dir frontend build
```

API wheels and sdists bundle the unchanged 25 SQL migrations, journal, historical snapshots, OpenAPI
and four canonical Demo assets. Installed console entrypoints need neither the checkout's TypeScript
source nor Node server tooling. Web builds without database credentials or a running API. Svelte
adapter-node 6 uses Vite's build-time `paths.origin` from `APP_ORIGIN`. Build with the exact public
scheme, host and port; rebuild when it changes. Runtime `ORIGIN` cannot correct a mismatched build
and is not part of this procedure.

With protected database/storage configuration in root `.env`, start the backend process group, then
web in another terminal:

```sh
APP_ORIGIN=http://127.0.0.1:3000 API_HOST=127.0.0.1 API_PORT=3001 \
API_TRUSTED_PROXY_ADDRESSES=127.0.0.1,::1 \
fnm exec --using 26.10.0 pnpm start

APP_ORIGIN=http://127.0.0.1:3000 API_INTERNAL_URL=http://127.0.0.1:3001 \
HOST=127.0.0.1 PORT=3000 BODY_SIZE_LIMIT=12M fnm exec --using 26.10.0 node frontend/build/index.js
```

`pnpm start` runs the migrator before API, State, Catalog and Scan. Its local Scan URL defaults to
`http://127.0.0.1:8080` and must identify a loopback worker owned by that process group. Use
independent service commands when the worker is remote. For separately managed services, run
`spellbook-migrate` once, then `spellbook-api`, `spellbook-state-worker`, `python -m worker.main`
and `uvicorn scan_worker.main:app` from their installed package environments. Those Python commands
do not load `.env` implicitly. Never start a second scheduler owner alongside an active Node runtime
during a production transition.

API defaults to `127.0.0.1:3001`; `API_HOST` accepts explicit IP bind addresses, including container
`0.0.0.0`. Its image defaults to `0.0.0.0`, while Compose shares web's network namespace and
explicitly selects loopback. The host requires `DATABASE_URL`; only explicit
`API_DISCOVERY_ONLY=true` starts resource-free schema discovery. Use `spellbook-api` to retain
admission closure and SSE shutdown before Uvicorn drain. The host settles requests, streams,
password work and Scan adapters before closing its pool. It trusts forwarded client addresses only
from `API_TRUSTED_PROXY_ADDRESSES`.

[Repository verification](./github-automation.md#python-api-and-core) owns package and real
integration checks. Final-head PostgreSQL/HTTP/browser, scheduled worker, S3/provider and container
shutdown evidence remains with Root and the operational owner. Source builds do not establish
deployment. Android retains its [separate build and run instructions](../../android/README.md).

## PWA installation and QR use

Serve the application and its API from the same HTTPS origin outside localhost. A phone visiting a
private LAN HTTP address does not have the localhost camera/service-worker exception. Set
`APP_ORIGIN` to that public HTTPS origin for the web build and API runtime. Rebuild web and restart
the API when it changes. `API_INTERNAL_URL` points web to the private API destination. The PWA needs
no external QR service.

Apply [migration 0024](../../backend/drizzle/0024_qr_authorization.sql) with the existing migrator
before starting QR-capable code. It adds authorization challenges; existing accounts, passwords and
sessions remain valid.
[Authentication](../architecture/auth.md#pwa-and-qr-sign-in-implementation-contract) owns
five-minute expiry, one-use redemption and session revocation.

The accepted install/use journey is:

1. Open `/app` on the intended Spellbook instance. Use its install action when offered, or the
   browser's Install app/Add to Home Screen menu. Launch the installed app to return to `/app`.
   Existing account and workspace links remain available without installation.
2. Sign in on the phone. In the new browser, open `/auth/login` and request its QR alongside the
   password form.
3. On the phone, open `/app/connect`. Start the camera and grant permission, or enter the
   same-instance approval link/public request code manually. Camera denial or lack of support leaves
   manual entry available.
4. Check the signed-in username, instance origin and request code prefix on `/auth/approve`. Read
   the access warning, then explicitly approve or deny. Scanning alone grants no session. Approval
   lets the requesting browser receive its normal session cookie.
5. Start a new request after expiry, denial or a consumed request whose successful response was
   lost. QR requests last five minutes. Password sign-in remains available.

Installation is online-first. Only immutable JavaScript/CSS, existing public icons/logo and
`offline.html` enter the service-worker cache. Account/API/auth/QR responses and card artifacts
remain network-only. A network navigation failure displays public reconnect guidance; HTTP error
responses retain their original behavior. There are no offline account writes or MTG recognition
assets. When an update is waiting, save drafts and choose the explicit reload action.

These steps describe the accepted delivery. The PWA pages and navigation are implemented. Deployed
HTTPS and physical Android acceptance remain separate from implementation checks.
[PWA/QR verification](./github-automation.md#pwa-and-qr-verification) owns target checks. A future
Jetson may use device-kind QR requests to obtain an ordinary bearer session; this deployment adds no
hardware enrollment, machine control or synchronization protocol.

## Manual Demo Catalog update

Update the versioned English Demo baseline manually when selecting a new source bundle. It is not a
daily provider refresh. The implemented publisher retains old Catalog generations and all Price
pointers; guarded local Demo import and private-state preservation are verified with
[slice 19](https://github.com/KyleDerZweite/spellbook/issues/192).
[Catalog](../architecture/catalog.md#storage-and-publication) owns bundle identity, counts and
freshness semantics. [Demo setup](./local-auth.md#demo-mode) owns disposable database and private
reset requirements.

1. From the repository root, build from the selected local default bulk export with the native
   Worker transform:

   ```sh
   python3 backend/scripts/demo/build-catalog.py data/<default-export>.jsonl backend/scripts/demo/catalog-default-en-<date>.jsonl.gz --version <explicit-UTC-bundle-version>
   ```

2. Review source hash, native transform version, count/exclusion provenance, all starter identities
   and artifact integrity tests. Update the manifest filename in Core `operators/fixtures.py`, API
   packaging inputs and the frontend test fixture, plus pinned fixture counts deliberately. Format
   the manifest with the existing frontend Prettier. Keep the compressed bundle and its manifest
   together.
3. Verify the protected target is the intended migrated disposable Demo database. On an empty
   target, run `pnpm demo:seed` without `--reset-users` to bootstrap the bundle. Existing active
   Catalogs are preserved; refresh hosted Catalogs through the full Worker command below. Inspect
   the active Catalog generation and verify Search, starter identity coverage and preserved private
   state.

The importer rejects a compressed hash mismatch before publication. Decoding, payload integrity or
SQL failure rolls back the entire seed transaction under the existing publisher lock. A valid
already-active bundle leaves its pointer and timestamp unchanged. The explicit bundle version and
local export filename do not establish Scryfall or Price freshness.

## Workspace image ownership

[Root package.json](../../package.json), [pnpm-workspace.yaml](../../pnpm-workspace.yaml) and
[pnpm-lock.yaml](../../pnpm-lock.yaml) own Node workspace install policies and the package-manager
pin. Frontend-scoped install commands still resolve this frozen root workspace. Keep the root
manifests and `frontend/`, `backend/`, `contracts/` and `scripts/` in the image build context.

The [frontend Dockerfile](../../frontend/Dockerfile) builds only web and contracts sources and
checks client output. Its production dependency graph excludes backend, pg, Drizzle and AWS; web
receives no database or storage secrets. Runtime starts `node frontend/build/index.js` from `/app`.
The [API Dockerfile](../../backend/api/Dockerfile) installs frozen Python API/Core wheels and starts
`spellbook-api`. Compose's one-shot `db-migrate` service uses that same image with the explicit
`spellbook-migrate` entrypoint. The independent
[State image](../../backend/workers/state/Dockerfile) owns only state scheduling. API/State image
contexts are the repository root; Catalog/Scan retain package-root contexts.

## Services and startup

| Service        | Responsibility                                                        |
| -------------- | --------------------------------------------------------------------- |
| `postgres`     | Accounts, inventory, decks, scan metadata, and the public catalog     |
| `db-migrate`   | One-shot Python migrator with preserved SQL/ledger                    |
| `worker`       | Scryfall catalog ingestion and synchronization                        |
| `frontend`     | SvelteKit rendering, forms and same-origin streaming API proxy        |
| `api`          | Python HTTP authentication, use cases, database and resource lifetime |
| `state-worker` | Scheduled ValueHistory jobs                                           |
| `scan-worker`  | Scan API scaffold that returns no matches                             |
| `newt`         | Independent site connector or configured Development tunnel           |

`postgres` has a compose health check. `db-migrate` waits for healthy Postgres, and the API, State
and Catalog workers wait for successful migration completion. Web can start before API readiness and
returns explicit unavailable responses while it is absent. Other dependencies require service
startup, not readiness. The catalog worker also retries database schema readiness with backoff. No
vector database is required.

After building the selected clean revision, `pnpm compose production up` runs migrations and starts
the Catalog worker. The worker immediately imports the configured Scryfall bulk source into
PostgreSQL, then repeats on the configured interval, daily by default. Scryfall does not require an
application credential. Operators do not import the shared catalog for individual accounts. The
first publication may still be in progress after the frontend starts, so search can be empty until
the worker completes. Check the worker logs and active generation as described in
[catalog migration and recovery](#catalog-migration-and-recovery). The worker has no HTTP readiness
or import-status endpoint.

Production Compose runs migrations before starting Catalog. The Demo Compose stack seeds missing
Demo data and exposes a separate opt-in Catalog worker. The standalone Development migrator omits
Demo seeding. Explicit [Demo setup](./local-auth.md#demo-mode) publishes the versioned searchable
English bundle without a Scryfall download. Its private Precon starter remains separate;
[Demo setup](./local-auth.md#demo-mode) owns the selected composition and guarded replacement of the
previous fixture. Neither workflow downloads Catalog card image files.

Hosted and configured Development stacks publish no host ports. Standalone publishes frontend only
on loopback. Web listens on container port 3000 and Newt reaches `frontend:3000` through the private
Compose network. The API shares the frontend network namespace and binds only `127.0.0.1:3001`; it
has no published port. Web forwards `/api/*` and `/openapi.json` to it. Configure external
same-origin ingress through the independent server connector or Development tunnel. Direct API tests
use their own loopback listener, without broadening production ingress.

For an existing PostgreSQL 17 deployment, complete the
[database dump/restore upgrade](./postgres-upgrade.md) before starting migrations or API writers.
The new `postgres18_data` volume is initially empty; the original `postgres_data` volume remains
available for rollback.

1. Copy `.env.example` to a private `.env` and replace the `PROD_POSTGRES_*` database credentials.
2. Set `PROD_APP_ORIGIN` to the externally reachable application origin.
3. Select `PROD_IMAGE_REVISION`, build with `pnpm compose production build`, then run
   `pnpm compose production up`.
4. Inspect migration and worker logs, then register a local account. Enroll existing accounts using
   [local authentication operations](./local-auth.md).

Use `pnpm compose site up` for the independent stable connector and the configured external ingress
network. Development owns its separate Newt connector. The tunnel transports requests; local
authentication owns login.

## Configuration

The table lists runtime/native variable names. Configured launchers and Compose files read their
`PROD_*`, `DEMO_*` or `DEV_*` source keys from the single `.env` and map them to these runtime
names. For native Vite on localhost, override `DEV_APP_ORIGIN` with the local origin rather than the
hosted Development origin.

| Variable                                            | Meaning                                                                                                                                                   |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DEV_APP_ORIGIN`                                    | Configured Development origin. The no-.env launcher sets the local origin; explicitly requested native Vite defaults to `http://localhost:5173`.          |
| `DEV_LOCAL_PORT`                                    | Local Development frontend port, default `3000`. Set it in the shell when no root `.env` exists.                                                          |
| `APP_ORIGIN`                                        | Public Origin compiled into web and supplied to API at runtime for Origin checks, QR URLs and secure cookies                                              |
| `API_INTERNAL_URL`                                  | Web-only private API destination; Compose uses `http://127.0.0.1:3001`                                                                                    |
| `API_HOST`, `API_PORT`                              | API listener, default `127.0.0.1:3001`; keep private                                                                                                      |
| `API_TRUSTED_PROXY_ADDRESSES`                       | Explicit comma-separated socket-peer IPs allowed to supply `X-Spellbook-Client-Address`; empty trusts none                                                |
| `ADDRESS_HEADER`, `XFF_DEPTH`                       | Web ingress client-address configuration; leave the header empty until proxy trust is configured                                                          |
| `BODY_SIZE_LIMIT`                                   | Web transport limit; launcher, HTTP harness and web image default to `12M`, preserving explicit overrides. API transport defaults to 12 MiB independently |
| `DEMO_MODE`                                         | Set to `true` only for an explicitly seeded disposable demo. See [demo setup](./local-auth.md#demo-mode).                                                 |
| `VALUE_HISTORY_TIMEZONE`                            | API reporting and State observation timezone, default `Europe/Berlin`; invalid names fail API and State startup                                           |
| `VALUE_HISTORY_ENABLED`                             | State-only strict `true` or `false`, default `true`; disables only observation scheduling                                                                 |
| `DATABASE_URL`                                      | API, Catalog worker or operator PostgreSQL connection; Compose maps its selected prefixed `POSTGRES_*` keys into the internal connection                  |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Database and credentials; replace the example password                                                                                                    |
| `CATALOG_SOURCE`                                    | Scryfall source: `all_cards` by default, or `default_cards`                                                                                               |
| `SCRYFALL_BULK_URL`                                 | Scryfall bulk-data list URL; defaults to `https://api.scryfall.com/bulk-data`                                                                             |
| `SYNC_INTERVAL`                                     | `daily`, `weekly`, or `manual`                                                                                                                            |
| `WORKER_DATA_DIR`                                   | Persistent worker status directory; compose uses `/app/data`                                                                                              |
| `SCAN_WORKER_URL`                                   | API-only internal scan-worker URL; Compose uses `http://scan-worker:8080`                                                                                 |

Native Python commands do not implicitly load `.env`. From `backend/workers/catalog/` or
`backend/workers/scan/`, use `uv run --env-file ../../../.env` before the existing command when its
configuration should come from that file. Production Compose constructs internal database URLs from
`PROD_POSTGRES_*` and sets `DEMO_MODE=false`. Demo uses `DEMO_*`; configured Development uses
`DEV_*`; standalone uses optional `LOCAL_*` keys. Demo sets `DEMO_MODE=true`; Development sets it to
`false` and runs migrations without Demo seeding.

For production Compose, set `PROD_APP_ORIGIN`; for Demo use `DEMO_APP_ORIGIN`, and for Development
use `DEV_APP_ORIGIN`. Native commands continue to accept `APP_ORIGIN`. Changing an origin requires a
new clean image revision, `pnpm compose production build` and `pnpm compose production up` with that
revision and the same public Origin. The backend/migrator build is origin-independent. Updating
runtime variables alone does not change SvelteKit 3's compiled origin.

Leave `ADDRESS_HEADER` empty for direct deployments. Behind a trusted proxy, set it only when that
proxy overwrites the client-address header and direct client access is blocked. For
`x-forwarded-for`, set `XFF_DEPTH` to the trusted hop count. The web proxy overwrites
`X-Spellbook-Client-Address` from its validated `getClientAddress()`. The API honors that header
only from an explicitly listed `API_TRUSTED_PROXY_ADDRESSES` socket peer. It ignores arbitrary
Forwarded/X-Forwarded-For values. Compose and the local launcher explicitly trust their loopback web
peer. Do not trust an externally reachable peer that can supply arbitrary client-address headers.
Keep a shared ingress rate limit for multiple API replicas.

The native launcher and HTTP test harness pass `BODY_SIZE_LIMIT=12M` to web unless explicitly
overridden. The web image uses the same default. When starting a built web application directly, set
`BODY_SIZE_LIMIT=12M` or the intended override; adapter-node otherwise uses its 512 KiB default.
Keep the reverse proxy request limit large enough for the configured adapter limit. API JSON
handlers independently cap streamed bodies at 1 MiB; Scan uploads accept raw image bytes and cap
them at 10 MiB. Raising `BODY_SIZE_LIMIT` does not bypass these application limits. See
[request validation](../architecture/mobile-and-scan.md#request-validation).

OIDC provider variables, `AUTH_SESSION_SECRET`, and all MeiliSearch variables are no longer used.
Browser catalog reads are public; account operations and the versioned integration API require
authentication. Remove obsolete search origins and credentials from deployment configuration.

## Application and native operator ownership

The [Python API host](../../backend/api/src/spellbook_api/main.py) supplies configuration to the
[backend application constructor](../../backend/api/src/spellbook_api/application.py). API owns its
database pool, SavedState, password executor and Scan resources. State owns scheduled runners and
its independent pool. It validates database presence, timezone configuration before acquisition. The
State configuration validates its history enable flag independently. SIGINT/SIGTERM close SSE before
draining HTTP, then await application cleanup and pool closure, including after cleanup failure. Web
owns no backend resource or shutdown/HMR hook.
[The application contract](../architecture/application-contract.md#implemented-application-lifecycle-and-operator-ownership)
owns these interfaces.

Python API owns bounded operator argv/stdin intake and packaged fixtures; Core operator modules own
persistence. The four canonical Demo assets remain unchanged under `backend/scripts/demo/`. Run
operator commands from the repository root through `pnpm db:migrate`, `pnpm operator:password`,
`pnpm demo:seed` and `pnpm demo:replace-inventory`. These commands invoke the installed Python
entrypoints through `scripts/python.mjs`. Replaced frontend forwarders and aliases are removed under
the [interface replacement policy](../../CONTRIBUTING.md#replacing-interfaces).
[Local authentication operations](./local-auth.md) owns target guards, enrollment, recovery and
starter replacement. Migration configuration and SQL/journal/snapshots belong to backend.

## Storage and upgrades

Migration `0005` adds nullable request fingerprints without rewriting existing mutation history. New
conflicting request-ID reuse returns HTTP 409; old null-hash records retain their earlier replay
behavior. The [Postgres contract](../architecture/postgres.md#mutation-replay) owns the details.

[Migration 0012](../../backend/drizzle/0012_deck_contracts.sql) adds Deck Description/composition
revisions and persisted compact acknowledgements, retaining request records after Deck deletion. Run
the existing migrator for the integrated migration history before starting these Deck contracts.
[Postgres](../architecture/postgres.md#deck-persistence-and-reads) owns their persistence semantics.
Existing operator commands, database/image ownership and dependencies are unchanged.

PostgreSQL and worker status use named volumes. Back up account data before migrations and keep a
tested restore procedure. Image versions and runtime pins live in compose, Dockerfiles, and package
manifests. Keep these files and lockfiles together when deploying an update.

Runtime support was reviewed on 2026-10-03. The workers pin
[Python 3.14.8](https://www.python.org/downloads/release/python-3148/), released on 2026-10-01. Its
[release schedule](https://peps.python.org/pep-0745/) provides regular bugfix releases through
October 2027 and security releases through October 2030.
[Python 3.15](https://peps.python.org/pep-0790/) is scheduled for final release on 2026-10-09 and is
not adopted ahead of that release.
[Frontend runtime policy](../architecture/frontend.md#runtime-compatibility) owns Node and framework
compatibility.

PostgreSQL 18 uses the new named volume at `/var/lib/postgresql`, with database files under
`/var/lib/postgresql/18/docker`. The [database upgrade procedure](./postgres-upgrade.md) owns
migration, verification, and rollback for existing PostgreSQL 17 installations.

Scan uploads use only volatile API/worker memory. Neither Compose image has a Scan artifact volume,
and neither environment has S3 storage configuration. The migration removes the two legacy
object-key columns, retaining only session, candidate, review and Inventory metadata. Previously
persisted image files or S3 objects are not automatically deleted by this migration. Operators must
evaluate and clean them up separately, without deleting unrelated data or live database volumes.

A filesystem copy of live PostgreSQL data is not a consistent database backup. Use `pg_dump` and
verify restoration separately. Catalog card image URLs and tracked landing-page images are distinct
from user-uploaded Scan frames. `worker_data` persists `state.json` across container recreation. See
[worker operations and limits](../architecture/worker.md). On SELinux hosts, named volumes avoid
most bind-mount relabeling. Host networking configuration belongs in operator notes rather than the
shared compose file.

## Inventory collation and recovery

[Migration 0011](../../backend/drizzle/0011_inventory_windows.sql) requires PostgreSQL ICU support,
creates deterministic root-locale `inventory_root`, verifies the accepted ordering examples and
records the actual ICU version. Migration failure leaves this capability unavailable; use an
ICU-enabled PostgreSQL installation and rerun the existing migrator before starting bounded
Inventory reads. Demo initialization uses the same revision-aware writers and preserves the tracked
sample.

After a PostgreSQL or ICU upgrade, compare the stored `pg_collation.collversion` with
`pg_collation_actual_version(oid)` for `inventory_root`. If they differ, rebuild every index
dependent on that collation, including `inventory_cards_window_name_idx`, before
`ALTER COLLATION inventory_root REFRESH VERSION`. Coordinate writes and application restart during
this operator maintenance, then verify page/location ordering against the same revision. Refreshing
the version alone does not rebuild indexes. Catalog set-code equality retains its existing default
collation as described in [Catalog](../architecture/catalog.md#printing-and-import-identity).

Apply [migration 0014](../../backend/drizzle/0014_inventory_contracts.sql) with the existing
migrator before starting the updated Inventory mutation application. The integrated journal applies
it after 0013 SavedState, following 0011 Inventory windows and 0012 Deck contracts. It adds nullable
JSONB original acknowledgements to Inventory mutation requests without fabricating or backfilling
old receipts. [Postgres](../architecture/postgres.md) owns the legacy policy.

## Saved-state streaming

Apply [migration 0013](../../backend/drizzle/0013_saved_state.sql) with the existing migrator before
starting SSE-capable replicas. The integrated migration journal applies it after 0011 Inventory
windows and 0012 Deck contracts. It adds commit notification triggers, not table columns. Reserve
one additional PostgreSQL listener connection per API process beyond request pools. Web has no
database connection. No new synchronization provider or sticky-session configuration is required.

The public proxy, web forwarding and API `/api/v1/account/events` path must pass
cookies/Authorization, disable response buffering and caching, permit long-lived streaming and use
an idle timeout longer than the fifteen-second heartbeat. Changing public `APP_ORIGIN` still
requires origin-matched builds. Keep credentials out of URLs. Test a live stream through the actual
proxy/tunnel before rollout. Local controlled proxy/socket tests do not establish deployed proxy
behavior or deployment acceptance.
[The application contract](../architecture/application-contract.md#saved-state-synchronization) owns
recovery/expiry; [verification](./github-automation.md) owns the reproducible two-process test.

## Catalog migration and recovery

Apply [migration 0018](../../backend/drizzle/0018_inventory_set_directory.sql) with the existing
migrator to add the generation/set/UUID index used by complete Inventory set choices. It preserves
Catalog and private account rows and requires no publication or application rebuild. Index creation
runs in the normal migration transaction and can wait for concurrent Catalog writers; schedule it
with the existing migration procedure.
[Catalog](../architecture/catalog.md#printing-and-import-identity) owns the lookup and collation
contract.

Apply [migration 0019](../../backend/drizzle/0019_catalog_color_identity.sql) after 0018 before
starting the updated Catalog reader. It derives the stored color-identity projection from existing
documents. The same migration transaction creates the generation/mask index and initializes the new
column's planner statistics. This table rewrite can wait for Catalog writers, so use the existing
migration maintenance procedure. Catalog publications, source metadata and private rows remain
unchanged. No Worker change or Catalog rebuild is required.
[Catalog](../architecture/catalog.md#search-behavior) owns the filter and projection contract.

Migration `0006` creates the catalog tables and `pg_trgm` extension. The migration database role
must be allowed to create that extension, or an administrator must provision it first. After
migration, the worker imports the configured Scryfall source automatically. A new deployment needs
no manual catalog import or MeiliSearch export. Existing account data, decks, and inventory stay in
their application tables.

When upgrading from a deployment that still runs the former MeiliSearch service, stop that old
container using its previous compose configuration or observed container name. The current stack
does not manage it, so it may remain running after the upgrade. Its volume is not used by
PostgreSQL. Keep it until the PostgreSQL catalog is verified. Do not remove database volumes when
rebuilding catalog data.

After migration, inspect the active catalog through the existing protected database connection:

```sql
SELECT g.id, g.source_type, g.source_updated_at, g.document_count, g.published_at
FROM catalog_state s
JOIN catalog_generations g ON g.id = s.active_generation
WHERE s.id = 1;
```

A published row with a positive document count indicates catalog publication. The frontend can start
before first publication and return empty search results. `worker_data/state.json` records the last
publication or failed synchronization attempt. Skipping an unchanged catalog does not update it; an
earlier error can remain in that file. It is not a health endpoint or the publication authority.
Inspect worker logs and the active generation to verify the catalog. Test public browser search and
authenticated mutations before opening a fresh deployment to users.

Use `daily` or `weekly` for the persistent compose worker. Reserve `manual` for the one-shot command
below; the service restart policy would otherwise restart the completed process. To rerun
synchronization once, stop the scheduled worker and run:

```sh
pnpm compose production stop worker
PROD_SYNC_INTERVAL=manual pnpm compose production run worker
```

An unchanged, already-published snapshot is skipped. To force a fresh transformation of the same
source timestamp, keep the worker stopped and run this transaction through the protected database
connection before the manual command:

```sql
BEGIN;
SELECT pg_advisory_xact_lock(1936747619, 1);
UPDATE catalog_generations
SET schema_version = 0
WHERE id = (SELECT active_generation FROM catalog_state WHERE id = 1);
COMMIT;
```

This invalidates the publication marker without removing the readable generation. A failed rebuild
leaves that catalog available. Confirm the new publication and restart the scheduled worker with
`pnpm compose production up worker`.

To restore the previous retained Catalog/Price pair, stop the Worker and run:

```sh
pnpm compose production run worker uv run --no-sync python -c 'import os; from worker.catalog import CatalogPublisher; CatalogPublisher(os.environ["DATABASE_URL"]).restore_previous()'
```

The command verifies a retained recorded pair and swaps both pointers under the publisher lock in
one transaction. Missing recovery data fails without changes. Verify Catalog search and reference
reads. Keep the Worker stopped until the source or transformation problem is corrected; another sync
can otherwise publish the newer snapshot again. Only current/previous public views are retained.
[Catalog architecture](../architecture/catalog.md) owns reader guarantees.

## Scryfall price upgrade

Stop the scheduled Worker, then use the existing migrator to apply the coherent journal in order:
0014 Inventory acknowledgements, then 0015 public price references. Both migrations preserve
existing account rows. Start the upgraded Worker and reference reads only after 0015 completes. A
matching Catalog timestamp alone no longer skips initial price activation: successful paired
publication and extraction/mapping versions are required. Existing daily/manual import commands
remain unchanged. Inspect price_state joined to price_publications for source time, digest/version,
active/previous IDs and safe refresh health. All-null amounts can be a successful publication.

Restore Catalog and Price together using the paired command above. Stop the scheduled Worker and
invoke CatalogPublisher.restore_previous through the existing protected DATABASE_URL. This locks
publication, verifies the retained pair exists and swaps both pointers atomically; no recoverable
pair raises an error without changes. Verify public reference reads and Catalog search before
resuming synchronization. Never infer source dates from downloaded filenames or attach today's
descriptor to an older saved payload. Current/previous public views are bounded; later personal
snapshots preserve trusted evidence independently.

## Optional public price upgrade and recovery

Stop scheduled ingestion and apply the coherent migrator prefix through 0016, then 0017 before
starting the upgraded application/Worker. Existing private tables and rows are preserved. Set
`CARDMARKET_PRICES_ENABLED=true` or `MTGJSON_PRICES_ENABLED=true` to opt into the official public
feeds; both default to false. No key or account is required. Existing daily/manual Worker commands
remain unchanged. Optional views and safe health are inspected through optional_price_state joined
to optional_price_publications; source dates and digests come from original artifacts, never
filenames or transfer timestamps.

Resource overrides are validated positive integers: `PRICE_COMPRESSED_BYTES`,
`PRICE_DECOMPRESSED_BYTES`, `PRICE_RECORD_BYTES`, `PRICE_PROGRESS_SECONDS`, `PRICE_CONNECT_SECONDS`,
`PRICE_DOWNLOAD_SECONDS`, `PRICE_PARSE_SECONDS`, `PRICE_PUBLICATION_SECONDS`, `PRICE_IMPORT_SECONDS`
and `PRICE_STAGING_BYTES`. [`.env.example`](../../.env.example) lists all ten native defaults, and
Compose forwards those settings to Worker.
[Worker](../architecture/worker.md#optional-public-price-synchronization) records bounds and failure
ownership. Exceeding a bound rolls back the provider, while other providers still attempt their
refresh.

For optional recovery, stop the scheduled Worker and call OptionalPricePublisher.restore_previous
with `Cardmarket` or `MTGJSON` through the existing protected DATABASE_URL. It verifies a
recoverable previous view and swaps only that provider's pointers under the native lock. It does not
restore or synthesize account history, or rewrite recorded source-history corrections. Scryfall
continues to use its paired Catalog/Price recovery. Verify public/private reference reads before
restarting ingestion.
[Valuation](../architecture/valuation.md#optional-references-and-public-source-history) owns
evidence retention and selection.

## Personal value history upgrade

Apply the coherent migration journal through
[0020](../../backend/drizzle/0020_inventory_value_history.sql) before starting the upgraded
application. It adds private daily checkpoint/evidence tables and `values` notification triggers.
Existing Inventory writes and account rows remain unchanged. No historical backfill runs.

The State worker starts the Backend Valuation runner when `VALUE_HISTORY_ENABLED=true`. State
shutdown closes its schedulers before its pool. Set the flag to `false` on State to stop observation
scheduling. API history reads remain available independently of that flag. Configure
`VALUE_HISTORY_TIMEZONE` with a valid IANA name for API reporting and State observations. Saved
observations retain their own timezone and UTC boundaries after configuration changes.
[Valuation](../architecture/valuation.md#reviewed-personal-history-contract) owns lease, observation
window and closure rules.

The Demo launcher uses static example references and seeded illustrative history rather than live
price publication. The explicitly requested native process launcher starts the configured
Catalog/Price worker; `SYNC_INTERVAL=manual` still attempts its initial refresh. A running capture
timer does not establish provider refresh or known-price coverage. Operator refresh, actual midnight
observation, deployment and owner acceptance require separate evidence. The remaining integration
verification is tracked with [slice 19](https://github.com/KyleDerZweite/spellbook/issues/192).

## Environment update and reset interface

Configured environments use one ignored root `.env` per checkout with `PROD_*`, `DEMO_*` and `DEV_*`
source keys. Compose constructs internal URLs exclusively from the selected environment keys.
Production, Demo and the stable connector use `compose.prod.yml` through their explicit launcher
mode. Configured Development uses `compose.dev.yml`; no-configuration self-hosting uses
`compose.yml`. Development defaults to `spellbook_dev`, without the disposable reset suffix. Hosted
environments publish no host ports. Local Development publishes its frontend on loopback and needs
no `.env`. No additional private environment files are required. Build web with the selected
environment's origin before recreation. Migration is ledger-idempotent; Demo seed preserves existing
private state and active public publications. See the
[reviewed private reset contract](./local-auth.md#reviewed-environment-and-private-reset-contract).

Demo follows successful main CI automatically through deployment-owner automation. Production later
follows approved releases and stays disabled until deliberate first activation. This repository
change does not install that automation or select a registry.

For a full public Demo Catalog refresh, run the existing one-shot Worker:

```sh
pnpm compose demo run worker
```

It uses `all_cards` and the existing transactional Catalog/Price publisher. For Development, use
`compose.dev.yml` with private `.env`, or `compose.yml` without `.env`. Use project
`spellbook-dev-local` without `.env`, or `spellbook-dev` with the configured `.env`. The one-shot
Worker is outside ordinary startup; schedule refresh separately from private reset. Never download
bulk data or card images into Git.

For an explicitly disposable Demo target, stop API and State writers, then run:

```sh
pnpm compose demo run db-migrate env DEMO_RESET_DISPOSABLE=true /app/backend/api/.venv/bin/spellbook-demo-seed --reset-users
```

Resume writers after successful completion and verify a fresh `demo/demo` login. A nonzero exit
requires inspection before resuming maintenance automation. Check the active Catalog generation and
Price pointers before and after maintenance; the private reset must preserve them. Use the existing
API health check, migration exit status, Worker logs and active publication SQL as separate signals.
An HTTP health response alone does not establish Catalog completeness or provider freshness. No
reset timer or live operation is authorized by these commands.
