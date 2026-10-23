# Backend wire contracts

[`openapi.json`](./openapi.json) is the checked-in OpenAPI 3.1 structural contract.
Backend owns wire semantics; existing handwritten clients, TypeScript validators and presentation helpers remain under `src/`.
The Node adapter imports the artifact into its bundle and substitutes only `servers[0].url` with `APP_ORIGIN`.
It does not regenerate schemas, load an external file at deployment, or change existing responses.
The relative `/` server in the artifact is deployment neutral.

[`compatibility/inventory.json`](./compatibility/inventory.json) records every explicitly registered API and browser-auth method/path, Discovery, closed web command and runtime responsibility at the frozen baseline.
Each record names its current owner and migration slice.
`bodyBytes: null` means no route-specific decoder or a browser-owned decoder, not permission to bypass the host limit.
The Node host defaults to 12 MiB; the web host and proxy keep their existing configuration.
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
The existing backend and frontend tests that import TypeScript still exercise Node.

Run the focused checks from the repository root using the pinned Node version:

```sh
pnpm --dir backend check
pnpm --dir backend exec vitest run tests/unit/compatibility-golden.test.ts tests/unit/compatibility-http.test.ts tests/unit/compatibility-inventory.test.ts tests/unit/openapi.test.ts
node --import ./backend/scripts/register-types.mjs --test backend/tests/openapi.test.ts
```

Existing OpenAPI checks reconcile all references, required fields, parameters and actual routes.
The inventory checks additionally instantiate production route factories, compare closed commands and exercise Discovery over a task-owned loopback HTTP server.
The extraction hash pins the original builder's normalized JSON, including property order, at `b835eee87ff0e92e99df18ab384602e48183a88d`.
Changing that hash is a reviewed contract change, not routine golden regeneration.

The canonical [evidence baseline](../docs/architecture/python-migration-evidence-baseline.md) owns compatibility inventory, functional evidence transfer and historical verification provenance.
[ADR-0027](../docs/decisions/0027-python-functional-migration-acceptance.md) retires strict performance/resource proof prerequisites; real functional compatibility remains required.
The [accepted migration contract](../docs/architecture/python-backend-migration.md) owns migration architecture and delivery authority.
