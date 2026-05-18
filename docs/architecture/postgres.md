# Postgres

- Status: Canonical
- Last Reviewed: 2026-05-18
- Source of Truth: code
- Update Triggers: schema changes, migration changes, repository changes, auth ownership changes
- Related Docs: [System Overview](./system-overview.md), [Auth](./auth.md), [Mobile And Scan](./mobile-and-scan.md), [Deployment](../operations/deployment.md), [ADR-0005](../decisions/0005-postgres-core-data-and-separated-play-app.md), [ADR-0006](../decisions/0006-generic-oidc-and-internal-account-identity.md)

Postgres stores user-scoped application state for Spellbook.

## Current Tables

- `user_profiles`
- `auth_identities`
- `inventories`
- `inventory_cards`
- `decks`
- `deck_cards`
- `scan_sessions`
- `scan_artifacts`
- `scan_review_items`
- `inventory_mutation_requests`
- `deck_mutation_requests`

## Current Model Notes

- tables are game-aware through a `game` field
- `user_profiles.account_id` is the internal Spellbook account key
- `auth_identities` maps external auth providers to the internal account key by `provider_type`, `issuer`, and `subject`
- MTG is the only implemented adapter today
- `inventories` and `decks` are the current canonical domain objects
- `inventory_mutation_requests` and `deck_mutation_requests` store per-account `requestId` records for idempotent mobile bulk mutations
- card catalog data remains in MeiliSearch and is populated by the Python worker
- scan binary artifacts remain in object storage, not Postgres

## Current Access Pattern

- SvelteKit server code connects to Postgres through Drizzle ORM and `pg`
- browser pages load user data through server load functions and route actions
- optional mobile API endpoints call the same repository functions as web routes
- repository functions enforce ownership by internal Spellbook `accountId`

## Current Mutation Surface

- inventory creation and lookup
- add/update/remove/reorder inventory cards
- idempotent batch inventory add
- idempotent inventory bulk add, set, decrement, and remove
- create/update/delete decks
- add/update/remove deck cards
- idempotent deck card bulk add, set, decrement, and remove
- create/update scan sessions, artifacts, and review items
