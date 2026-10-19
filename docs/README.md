# Spellbook documentation

- Status: Canonical
- Last Reviewed: 2026-10-19
- Source of Truth: mixed
- Update Triggers: sentence-per-line authoring and review-date semantics, independent API/web ownership and relocated code references, document ownership, product contracts, section changes, documentation health review
- Related Docs: [Product](./product/README.md), [Architecture](./architecture/README.md), [Operations](./operations/README.md), [Integrations](./integrations/README.md), [Decisions](./decisions/README.md), [Reference](./reference/README.md), [Issue labels](./ISSUE_LABELS.md)

Start with the [product specification](./product/specification.md) for current behavior, requirements, and known limits.
Use the [domain glossary](../GLOSSARY.md) for precise MTG and ownership terms.
The code, tests, and configuration resolve implementation questions.

[Value tracking](./product/value-tracking.md) owns market value, coverage and personal Inventory history.
[Valuation](./architecture/valuation.md) owns implemented reference mechanics, public source history and private daily checkpoints.
[ADR-0020](./decisions/0020-value-only-inventory-history.md) records the value-only scope and supersedes the cost-dependent history design.

The [independent applications contract](./architecture/independent-applications.md) owns the accepted web/API/Android split and implementation status.
[Deployment](./operations/deployment.md#independent-build-and-start) owns separate runtime commands; [verification](./operations/github-automation.md) owns current-artifact evidence and unavailable native checks.

Use the [issue label rules](./ISSUE_LABELS.md) for repository triage and the [contribution policy](../CONTRIBUTING.md) for proposals, pull requests, and AI assistance disclosure.

| Section                                  | Owns                                                                                    |
| ---------------------------------------- | --------------------------------------------------------------------------------------- |
| [Product](./product/README.md)           | Specification, terminology, routes, and design direction                                |
| [Architecture](./architecture/README.md) | Service boundaries, data contracts, authentication, and recognition proposals           |
| [Operations](./operations/README.md)     | Deployment, environment variables, account recovery, and repository verification        |
| [Integrations](./integrations/README.md) | Scanner/sorter proposals, market prices, card classifiers and realtime backend research |
| [Decisions](./decisions/README.md)       | Significant choices, tradeoffs, and explicit supersession                               |
| [Reference](./reference/README.md)       | Selected components and external dependency documentation                               |

## Maintenance

Update the owning document when behavior, routes, schemas, authentication, environment variables, or operator steps change.
Keep requirements and planned work distinct from implemented behavior.
Link to the owning document instead of duplicating a contract.

Record significant architectural or product decisions in `decisions/`.
Keep durable project knowledge in its canonical document, with links from issues or commits rather than leaving that knowledge only there.
If no owner fits, create a document in the appropriate typed section.

Content changes require an updated `Last Reviewed` date, relevant `Update Triggers`, and checked `Related Docs`.
Source-only line-break changes retain review dates because they do not establish a new factual review.
Repair links affected by moves or renames in the same change.
Add new files to their section index.
Remove replaced documentation and rely on git history; do not create an archive or parallel wiki.
Retain decision records with explicit supersession status.

Review documentation health at each milestone or release, or monthly during active development.
Check claims against code, broken links, orphaned documents, duplicate contracts, and superseded decisions.
Use plain repository Markdown.
Put each prose sentence on its own source line, preserving paragraph breaks and list continuation indentation.
Wrap a long sentence at a useful phrase boundary when needed.
Keep code blocks, URLs and table rows syntactically intact.
The repository's Markdown Prettier override uses `proseWrap: preserve` so formatting retains these line breaks.
