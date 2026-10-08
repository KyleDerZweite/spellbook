# Postgres

- Status: Canonical
- Last Reviewed: 2026-10-08
- Source of Truth: code
- Update Triggers: schema changes, migration changes, repository changes, auth ownership changes, request fingerprints and replay behavior, profile preferences, card definitions and totals, workspace ownership and compatibility adapters, Inventory revisions, bounded reads and ICU ordering, Deck revisions, acknowledgements and bounded ownership queries, SavedState notification triggers, private value checkpoints and frozen evidence, public price publication and retention, Oracle Tags publications and raw facts, entry category bundles/decisions and receipts, immutable account definitions and relational preview retention
- Related Docs: [System Overview](./system-overview.md), [Auth](./auth.md), [Mobile And Scan](./mobile-and-scan.md), [Deployment](../operations/deployment.md), [ADR-0005](../decisions/0005-postgres-core-data-and-separated-play-app.md), [Local authentication](../operations/local-auth.md), [Application contract](./application-contract.md), [Valuation](./valuation.md), [Category rules](./category-rules.md)

PostgreSQL stores account-owned application state, the public Scryfall catalog and public price references.

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
- `price_publications`
- `price_printings`
- `price_observations`
- `price_state`
- `inventory_value_days`
- `inventory_value_holdings`
- `inventory_value_references`
- `catalog_oracle_facts`
- `category_library_state`
- `category_definition_origins`
- `category_definition_versions`
- `category_change_previews`
- `category_preview_differences`
- `category_mutation_requests`
- `deck_category_bundles`
- `deck_entry_category_decisions`
- `oracle_tag_closure`
- `oracle_tag_memberships`
- `oracle_tag_publications`
- `oracle_tag_state`
- `oracle_tags`

Additive migration [0016](../../frontend/drizzle/0016_deck_entry_categories.sql) adds the category/source tables. [Category rules](./category-rules.md) owns their publication, adopted-bundle and immutable decision semantics.

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
- additive migration `0010_inventory_groups.sql` adds account-inventory groups and cascading entry memberships; the group repository scopes every mutation to the authenticated inventory and serializes membership replacement by locking the Inventory parent before the entry and groups
- the Python worker publishes public printing metadata using the [catalog generation contract](./catalog.md)
- scan binary artifacts remain in object storage, not Postgres

## Current Access Pattern

- backend Catalog, Auth, Profile, Dashboard, Inventory, Deck and Valuation use Drizzle ORM and `pg` through frontend server composition; remaining SvelteKit feature repositories use explicit compatibility adapters
- browser pages load user data through server load functions and route actions
- optional mobile API endpoints call the same repository functions as web routes
- repository functions enforce ownership by internal Spellbook `accountId`
- the backend Profile use case reads account-scoped MTG totals directly from `inventory_cards` and `decks` without creating inventory rows or calling the catalog worker
- profile totals count owned quantities, distinct canonical card IDs, distinct printing IDs, distinct set codes, foil quantities, and decks; a totals read failure leaves profile customization available
- the backend Profile use case reads the saved card independently of totals and validates it against the shared definition; [authentication](./auth.md) owns Settings validation, default handling and atomic preference updates

## Public price persistence

