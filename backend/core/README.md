# Python application and SQL package

This local package is the dependency owner for the API and later state workers.
P02a adds only its typed package marker, pinned Psycopg dependency, independent lock and build configuration.
It has no application/SQL modules, process, image, entrypoint, connection or global resource.
The [API foundation](../api/README.md) records the P02b file reservations and host integration points.

Psycopg 3.3.6 reuses the existing Catalog driver's selected major version and provides explicit SQL/transactions without an ORM or migration owner change.
The binary extra supplies the driver without requiring system compilation in the API image.
Python 3.14.8, uv 0.12.23, Hatchling, Ruff and Mypy match the API toolchain.
The pytest dev dependency is reserved for the immediately following Core tests.
SQL history and Drizzle ownership remain unchanged.

Core imports neither FastAPI/Starlette/Uvicorn nor API, workers or clients.
Workers may import Core but cannot import the API package.
The AST-based [Python boundary checker](../../scripts/check_python_boundaries.py) and its negative fixtures enforce these directions without importing application code.
See [repository verification](../../docs/operations/github-automation.md#python-api-and-core) for commands and evidence limits.
