# Postgres

- Status: Canonical
- Last Reviewed: 2026-04-25
- Source of Truth: code
- Update Triggers: schema changes, migration changes, repository changes, auth ownership changes
- Related Docs: [System Overview](./system-overview.md), [Auth](./auth.md), [Mobile And Scan](./mobile-and-scan.md), [Deployment](../operations/deployment.md), [ADR-0005](../decisions/0005-postgres-core-data-and-separated-play-app.md)

Postgres stores user-scoped application state for Spellbook.

## Current Tables

- `user_profiles`
- `inventories`
- `inventory_cards`
- `decks`
- `deck_cards`
- `scan_sessions`
- `scan_artifacts`
- `scan_review_items`
- `inventory_mutation_requests`

## Current Model Notes

- tables are game-aware through a `game` field
- MTG is the only implemented adapter today
- `inventories` and `decks` are the current canonical domain objects
- card catalog data remains in MeiliSearch and is populated by the Python worker
- scan binary artifacts remain in object storage, not Postgres

## Current Access Pattern

- SvelteKit server code connects to Postgres through Drizzle ORM and `pg`
- browser pages load user data through server load functions and route actions
- optional mobile API endpoints call the same repository functions as web routes
- repository functions enforce ownership by Zitadel `accountId`

## Current Mutation Surface

- inventory creation and lookup
- add/update/remove/reorder inventory cards
- idempotent batch inventory add
- create/update/delete decks
- add/update/remove deck cards
- create/update scan sessions, artifacts, and review items
