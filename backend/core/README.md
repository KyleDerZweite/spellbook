# Python application and SQL package

`spellbook_core.mtg` owns MTG Catalog/Inventory/Deck/Category/Valuation/Dashboard/Scan behavior and their DTOs.
Shared `spellbook_core` owns typed session authority, database and migration infrastructure, local credentials/sessions, passwords, QR authorization, SavedState and account preferences.
MTG application modules retain the original receipt, transaction, read and valuation behavior.
`create_local_auth(pool, passwords, demo_mode=False)` extends `SessionAuth` without changing its trusted Actor methods.
`create_decks(pool, catalog, auth, valuation=None)` owns Deck CRUD, bounded Library/category/locate/choices reads, selected snapshots, ownership/search, legality, Arena import/export and entry mutations.
`Decks` exposes the corresponding snake-case application methods, including `add_catalog_card_to_deck`, `change_deck_printing`, `import_into_deck`, `import_deck`, `update_deck_card` and `remove_deck_card` for the web command adapter.
Its Category transaction uses the integrated initialization, merge-preview and whole-Deck job helpers, with Profile locking and live-session rechecks before receipt replay or writes.
Original acknowledgements replay after subsequent edits and Deck deletion.
Unsupported or malformed stored receipts raise a request conflict.
The API's `create_deck_routes(auth, decks, origin)` supplies all nineteen adapters; shared host registration remains with the assembler.
`tests/test_decks_postgres.py` is opt-in under `DECK_NATIVE_DATABASE`, requires the protected connection to match Root's exact disposable assignment, and starts no service or migrator.
Root owns execution of those real PostgreSQL journeys.
`create_profile(pool, auth, demo_mode=False)` owns Profile reads and atomic partial updates.
`create_dashboard(pool, auth, values)` owns account aggregates and Deck availability in one repeatable-read snapshot, passing its transaction and PostgreSQL clock to `InventoryValues.current_in_transaction` and `history_in_transaction`.
Scan and price failures use savepoint recovery while summary overflow remains a typed failure.
Password hashing and verification share the lifetime-owned executor and use the existing Node-compatible scrypt encoding.
Core's `hash_password(password)` is synchronous for operator consumers; async callers use `PasswordVerifier.hash`.
QR uses existing migration 0024 and preserves requester-channel separation, terminal retries, live-session fencing and one-use redemption.

The [Python API](../api/README.md) constructs their concrete dependencies and owns runtime resources.
Shared Profile preferences depend explicitly on the MTG card and metric projection in `spellbook_core.mtg.profile`, retaining the same wire body.
Internal consumers import the explicit MTG modules; only HTTP paths retain compatibility aliases.
Core has no process, image, entrypoint, module-global pool or connection owner.
Constructors open no resources; explicit start/close methods own only the documented Core tasks.

Psycopg 3.3.6 provides explicit SQL/transactions without an ORM or migration-owner change.
The binary extra avoids driver compilation in the API image.
Python 3.14.8, uv 0.12.23, Hatchling, Ruff and strict Mypy match the API toolchain.
Pytest verifies compatibility, receipts, authority, native derivation reservations and SavedState tasks.
Native tests borrow the API dev environment for its Psycopg Pool dependency; Core does not acquire a pool dependency.
Run the independent Core unit suite with `uvx --from uv==0.12.23 uv run --directory backend/core --no-sync pytest`.
SQL history, schema/data and Drizzle ownership remain unchanged.
Inventory retains Profile FOR UPDATE followed by ordinary require_actor, without introducing Deck/Category's separate session FOR SHARE fence.

API owns pool/executor/LISTEN/supervisor/barrier settlement.
Core owns account subscriptions, generations/epochs, coalesced queues, authority reads and tracked fanout work.
Recovery callbacks are synchronous signals; they never await their own recovery.
Core imports neither FastAPI/Starlette/Uvicorn nor API, workers or clients.
Workers may import Core without importing the HTTP adapter.
The AST-based [boundary checker](../../scripts/check_python_boundaries.py) and negative fixtures enforce these directions.
See [repository verification](../../docs/operations/github-automation.md#python-api-and-core) for frozen checks, guarded native commands and remaining acceptance.
