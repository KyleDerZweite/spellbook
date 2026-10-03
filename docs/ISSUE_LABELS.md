# Issue labels

- Status: Canonical
- Last Reviewed: 2026-10-03
- Source of Truth: maintainer policy and GitHub repository labels
- Update Triggers: label definitions, issue triage policy, contribution policy, label automation
- Related Docs: [Contributing](../CONTRIBUTING.md), [Agent instructions](../AGENTS.md), [GitHub automation](./operations/github-automation.md), [Docs index](./README.md)

Use labels to describe an issue's type, affected area, and current work status. A label does not promise acceptance, implementation, a merge, or a delivery date. GitHub's open or closed issue state records completion; there is no separate completion label.

## Type

Choose one primary type when the issue provides enough evidence. Leave the type unset when it is unclear.

| Label              | Use                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `bug`              | A confirmed defect or regression. Include reproduction steps, code evidence, or a verified failure.                      |
| `type:feature`     | A proposed capability or improvement to user behavior, including a redesign.                                             |
| `type:maintenance` | Refactoring, tooling upkeep, or other work that does not fix a defect or add a capability.                               |
| `type:docs`        | Documentation corrections or additions. A documentation-only error belongs here.                                         |
| `type:security`    | Security hardening or vulnerability remediation. Follow the security policy before recording sensitive details publicly. |
| `question`         | A request for an explanation or discussion without a concrete implementation request.                                    |

Do not create `type:bug` or another duplicate of an existing label. Treat dependency bot labels as additional metadata, not competing issue types.

## Area

Add an area only when the issue identifies it. Multiple areas are appropriate when the work directly affects each area. These labels describe responsibilities, not programming languages.

| Label          | Meaning                                                                | Color    |
| -------------- | ---------------------------------------------------------------------- | -------- |
| `area:search`  | Card catalog ingestion, indexing, and search.                          | `1d76db` |
| `area:auth`    | Accounts, credentials, sessions, and access control.                   | `5319e7` |
| `area:tooling` | Builds, CI, dependencies, containers, and deployment tooling.          | `0366d6` |
| `area:design`  | Visual design, interaction design, and accessibility of the interface. | `c5def5` |

Leave unrelated issues without an area until a recurring need justifies another label. Reuse the existing label when its meaning fits.

## Status and maintainer decisions

Use at most one status label. An open issue without a status label has no recorded work status.

| Label                | Use                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------ |
| `status:in-progress` | Work has started, supported by current implementation work or an explicit assignee update. |
| `status:blocked`     | A named dependency or decision prevents the work from proceeding.                          |
| `status:needs-info`  | Progress requires a specific unanswered question for the reporter or stakeholder.          |
| `status:deferred`    | A maintainer explicitly postponed the work. Use color `d4c5f9`.                            |

When status changes, remove the previous status label. Remove active status labels when closing an issue. An existing pull request alone does not establish that someone is still working on it.

Maintainers control `priority:p0` through `priority:p3`. These mean critical, high, normal, and low priority respectively. Agents must not assign a priority from a title, a bug classification, a reaction count, or their own estimate of importance. Leave priority unset without an explicit maintainer decision.

Preserve the existing `duplicate`, `invalid`, and `wontfix` labels. Apply them only for an explicit maintainer disposition. A duplicate needs a reference to the issue that owns the work. Deferral uses `status:deferred`, not `wontfix`.

Apply `help wanted` only when a maintainer welcomes outside implementation work on that issue. Apply `good first issue` only when a maintainer has identified a bounded task with enough context for a new contributor. The general contribution policy does not automatically qualify every issue for either label.

## Agent workflow

1. Read the issue body, relevant discussion, existing labels, and linked code or pull requests before changing labels.
2. Infer type and area only from that evidence. Apply `status:in-progress` only for verified active work. Apply other status labels only when the discussion establishes the required condition.
3. Preserve unrelated labels. Do not change priorities, acceptance decisions, or contributor labels without the maintainer direction described above.
4. Before adding a new label, check for an existing equivalent. Document its precise meaning and color here. Do not rename or delete existing labels as part of routine triage.
5. Apply the labels, then read the issue again to verify the result. Keep issue descriptions and discussion intact.

Use GitHub or `gh` for triage. No automated labeling workflow is required. Existing `dependencies`, `javascript`, `python`, `python:uv`, and `github_actions` labels remain available to dependency automation.

For example, the explicitly deferred design work in [issue 168](https://github.com/KyleDerZweite/spellbook/issues/168) uses `type:feature`, `area:design`, and `status:deferred`:

```sh
gh label list --limit 100
gh issue view 168 --json title,body,labels,comments
gh issue edit 168 --add-label 'type:feature,area:design,status:deferred'
gh issue view 168 --json labels
```

These commands add labels without replacing the issue's other labels or changing its content.
