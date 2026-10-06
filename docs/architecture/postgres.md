# Postgres

- Status: Canonical
- Last Reviewed: 2026-10-07
- Source of Truth: code
- Update Triggers: schema changes, migration changes, repository changes, auth ownership changes, request fingerprints and replay behavior, profile preferences, card definitions and totals, workspace ownership and compatibility adapters
- Related Docs: [System Overview](./system-overview.md), [Auth](./auth.md), [Mobile And Scan](./mobile-and-scan.md), [Deployment](../operations/deployment.md), [ADR-0005](../decisions/0005-postgres-core-data-and-separated-play-app.md), [Local authentication](../operations/local-auth.md), [Application contract](./application-contract.md)

PostgreSQL stores account-owned application state and the public Scryfall catalog.

The backend [schema](../../backend/src/db/schema.ts) owns table definitions, and [database construction](../../backend/src/db/client.ts) owns Drizzle/pg setup. The named [frontend database compatibility adapter](../../frontend/src/lib/server/db/client.ts) injects database/build-analysis configuration and constructs one backend database resource. Frontend composition privately consumes that resource and exports only feature use cases. Raw `db`/`pool` exports stay in the database adapter for exact allowed compatibility consumers. Frontend schema/client modules are compatibility adapters for untouched repositories; the existing [Drizzle migration history](../../frontend/drizzle/) and migration commands remain unchanged.

## Current Tables

- `user_profiles`
- `local_credentials`
- `auth_sessions`
- `auth_identities`, retained historical provider mappings
- `inventories`
- `inventory_cards`
- `inventory_groups`
- `inventory_group_memberships`
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
- `user_profiles.avatar_id` and `artwork_id` store private account presentation preferences; additive migration `0008_profile_artwork.sql` defaults existing artwork selections to `grove`
- `user_profiles.profile_card` stores a nullable typed JSONB card definition; additive migration `0009_profile_card.sql` leaves existing rows null and writes no preset or resolved metric values
- `local_credentials` maps normalized usernames to account IDs and stores password hashes
- `auth_sessions` stores hashed opaque tokens and their expiry
- `auth_identities` retains historical provider mappings but is no longer used for authentication
- MTG is the only implemented adapter today
- `inventories` and `decks` are the current canonical domain objects
- `inventory_mutation_requests` and `deck_mutation_requests` store per-account `requestId` records for idempotent mobile bulk mutations
- additive migration `0010_inventory_groups.sql` adds account-inventory groups and cascading entry memberships; the group repository scopes every mutation to the authenticated inventory and serializes membership replacement by locking the entry
- the Python worker publishes public printing metadata using the [catalog generation contract](./catalog.md)
- scan binary artifacts remain in object storage, not Postgres

## Current Access Pattern

- backend Catalog, Auth, Profile and Dashboard use Drizzle ORM and `pg` through frontend server composition; remaining SvelteKit feature repositories use explicit compatibility adapters
- browser pages load user data through server load functions and route actions
- optional mobile API endpoints call the same repository functions as web routes
- repository functions enforce ownership by internal Spellbook `accountId`
- the backend Profile use case reads account-scoped MTG totals directly from `inventory_cards` and `decks` without creating inventory rows or calling the catalog worker
- profile totals count owned quantities, distinct canonical card IDs, distinct printing IDs, distinct set codes, foil quantities, and decks; a totals read failure leaves profile customization available
- the backend Profile use case reads the saved card independently of totals and validates it against the shared definition; [authentication](./auth.md) owns Settings validation, default handling and atomic preference updates

## Dashboard summary reads

The backend [Dashboard use case](../../backend/src/profile/dashboard.ts) revalidates its trusted actor and reads account-scoped MTG summaries in one repeatable-read, read-only transaction. SQL computes copy/card/printing/set/foil/deck totals and quantity-weighted set, finish and condition distributions. Finish/condition results retain explicit zero buckets. Per-deck SQL allocates exact printing quantities before alternate copies of the same canonical card, independently for each deck.

The DTO contains complete summary distributions and deck availability totals, plus at most eight recent entries ordered by `updated_at DESC, id`. It maps `updatedAt` to ISO strings and never transfers the full Inventory or mutation-request history. A savepoint isolates unavailable scan-count reads, returning `pendingScanReviews: null` while retaining other summaries. Profile totals also remain aggregate reads; unavailable totals do not block profile-card customization.

## Current Mutation Surface

- patch supplied account email/avatar/artwork fields and merge validated card fields under the account lock, preserving omitted values
- inventory creation and lookup
- create/rename/delete inventory groups and replace entry memberships atomically
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
