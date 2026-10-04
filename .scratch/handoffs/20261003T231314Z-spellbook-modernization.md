# Spellbook modernization handoff

This change-state snapshot accompanies PR #169. Canonical behavior and procedures remain in the linked owners.

## Target

Finish review of [PR #169](https://github.com/KyleDerZweite/spellbook/pull/169) and confirm its current checks before a maintainer merges it. Preserve the current UI. Further design and component migration remain deferred in [issue #168](https://github.com/KyleDerZweite/spellbook/issues/168).

## Current state

Local authentication, PostgreSQL catalog search, major runtime upgrades, deck editing, and scan review are implemented. The 20 older PRs were closed without merging their branches. Current limits and proposed robot work are recorded in the [specification](../../docs/product/specification.md).

The base UI and card-box illustration are implemented. shadcn-svelte adoption is limited to the shared navigation Button; existing Bits UI dialogs, menus, and selects remain in use. Do not describe this as a completed component migration.

The root glossary replaces the former product glossary. Repository verification has one owner, and repeated checklists link to it. This handoff is explicitly requested as a tracked PR artifact.

## Live workspace

Working directory: `/home/kyle/.t3/worktrees/spellbook/t3code-b6b1e8af`.
Repository: `KyleDerZweite/spellbook`.
Branch: `t3code/modernize-stack-and-consolidate-docs`.
Base branch: `main`.

HEAD before this follow-up is `19e1f47befa580d64874d855869b79c15c59a1b6`. At capture, the UI, artwork, glossary move, documentation consolidation, and this handoff await their final commit and push. The follow-up commit contains this file; use `git status --short` and `git log -1` for the live state.

The disposable production review server uses port 15173. Its PostgreSQL 18 container is `spellbook-upgrade18-b6b1e8af`, and its scan-worker container is `spellbook-review-scan-b6b1e8af`. Production volumes were not changed. Keep credentials in their existing protected stores.

## Decisions and constraints

Keep PostgreSQL for catalog storage, search, and account data. Do not restore MeiliSearch or discarded database and backend-language research. Keep TypeScript application requests and Python workers within their existing boundaries.

Keep the supplied root logo unchanged. Preserve compact interface text and accessible control labels. Further UI changes require a new maintainer request; issue #168 remains deferred.

The current inventory groups printing quantities by finish and condition. Individual copies, physical locations, deck assignments, sorter placements, and automatic recognition remain proposed. The [domain glossary](../../CONTEXT.md) owns their meanings.

Use plain prose, canonical references, and source-backed claims. Disclose known AI tools and actual human review according to [CONTRIBUTING](../../CONTRIBUTING.md). Do not infer other contributors' AI use.

## Artifacts

- [Documentation index](../../docs/README.md), [specification](../../docs/product/specification.md), and [CONTEXT.md](../../CONTEXT.md).
- [Repository verification](../../docs/operations/github-automation.md), [deployment](../../docs/operations/deployment.md), [database upgrade](../../docs/operations/postgres-upgrade.md), and [local enrollment](../../docs/operations/local-auth.md).
- [PostgreSQL decision](../../docs/decisions/0010-postgres-catalog.md) and [scanner proposal](../../docs/integrations/card-robot.md).
- [UI direction](../../docs/product/ui-design-direction.md), [component scope](../../docs/reference/ui-libraries.md), and [brand sources](../../docs/reference/website-icons.md).
- Editable Blender source: `frontend/brand/card-box.blend` and `frontend/brand/card-box.py`. Served illustration: `frontend/static/brand/card-box.webp`.

Blender MCP was disconnected. Installed Flatpak Blender rendered the procedural scene offline, with no new runtime dependency or downloaded model.

## Verification

The frontend commands last run were `pnpm lint`, `pnpm test:unit`, and `APP_ORIGIN=http://127.0.0.1:15173 pnpm build`. Lint, TypeScript, Svelte checks, all 219 unit tests, and the production build passed. A final class-only scan-toolbar correction passed formatting, rebuild, and browser verification without repeating the unit suite.

Production browser checks covered authentication errors and login, search and filters, printing dialogs, inventory edits, deck creation and import review, and a confirmed scan import. Desktop and phone layouts, focus containment and restoration, 40-pixel quantity controls, and the final mobile scan toolbar passed. The card-box asset loads as a transparent 1200 by 1000 WebP.

Fresh frontend and both Python audits found no known vulnerabilities. All ten pictured Dependabot alerts are fixed in this branch; GitHub still reports vulnerable locks on unmerged `main`. Do not dismiss those alerts to simulate a fix.

The earlier runtime change passed 59 PostgreSQL integration cases, 137 ingestion-worker tests, and 16 scan-worker tests. No backend code changed in this UI/docs follow-up. All six CI jobs passed on `19e1f47`; inspect the final follow-up head separately.

Follow the [canonical verification workflow](../../docs/operations/github-automation.md) for exact setup, commands, skipped database coverage, and evidence rules. Native home-screen installation and full-catalog capacity remain unverified.

## Open work

Only final commit/push and CI confirmation remain at capture. A maintainer must review and merge the PR. Do not merge without an explicit instruction. Further UI work is deliberately deferred. Automatic recognition and physical tracking require separate implementation; there is no pending question that blocks this PR.

## Next action

Run `gh pr view 169 --json headRefOid,state,mergeStateStatus,statusCheckRollup` and `git status --short`. Confirm the final branch is pushed and CI passes for that exact head. If T3 monitoring is requested, use its PR watcher rather than a polling loop.

## Suggested skills

Use `writing` for concise docs and PR text, `domain-modeling` for terminology changes, and `ponytail` for the smallest sufficient implementation. Use `handoff` when preparing another continuation record, preserving the maintainer's request that this artifact be tracked.
