# Backend wire contracts

[`openapi.json`](./openapi.json) is the checked-in OpenAPI 3.1 structural contract.
It advertises canonical `/api/v1/auth/...`, `/api/v1/account/...`, `/api/v1/mtg/...` and raw-form `/api/v1/web/...` operations under [ADR-0028](../docs/decisions/0028-versioned-game-api.md).
Backend owns wire semantics; existing handwritten clients, TypeScript validators and presentation helpers remain under `src/`.
The Python adapter bundles and reads the artifact and substitutes only `servers[0].url` with `APP_ORIGIN`.
It does not regenerate schemas, load an external file at deployment, or change existing responses.
The relative `/` server in the artifact is deployment neutral.

OpenAPI is the sole current route inventory.
The API serves 85 canonical operations plus Discovery; seven browser page methods remain web-owned.
GET-derived HEAD and router OPTIONS apply to API and Discovery paths without separate registered handlers.
[ADR-0029](../docs/decisions/0029-remove-replaced-interfaces.md) removes previous API paths without aliases, redirects or fallback dispatch; older clients must update.
Browser Auth pages retain their separate API form bridges.
The Scan worker's internal methods and generated documentation remain outside the public API contract.

[`fixtures/wire.json`](./fixtures/wire.json) contains synthetic public fixtures, never credentials or receipts copied from an account.
`inputJson` and raw form bodies are strings so lexical spellings, negative zero, escaping and CRLF survive other JSON readers.
Fingerprint vectors include the exact normalized JSON, UTF-8 hex bytes and SHA-256.
A fingerprint vector describes serialization, not permission for an endpoint to accept that input.
For example, the serializer can fingerprint null or rounded numbers that domain validation rejects.
The receipt fixtures exercise the actual Inventory replay branch through a stubbed select.
They do not prove PostgreSQL locks, persistence or transaction atomicity.
The normalized patch/import test crosses the actual mutation normalization seam before replay.
Deck legacy null acknowledgements have different live-Deck fallback semantics and require the existing Python Deck integration cases.

Python application and guarded PostgreSQL suites own current domain evidence.
Fixture tests establish parsing, serialization and replay decisions; real PostgreSQL tests establish persistence, locks and atomicity.
The obsolete Node inventory, transfer map and dual-runtime HTTP comparison are removed.
Their provenance remains in Git history and creates no obligation to maintain an old baseline.

Run current installed checks from the repository root:

```sh
pnpm setup:python
uvx --from uv==0.12.23 uv run --directory backend/core --no-sync pytest tests/test_wire.py
uvx --from uv==0.12.23 uv run --directory backend/api --no-sync pytest tests/test_http_wire.py tests/test_host_assembly.py tests/test_web_commands.py
```

The Python registry tests compare the complete current API operation set with OpenAPI and reject extra operations.
Removed API paths must return 404.
`src/saved-state.ts` exports the canonical shared stream path for current clients.
Core fixture cases and API parser/serializer tests exercise current Python implementations.
Real transaction and client integration results remain distinct from these component checks.

The [migration evidence](../docs/architecture/python-migration-evidence-baseline.md) owns functional evidence responsibilities and retained fixture ownership.
[ADR-0027](../docs/decisions/0027-python-functional-migration-acceptance.md) retires strict performance/resource proof prerequisites.
The [accepted migration contract](../docs/architecture/python-backend-migration.md) owns migration architecture and separate production authority.
