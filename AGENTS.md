# AI agent instructions

## Constraints

- Keep changes within the requested scope and preserve project structure, naming and architectural boundaries.
- Keep code typed, modular and minimal. Apply KISS, YAGNI, DRY, SOLID and Separation of Concerns; avoid broad refactors during feature work.
- Document the rationale for new dependencies. Keep secrets out of code and tool output.
- Never use SIGKILL or terminate the user's processes. Stop only verified task-owned processes gracefully. After a crash, verify repository state, preserved work and runtime ownership yourself before starting subagents.
- Use `main` as the base for PRs and merges.
- Write short, technical responses without internal summaries or verbose feedback loops. Avoid em dashes and en dashes. Use emojis only when functional.

## Workflow

1. Read [the docs index](docs/README.md), then the relevant owning documents before planning or editing. Resolve implementation questions against code, tests and configuration.
2. Make targeted changes and update their canonical documentation in the same change. For documentation edits, follow [maintenance rules](docs/README.md#maintenance), including metadata, indexes, ownership and decision records.
3. Run the checks required by [repository verification](docs/operations/github-automation.md) for the changed behavior. Correct failures before concluding; report skipped checks and unavailable evidence.
4. Before preparing a PR, follow [contribution disclosure](CONTRIBUTING.md#pull-request-expectations) for actual AI assistance, review, validation and contributor responsibility.

## Task-specific references

- Before changing card identity, inventory, deck or scan terminology, read [GLOSSARY.md](GLOSSARY.md). Before domain exploration, follow [domain consumer rules](docs/operations/github-automation.md#domain-docs).
- Before GitHub tracker operations, read [engineering skill configuration](docs/operations/github-automation.md#engineering-skill-configuration). Before triage or label changes, follow [issue label rules](docs/ISSUE_LABELS.md), including their [skill role mapping](docs/ISSUE_LABELS.md#engineering-skill-triage-roles).
- Before using or integrating BitsUI, read [the Bits UI reference](docs/reference/bits-ui.md), then its relevant upstream documentation.
- Before catalog search or publication changes, read [Catalog](docs/architecture/catalog.md), [worker ingestion](docs/architecture/worker.md) and [deployment/recovery](docs/operations/deployment.md). Preserve the authenticated API contract and transactional generation publication.
- For browser or CI inspection and other large tool results, follow [tool output and evidence](docs/operations/github-automation.md#tool-output-and-evidence). Inspect targeted fields and excerpts; avoid duplicate full payloads without dropping required checks or failure analysis.
