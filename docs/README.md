# Spellbook documentation

- Status: Canonical
- Last Reviewed: 2026-11-26
- Source of Truth: mixed
- Update Triggers:
  - Documentation ownership, product contracts and section structure
  - Architecture, API ownership and application/worker boundaries
  - Backend migration contracts and superseding decisions
  - Development, hosted deployment and operational references
  - Historical wiki discovery and source provenance
  - Markdown formatting, metadata, review dates and documentation health
  - Reader orientation: TL;DR summaries and question-based navigation
- Related Docs:
  - [Product](./product/README.md)
  - [Architecture](./architecture/README.md)
  - [Operations](./operations/README.md)
  - [Integrations](./integrations/README.md)
  - [Decisions](./decisions/README.md)
  - [Reference](./reference/README.md)
  - [Issue labels](./ISSUE_LABELS.md)

> **TL;DR**
>
> - New here? Read the [product specification](./product/specification.md) first.
> - Each topic has **one owning document**. Find it in the tables below.
> - Unsure about a word? Check the [glossary](../GLOSSARY.md).
> - Code, tests and configuration settle implementation questions.
> - Editing docs? Follow [Maintenance](#maintenance) and run `pnpm format:docs` and
>   `pnpm lint:docs`.

## Find a document by question

| I want to know...                             | Read                                                                    |
| --------------------------------------------- | ----------------------------------------------------------------------- |
| What Spellbook does, and what is planned      | [Product specification](./product/specification.md)                     |
| How Deck format legality warnings work        | [Deck format legality rules](./product/deck-rules.md)                   |
| What a domain term means                      | [Glossary](../GLOSSARY.md)                                              |
| How market value and Inventory history work   | [Value tracking](./product/value-tracking.md)                           |
| How value references and checkpoints are made | [Valuation](./architecture/valuation.md)                                |
| How web, API and Android are split            | [Independent applications](./architecture/independent-applications.md)  |
| Which API paths exist                         | [ADR-0028: versioned game API](./decisions/0028-versioned-game-api.md)  |
| Why old interfaces are removed immediately    | [ADR-0029](./decisions/0029-remove-replaced-interfaces.md)              |
| How the Python backend migration is accepted  | [Python migration contract](./architecture/python-backend-migration.md) |
| How to start, build and deploy                | [Deployment](./operations/deployment.md#independent-build-and-start)    |
| Which checks to run before a pull request     | [Repository verification](./operations/github-automation.md)            |
| How to label issues                           | [Issue label rules](./ISSUE_LABELS.md)                                  |
| How to contribute and disclose AI use         | [Contribution policy](../CONTRIBUTING.md)                               |
| Why a past strategy choice was made           | [Historical strategy wiki](./wiki/index.md)                             |

## Sections

| Section                                  | Owns                                                                                    |
| ---------------------------------------- | --------------------------------------------------------------------------------------- |
| [Product](./product/README.md)           | Specification, terminology, routes, and design direction                                |
| [Architecture](./architecture/README.md) | Service boundaries, data contracts, authentication, and recognition proposals           |
| [Operations](./operations/README.md)     | Deployment, environment variables, account recovery, and repository verification        |
| [Integrations](./integrations/README.md) | Scanner/sorter proposals, market prices, card classifiers and realtime backend research |
| [Decisions](./decisions/README.md)       | Significant choices, tradeoffs, and explicit supersession                               |
| [Reference](./reference/README.md)       | Selected components and external dependency documentation                               |

## Good to know

- **Value:** [Value tracking](./product/value-tracking.md) owns market value, coverage and personal
  Inventory history. [Valuation](./architecture/valuation.md) owns reference mechanics, public
  source history and private daily checkpoints.
  [ADR-0020](./decisions/0020-value-only-inventory-history.md) keeps history value-only and
  supersedes the cost-dependent design.
- **Python backend:** The [migration contract](./architecture/python-backend-migration.md) and
  [ADR-0027](./decisions/0027-python-functional-migration-acceptance.md) own functional acceptance
  and the implemented Python source. [PR 276](https://github.com/KyleDerZweite/spellbook/pull/276)
  records merge status and owner acceptance. Production operations stay separate.
- **Interfaces:** [ADR-0028](./decisions/0028-versioned-game-api.md) owns the versioned shared/MTG
  API. [ADR-0029](./decisions/0029-remove-replaced-interfaces.md) removes replaced interfaces
  immediately, so older clients must update.
- **Runtime and evidence:** [Deployment](./operations/deployment.md#independent-build-and-start)
  owns runtime commands. [Verification](./operations/github-automation.md) owns current-artifact
  evidence and unavailable native checks.
- **History vs. current:** The [wiki](./wiki/index.md) keeps dated decisions and preferences.
  Current contracts stay with the owners above.

## Maintenance

**Checklist for every documentation change:**

- [ ] Change the owning document. Link to it instead of copying a contract.
- [ ] Update `Last Reviewed`, `Update Triggers` and `Related Docs`.
- [ ] Add new files to their section index. Repair links after moves or renames.
- [ ] Run `pnpm format:docs`, then `pnpm lint:docs`.

The rules in detail:

Update the owning document when behavior, routes, schemas, authentication, environment variables, or
operator steps change. Keep requirements and planned work distinct from implemented behavior. Link
to the owning document instead of duplicating a contract.

Record significant architectural or product decisions in `decisions/`. Keep durable project
knowledge in its canonical document, with links from issues or commits rather than leaving that
knowledge only there. If no owner fits, create a document in the appropriate typed section.

Content changes require an updated `Last Reviewed` date, relevant `Update Triggers`, and checked
`Related Docs`. Source-only line-break changes retain review dates because they do not establish a
new factual review. Repair links affected by moves or renames in the same change. Add new files to
their section index. Remove replaced documentation and rely on git history; do not create archives
of replaced documents or competing descriptions of the current system. `docs/wiki/` may retain dated
strategy history with pointers to original sources; current contracts remain with their canonical
owners. Cite original sources without copying or archiving them in the wiki. Keep decisions that
still apply in their ADR files. For fully superseded ADRs, retain the index entry and use Git
history for the original text.

Review documentation health at each milestone or release, or monthly during active development.
Check claims against code, broken links, orphaned documents, duplicate contracts, and superseded
decisions. Use plain repository Markdown with readable source lines. Wrap prose and metadata to the
configured 100-character width with `pnpm format:docs`. The Markdown formatter uses
`proseWrap: always`; preserve paragraph breaks and let it place soft line breaks. Keep Update
Triggers as a concise nested list of current review topics, not a running delivery changelog. Put
each Related Docs link in its own nested list item. Keep headings, code blocks, tables and
indivisible links or code tokens syntactically intact; these structural elements may exceed the
prose width. Formatting does not rewrite code examples or establish a new factual review date.

Run `pnpm lint:docs` to check all tracked and new nonignored Markdown files, including root and
hidden directories. This dependency-free check also runs in CI Scope before suite classification, so
documentation-only changes cannot skip it.
