# Spellbook documentation

- Status: Canonical
- Last Reviewed: 2026-10-06
- Source of Truth: mixed
- Update Triggers: document ownership, product contracts, section changes, documentation health review
- Related Docs: [Product](./product/README.md), [Architecture](./architecture/README.md), [Operations](./operations/README.md), [Integrations](./integrations/README.md), [Decisions](./decisions/README.md), [Reference](./reference/README.md), [Issue labels](./ISSUE_LABELS.md)

Start with the [product specification](./product/specification.md) for current behavior, requirements, and known limits. Use the [domain glossary](../GLOSSARY.md) for precise MTG and ownership terms. The code, tests, and configuration resolve implementation questions.

Use the [issue label rules](./ISSUE_LABELS.md) for repository triage and the [contribution policy](../CONTRIBUTING.md) for proposals, pull requests, and AI assistance disclosure.

| Section                                  | Owns                                                                             |
| ---------------------------------------- | -------------------------------------------------------------------------------- |
| [Product](./product/README.md)           | Specification, terminology, routes, and design direction                         |
| [Architecture](./architecture/README.md) | Service boundaries, data contracts, authentication, and recognition proposals    |
| [Operations](./operations/README.md)     | Deployment, environment variables, account recovery, and repository verification |
| [Integrations](./integrations/README.md) | External scanner and sorter proposals, market-price research                     |
| [Decisions](./decisions/README.md)       | Significant choices, tradeoffs, and explicit supersession                        |
| [Reference](./reference/README.md)       | Selected components and external dependency documentation                        |

## Maintenance

Update the owning document when behavior, routes, schemas, authentication, environment variables, or operator steps change. Keep requirements and planned work distinct from implemented behavior. Link to the owning document instead of duplicating a contract.

Every touched canonical document needs an updated `Last Reviewed` date, relevant `Update Triggers`, and checked `Related Docs`. Add new files to their section index. Remove replaced documentation and rely on git history; do not create an archive or parallel wiki. Retain decision records with explicit supersession status.

Review documentation health at each milestone or release, or monthly during active development. Check claims against code, broken links, orphaned documents, duplicate contracts, and superseded decisions. Use plain repository Markdown.