[Migration 0015](../../frontend/drizzle/0015_scryfall_prices.sql) adds four public price tables and initializes the singleton pointer row. It preserves existing account and Catalog tables. [Valuation](./valuation.md#implemented-market-references) owns paired publication, exact observations, independent retention and trusted frozen-reference evidence. Worker ingestion never reads or writes private holdings.

## Inventory read and write consistency

[Migration 0011](../../frontend/drizzle/0011_inventory_windows.sql) adds bigint Inventory and Notes revisions, ICU root ordering and a name/set window index. The [application contract](./application-contract.md#inventory-query-contract) owns page ordering, metadata and revision resets. Backend page/detail/location reads use one repeatable-read, read-only snapshot scoped to the trusted actor and MTG, including counts, memberships and catalog-derived set metadata. An absent Inventory returns empty data without creating a parent.

Inventory SQL counts, copy sums, group totals, set progress and location indexes remain exact text until the shared [integer decoder](../../backend/src/db/numbers.ts) validates a nonnegative safe JSON integer. Unsupported ranges fail explicitly instead of narrowing to signed 32-bit values or rounding through floating-point SQL casts. [The HTTP contract](./mobile-and-scan.md#bounded-inventory-http-reads) owns the controlled failure response. Per-entry quantity limits are unchanged.

The backend [mutation owner](../../backend/src/inventory/mutations.ts) uses the shared [Inventory helper](../../backend/src/inventory/write.ts) after Profile/account locking and session revalidation. Scan locks its session before Inventory; sorted target entries precede Groups. Catalog resolution uses no nested connection under those locks. Semantic changes advance the Inventory revision once per transaction; no-ops and receipt replays do not. Notes has an independent stored revision and stale-text guard. Ordinary entry changes keep sparse positions; only explicit reorder may scan/rewrite their ordering. [Migration 0014](../../frontend/drizzle/0014_inventory_contracts.sql) adds nullable JSONB original acknowledgements without backfilling fabricated history. [The application contract](./application-contract.md#inventory-query-contract) owns replay, legacy receipt treatment and lock order. [Deployment](../operations/deployment.md#inventory-collation-and-recovery) owns ICU preflight and recovery.

## Dashboard summary reads

The backend [Dashboard use case](../../backend/src/profile/dashboard.ts) revalidates its trusted actor and reads account-scoped MTG summaries in one repeatable-read, read-only transaction. SQL computes copy/card/printing/set/foil/deck totals and quantity-weighted set, finish and condition distributions. Finish/condition results retain explicit zero buckets. Per-deck SQL allocates exact printing quantities before alternate copies of the same canonical card, independently for each deck.

The DTO contains complete summary distributions and deck availability totals, plus at most eight recent entries ordered by `updated_at DESC, id`. It maps `updatedAt` to ISO strings and never transfers the full Inventory or mutation-request history. A savepoint isolates unavailable scan-count reads, returning `pendingScanReviews: null` while retaining other summaries. Profile totals also remain aggregate reads; unavailable totals do not block profile-card customization.

SQL keeps quantity sums as exact numeric aggregates rather than narrowing account or deck totals to signed 32-bit integers. The backend [integer decoder](../../backend/src/db/numbers.ts) converts results to JSON numbers only within the safe integer range; summary counts must also be nonnegative. Larger reporting totals fail explicitly instead of rounding. This does not change stored quantities or their per-entry limits. [Authentication](./auth.md#account-http-contract) owns the HTTP failure and Profile fallback responses.

## Deck persistence and reads

[Migration 0012](../../frontend/drizzle/0012_deck_contracts.sql) adds independent `description_revision` and `composition_revision` bigint columns to Decks and a JSONB acknowledgement to Deck mutation requests. It replaces the request record's Deck foreign key with an account foreign key: records survive Deck deletion and cascade with account deletion.

The backend [Deck application](../../backend/src/decks/application.ts) reads library totals/covers, selected composition and relevant owned-printing aggregates in a repeatable-read, read-only transaction. SQL restricts Inventory aggregation to the selected canonical identities. Search/inspector ownership accepts at most 100 canonical identities. Exact SQL sums pass through the shared integer decoder with a nonnegative check; unsupported JSON integer ranges fail instead of rounding. The backend [canonical quantity helper](../../backend/src/decks/availability.ts) sums across printings with bigint and validates the safe JSON range before returning ownership DTOs to printing selectors, selected Decks or search. Per-entry limits remain unchanged. Dashboard retains its separate backend summary owner.

Writes lock the account profile and revalidate the session inside the transaction, then serialize the Deck operation and request identity. Catalog resolution precedes the write transaction. Semantic entry changes advance composition revision; Description changes advance only their independent field revision. [The application contract](./application-contract.md#implemented-deck-application-boundary) owns delta, merge and draft semantics.

## Saved-state notifications

[Migration 0013](../../frontend/drizzle/0013_saved_state.sql) adds the notification function and AFTER row triggers without changing table columns or existing rows. It requires no new Drizzle schema snapshot. Triggers cover Profile changes, sessions/credentials, Inventory entries/groups/memberships, Decks/cards and Scan sessions/artifacts/review items. Profile updates limited to `last_seen_at` emit nothing. Group ownership derives from the Inventory parent.

PostgreSQL delivers notifications after commit; rollback emits nothing. The payload contains account identity and a coarse topic. Auth is transport control and never becomes a protected browser topic. [The application contract](./application-contract.md#saved-state-synchronization) owns the listener, session barrier and bounded queues. [Deployment](../operations/deployment.md#saved-state-streaming) owns migrator and connection capacity requirements.

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

Inventory and Deck requests store compact original acknowledgements in their mutation transaction. Identical replay returns the stored acknowledgement after later subject changes or deletion; changed normalized intent fails with 409. Legacy Inventory records without acknowledgements return explicit unavailable-history receipts, retaining their stored fingerprint/no-repeat protection. Legacy Deck records retain their documented empty-change behavior. Notes/Description revision checks are separate from request replay. Scan candidate-result replacement is separate from Inventory mutation replay and has no event fingerprint. See [mobile and scan](./mobile-and-scan.md) for wire migration.

Migration 0017 adds independent optional publication/state/mapping/observation tables and normalized public source-history evidence/daily points. These public tables have no Catalog cascade or private account dependency. [Valuation](./valuation.md#optional-references-and-public-source-history) owns selection, 90-day retention and trusted evidence. Run it after the coherent 0016 migration prefix.

## Personal value persistence

[Migration 0020](../../frontend/drizzle/0020_inventory_value_history.sql) adds account/game/date-unique daily headers, identity/condition holdings and deduplicated printing/finish frozen reference evidence. Private evidence has no live Inventory, Catalog or public-price foreign key. Deleting an account removes its private history. Automatic history expiry is absent. The header stores the observation clock, reporting timezone, UTC boundaries, Inventory revision, policy version and exact estimate. Its constraint restricts observation time to the final 60 seconds. [Valuation](./valuation.md#reviewed-personal-history-contract) owns transactional replacement, runner lease, closure and read semantics.

Migration 0020 also notifies account-scoped `values` after checkpoint commit and emits the strict two-key public `values` invalidation after public price-state changes. Rollback emits neither. [Application contract](./application-contract.md#saved-state-synchronization) owns transport isolation.
