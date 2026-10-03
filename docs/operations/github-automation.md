# GitHub Automation

- Status: Canonical
- Last Reviewed: 2026-10-03
- Source of Truth: repo config
- Update Triggers: workflow logic changes, PR policy changes, branch protection changes, Dependabot policy changes
- Related Docs: [Operations Docs](./README.md), [Deployment](./deployment.md), [Docs Index](../README.md)

This document covers repository automation that affects pull request handling.

## Dependabot

Spellbook uses Dependabot to open dependency update pull requests. Dependabot updates are configured in [`.github/dependabot.yml`](../../.github/dependabot.yml).

Current policy:

- Dependabot may open pull requests for GitHub Actions, frontend npm packages, worker Python packages, and scan-worker Python packages.
- Dependency pull requests must pass CI.
- Dependency pull requests must be reviewed and merged manually.
- No workflow in this repository auto-merges Dependabot pull requests.

## CI

CI runs through [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).

The current workflow checks:

- frontend lint and unit tests
- frontend build
- frontend DB schema check
- frontend integration tests against Postgres
- worker Ruff and pytest
- scan-worker Ruff and pytest

CI uses the pinned frontend Node version, the package manager declared in `frontend/package.json`, and frozen dependency installs. Python jobs pin their interpreter and uv version, install from `uv.lock` with `--frozen`, and run Ruff formatting checks as well as lint and tests.

CI does not build or publish container images and does not deploy the application. Container builds and deployment remain explicit operator steps.
