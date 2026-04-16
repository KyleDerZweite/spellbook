# GitHub Automation

- Status: Canonical
- Last Reviewed: 2026-04-16
- Source of Truth: repo config
- Update Triggers: workflow logic changes, PR policy changes, branch protection changes, Dependabot policy changes
- Related Docs: [Operations Docs](./README.md), [Deployment](./deployment.md), [Docs Index](../README.md)

This document covers repository automation that affects pull request handling.

## Dependabot Auto Merge

Spellbook auto-merges Dependabot pull requests through [`.github/workflows/dependabot-auto-merge.yml`](../../.github/workflows/dependabot-auto-merge.yml).

Current behavior:

- only pull requests opened by `dependabot[bot]` are eligible
- only pull requests targeting the repository default branch are eligible
- the workflow does not check out pull request code
- pull requests with merge conflicts are skipped
- pull requests with pending or failing commit statuses are skipped
- pull requests with pending or failing check runs are skipped
- GitHub branch protection and merge policy still apply at merge time

The workflow attempts the enabled merge methods in this order:

- squash
- rebase
- merge commit

If repository rules block the merge, the workflow leaves the pull request open.
