# Backend wire contracts

[`openapi.json`](./openapi.json) is the checked-in OpenAPI 3.1 structural contract.
Backend owns wire semantics; existing handwritten clients, TypeScript validators and presentation helpers remain under `src/`.
The Python adapter bundles and reads the artifact and substitutes only `servers[0].url` with `APP_ORIGIN`.
It does not regenerate schemas, load an external file at deployment, or change existing responses.
The relative `/` server in the artifact is deployment neutral.

[`compatibility/inventory.json`](./compatibility/inventory.json) records every explicitly registered API and browser-auth method/path, Discovery, closed web command and runtime responsibility at the frozen baseline.
Each record names its frozen Node baseline owner and migration slice.
Current Python owners and transferred checks are described in the migration evidence baseline.
`bodyBytes: null` means no route-specific decoder or a browser-owned decoder, not permission to bypass the host limit.
The Python host defaults to 12 MiB; the web host and proxy keep their existing configuration.
GET-derived HEAD and router OPTIONS apply to each API path, including Discovery, without separate registered handlers.
Browser Auth remains web-owned; the candidate API must preserve the separate API bridge methods those pages call.
The Scan worker's internal methods are listed separately from the public API contract.
Its FastAPI-generated documentation remains internal framework behavior, not a competing public contract.

[`compatibility/golden.json`](./compatibility/golden.json) contains synthetic public fixtures, never credentials or receipts copied from an account.
`inputJson` and raw form bodies are strings so lexical spellings, negative zero, escaping and CRLF survive other JSON readers.
Fingerprint vectors include the exact normalized JSON, UTF-8 hex bytes and SHA-256.
A fingerprint vector describes serialization, not permission for an endpoint to accept that input.
For example, the serializer can fingerprint null or rounded numbers that domain validation rejects.
The receipt fixtures exercise the actual Inventory replay branch through a stubbed select.
They do not prove PostgreSQL locks, persistence or transaction atomicity.
The normalized patch/import test crosses the actual mutation normalization seam before replay.
Deck legacy null acknowledgements have different live-Deck fallback semantics and require the existing Deck integration cases during transfer.

[`compatibility/transfer.json`](./compatibility/transfer.json) assigns every golden and targeted behavioral test ID to Node-direct evidence, required dual-runtime HTTP evidence and required Python application evidence.
The `cases` array gives the explicit case-to-transfer mapping.
Future test runners can read the JSON without importing TypeScript.
No Python implementation or Python parity is established by this baseline.
The replaced Node domain tests are retired; Python application and guarded PostgreSQL suites own current domain evidence.

Run current installed checks from the repository root:

```sh
pnpm setup:python
uvx --from uv==0.12.23 uv run --directory backend/core --no-sync pytest tests/test_compatibility.py
uvx --from uv==0.12.23 uv run --directory backend/api --no-sync pytest tests/test_http_compatibility.py tests/test_host_assembly.py tests/test_web_commands.py
```

The Python registry test reconciles every API operation with the neutral inventory.
Core golden cases and API parser/serializer tests exercise current Python implementations.
Real transaction and client integration results remain distinct from these component checks.
The original Node schema hash records provenance at `b835eee87ff0e92e99df18ab384602e48183a88d` and must not be casually regenerated.

The canonical [evidence baseline](../docs/architecture/python-migration-evidence-baseline.md) owns compatibility inventory, functional evidence transfer and historical verification provenance.
[ADR-0027](../docs/decisions/0027-python-functional-migration-acceptance.md) retires strict performance/resource proof prerequisites; real functional compatibility remains required.
The [accepted migration contract](../docs/architecture/python-backend-migration.md) owns migration architecture and delivery authority.
