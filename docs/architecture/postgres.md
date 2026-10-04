# Postgres

- Status: Canonical
- Last Reviewed: 2026-10-03
- Source of Truth: code
- Update Triggers: schema changes, migration changes, repository changes, auth ownership changes, request fingerprints and replay behavior
- Related Docs: [System Overview](./system-overview.md), [Auth](./auth.md), [Mobile And Scan](./mobile-and-scan.md), [Deployment](../operations/deployment.md), [ADR-0005](../decisions/0005-postgres-core-data-and-separated-play-app.md), [Local authentication](../operations/local-auth.md)

PostgreSQL stores account-owned application state and the public Scryfall catalog.

## Current Tables

- `user_profiles`
- `local_credentials`
- `auth_sessions`
- `auth_identities`, retained historical provider mappings
- `inventories`
- `inventory_cards`
- `decks`
- `deck_cards`
- `scan_sessions`
- `scan_artifacts`
- `scan_review_items`
- `inventory_mutation_requests`
- `deck_mutation_requests`
- `catalog_generations`
- `catalog_state`
- `catalog_printings`

## Current Model Notes

- inventory, deck, and scan session rows retain an MTG `game` field
- `user_profiles.account_id` is the internal Spellbook account key
- `local_credentials` maps normalized usernames to account IDs and stores password hashes
- `auth_sessions` stores hashed opaque tokens and their expiry
- `auth_identities` retains historical provider mappings but is no longer used for authentication
- MTG is the only implemented adapter today
- `inventories` and `decks` are the current canonical domain objects
- `inventory_mutation_requests` and `deck_mutation_requests` store per-account `requestId` records for idempotent mobile bulk mutations
- the Python worker publishes public printing metadata using the [catalog generation contract](./catalog.md)
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

## Mutation replay

Migration `0005_mutation_request_fingerprints.sql` adds nullable `request_hash` columns to inventory and deck mutation records. New mutations bind an account-scoped `requestId` to a SHA-256 fingerprint of the normalized operation and its kind. Deck imports also bind their metadata and resolved operations. Scan review commits include the session and artifact identifiers; server-generated review-row IDs do not change the fingerprint.

An identical retry has one write effect. Reusing an existing request ID with a different stored fingerprint returns HTTP 409 without applying the changed mutation. Existing rows with a null hash retain their earlier duplicate-suppression behavior because their original payload cannot be reconstructed. The migration does not invent or backfill those hashes.

These records prevent duplicate effects; they do not store a historical response snapshot or provide general editor version checking. Scan candidate-result replacement is separate from inventory mutation replay and has no event fingerprint. See [mobile and scan](./mobile-and-scan.md) for that contract.
