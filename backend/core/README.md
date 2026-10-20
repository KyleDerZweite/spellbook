# Python application and SQL package

Core owns typed session authority, bounded singleton Catalog reads, representative Inventory add/detail and original receipts, SavedState subscriptions/authority/fanout, credential verification and shared compatibility rules.
The [dormant API](../api/README.md) constructs their concrete dependencies and owns runtime resources.
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
