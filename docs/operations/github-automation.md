# Repository verification and GitHub automation

- Status: Canonical
- Last Reviewed: 2026-10-04
- Source of Truth: package scripts, Python project files, CI workflow, contribution policy
- Update Triggers: test commands, workflow coverage, runtime pins, browser verification, PR policy, Dependabot policy
- Related Docs: [Operations](./README.md), [Product acceptance](../product/specification.md#interface-acceptance), [Frontend](../architecture/frontend.md), [Deployment](./deployment.md), [Contributing](../../CONTRIBUTING.md), [Docs maintenance](../README.md#maintenance)

This document owns repository check commands, CI coverage, and verification evidence. Product and integration documents own behavior and acceptance criteria. Run checks appropriate to the changed behavior; do not treat a passing command as proof of requirements it does not exercise.

## Local checks

Use the Node version in [`frontend/.node-version`](../../frontend/.node-version) and the package manager in [`frontend/package.json`](../../frontend/package.json). Before building for browser review, set `APP_ORIGIN` to the origin the browser will use. [Deployment configuration](./deployment.md#configuration) owns the build-time origin and rebuild procedure. From `frontend/`, run:

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm test:unit
pnpm build
pnpm db:check
```

`lint` includes Prettier, SvelteKit synchronization, the TypeScript 7 check, and Svelte checking. Running those nested checks again adds no coverage unless isolating a failure. `db:check` checks Drizzle migration consistency; it does not apply migrations or exercise transactions.

For frontend integration tests, set `DATABASE_URL` and `TEST_DATABASE_URL` to the same disposable PostgreSQL 18 database, then run from `frontend/`:

```sh
pnpm db:migrate
pnpm test:integration
```

The database role needs schema and extension creation privileges. Integration cases write fixtures and remove test data or schemas. Without `TEST_DATABASE_URL`, database suites skip; a successful process with skipped suites is not a database verification result.

For each changed Python package, run the following from `worker/` or `scan-worker/`. The [CI workflow](../../.github/workflows/ci.yml) owns the pinned Python and uv versions.

```sh
uv python install 3.14.8
uv lock --check --python 3.14.8
uv sync --frozen --extra dev --python 3.14.8
uv run --no-sync ruff check
uv run --no-sync ruff format --check
uv run --no-sync pytest
```

Set `WORKER_TEST_DATABASE_URL` to a disposable PostgreSQL 18 database when checking catalog publication. Those cases create isolated schemas and skip without the variable. The scan-worker tests do not require PostgreSQL. A frozen install preserves locked packages; the separate lock check detects a manifest that no longer matches its lockfile.

For Markdown changes, install frontend dependencies and run from the repository root:

```sh
frontend/node_modules/.bin/prettier --check README.md CONTEXT.md AGENTS.md CONTRIBUTING.md docs .scratch/handoffs
```

Follow [documentation maintenance](../README.md#maintenance) for links, ownership, metadata, and stale claims. Documentation-only changes do not need application tests unless they also change executable behavior.

## CI coverage

[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) runs on pull requests and pushes to `main`. Its jobs run the application commands above with frozen installs. Frontend and catalog-worker integration jobs provision separate PostgreSQL services. The workflow is the source of truth for job names, environment variables, and tool versions.

CI does not run the root Markdown command, browser workflows, container builds, image publication, or deployment. These remain explicit checks when relevant. [Deployment](./deployment.md) owns container startup and operator verification; [database upgrades](./postgres-upgrade.md) owns restore rehearsal and rollback checks.

## Browser verification and evidence

For UI changes, exercise the affected workflows against the [interface acceptance criteria](../product/specification.md#interface-acceptance). Use representative account data, narrow and desktop viewports, keyboard input, and error states. Component tests and production builds do not establish correct focus, touch interaction, contrast, or composed page behavior. Asset changes also follow the specific [brand verification rules](../reference/website-icons.md).

Record the commands run, results, skipped coverage, and remaining limits with the change. Keep test counts and screenshots in the change record, rather than repeating transient results across canonical docs. Distinguish automated checks from browser observations and requirements that remain untested. Follow [contribution disclosure](../../CONTRIBUTING.md#pull-request-expectations) when preparing the PR.

## Dependabot

[`.github/dependabot.yml`](../../.github/dependabot.yml) opens dependency updates for GitHub Actions, frontend npm packages, and both Python workers. These pull requests require passing CI and manual review and merge. No repository workflow auto-merges them.
