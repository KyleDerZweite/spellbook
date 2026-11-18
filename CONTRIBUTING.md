# Contributing

> **TL;DR**
>
> - Bugs, ideas, docs and code are welcome. Open an issue first for anything big.
> - Branch from `main`, keep the change small, run the [local checks](#development-workflow).
> - Changing website text? Update **English and German** together.
> - Fill in the [pull request template](.github/pull_request_template.md), including AI use.
> - Spellbook is unreleased: replace old interfaces, do not keep compatibility shims.
> - Security issues go to the [security policy](.github/SECURITY.md), never a public issue.

Maintainers review every contribution for correctness, scope, design and long-term maintenance.
Opening an issue or pull request does not guarantee a merge. If a change is not accepted, you can
keep it in your fork and maintain that version yourself.

## Before you start

1. Search existing issues and pull requests to avoid duplicate work.
2. Open an issue for bugs, feature proposals or significant changes.
3. Plan a small, focused change.

Labels follow the [issue label rules](docs/ISSUE_LABELS.md). A label describes the work and its
status. It does not promise acceptance or a delivery date.

## Development workflow

1. Fork the repository and create a branch from `main`.
2. Make your change with clear commit messages.
3. Run the [local checks](docs/operations/github-automation.md#local-checks) for what you changed.
4. Open a pull request against `main`.

Start the app with `pnpm dev`. See the [README](README.md#develop) for details.

## Documentation formatting

Checklist for any Markdown change:

- [ ] Follow [documentation maintenance](docs/README.md#maintenance) for structure and metadata.
- [ ] Run `pnpm format:docs`.
- [ ] Run `pnpm lint:docs`.

Reflowing text alone does not count as a new factual review and does not change acceptance evidence.

## Website translations

Changing, adding or removing website text? Update the English and German dictionaries in
`frontend/src/lib/i18n/` in the same change. The
[website language contract](docs/architecture/frontend.md#website-language) has the full rules.

**Cover all text**

- Visible text, accessible names and status announcements.
- Validation errors and loading or pending states.

**Write complete messages**

- Translate whole messages with parameters and explicit plural variants. Never glue translated
  fragments together.
- Keep dictionary keys and placeholders aligned. Update `parameters.ts` when interpolation
  parameters change.

**Render and format correctly**

- Render through the reactive language context, so switching language also updates retained errors
  and statuses.
- Format numbers and dates with the selected locale.

**Leave these unchanged**

- Provider text, user content and stored domain values.
- Protocol and keyboard identifiers such as `Home`.

**Verify**

- Run the frontend type checks and unit tests that repository verification requires.
- Check affected screens in both languages, including switching language without losing entered
  data.

Dictionary checks catch mismatched keys and placeholders. They do not catch every hardcoded string
or judge translation quality, so review changed templates, messages and accessibility text yourself.

## Pull request expectations

Every pull request:

1. Explains what changed and why.
2. Links related issues.
3. Includes screenshots for UI changes when they help.
4. Covers one concern where possible.

### AI disclosure

AI-assisted contributions are welcome. Use the
[pull request template](.github/pull_request_template.md) and state:

- **Tools and models** actually used, and the material work they did.
- **Responsible contributor**: the GitHub user who owns the change.
- **Human review** that happened.
- **Tests** that ran, including failures and pending checks.

Rules for the disclosure:

- Write `none` for no AI assistance and `unknown` for a tool or model you cannot verify.
- A proxy's model label is not proof of its underlying model.
- Attribute adopted contributions separately. Do not guess whether their authors used AI.
- Never include private prompts, credentials or other secrets.

The contributor stays responsible for the change. Maintainers judge scope and quality the same way
with or without AI.

## Replacing interfaces

**Short version:** Spellbook is unreleased. Replace, don't deprecate.

Any commit may break APIs or stored data. Backward compatibility and automatic upgrades are not
guaranteed, and you may need to reset or reimport data.

When you replace an interface:

- Update all first-party callers in the same change.
- Delete superseded routes, code, adapters, tests and documentation.
- Add no compatibility aliases, redirects, fallbacks or deprecation window.
- Describe removed interfaces and their replacements in the pull request.

What this means in practice:

- Clients must update to the current implementation. API path versions do not promise compatibility
  across commits.
- Schema changes may require a fresh database and a reimport of downloaded source JSON.
- Keep the SQL history needed for a fresh installation, and tests that verify current behavior.
  Remove obsolete compatibility requirements together with what replaced them.
- This policy does not allow unrelated data deletion, or resetting a real database, without
  task-specific authorization.

Decision record: [ADR-0029](docs/decisions/0029-remove-replaced-interfaces.md).

## Security

Do not open public issues for vulnerabilities. Follow the [security policy](.github/SECURITY.md) to
report them privately.
