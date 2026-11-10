# Contributing

Bug reports, issue discussions, feature proposals, and code or documentation changes are welcome.

Maintainers review contributions for correctness, project scope, design, and ongoing maintenance.
Opening an issue or pull request does not guarantee acceptance or a merge.
If a change is not accepted, you can keep it in your fork and are responsible for maintaining that version.

## Before you start

1. Open an issue for bugs, feature proposals, or significant changes.
2. Check existing issues and PRs to avoid duplicate work.
3. Keep changes focused and small.

Use the [issue label rules](docs/ISSUE_LABELS.md) when triaging issues.
Labels describe the work and its current status; they do not promise acceptance or a delivery date.

## Development workflow

1. Fork the repository and create a branch from `main`.
2. Make your changes with clear commit messages.
3. Follow the [repository verification workflow](docs/operations/github-automation.md#local-checks) before opening a PR.
4. Open a pull request against `main` with a concise description.

## Documentation formatting

Follow [documentation maintenance](docs/README.md#maintenance) for source formatting and metadata.
Run `pnpm format:docs` before committing documentation, then `pnpm lint:docs`.
Reflow alone does not establish a new factual review or change acceptance evidence.

## Website translations

When adding, changing or removing website text, update the bundled English and German dictionaries in `frontend/src/lib/i18n/` in the same change.
Follow the [website language contract](docs/architecture/frontend.md#website-language).

- Cover visible text, accessible names and status announcements, validation errors, and loading or pending states.
- Translate complete messages with parameters and explicit plural variants rather than concatenating translated fragments.
  Keep dictionary keys and placeholders aligned, and update `parameters.ts` when interpolation parameters change.
- Render through the reactive language context so switching languages also updates retained errors and statuses.
  Format numbers and dates with the selected locale.
- Preserve provider text, user content and stored domain values.
  Keep protocol and keyboard identifiers such as `Home` unchanged.
- Run the frontend type checks and unit tests required by repository verification.
  Verify affected screens in both languages, including switching without losing entered data.

Dictionary checks detect mismatched keys and placeholders, but do not detect every hardcoded string or judge translation quality.
Review changed templates, messages and accessibility text for omissions before marking the work complete.

## Pull request expectations

1. Explain what changed and why.
2. Reference related issues.
3. Include screenshots for UI changes when helpful.
4. Keep PR scope limited to one concern whenever possible.

AI-assisted contributions are welcome.
In each pull request, name the AI tools and models actually used, describe the material work they performed, and identify the responsible GitHub contributor.
State what human review occurred and which tests ran, including failures or checks that remain pending.
The contributor remains responsible for the change.

Write `none` when no AI assistance was used and `unknown` when a tool or model cannot be verified.
A proxy's model label is not proof of its underlying model.
Attribute adopted contributions separately without guessing whether their authors used AI.
Do not include private prompts, credentials, or other secrets.

Use the [pull request template](.github/pull_request_template.md) for this disclosure.
Maintainers evaluate scope and quality regardless of AI use.
The review and acceptance policy above still applies.

## Replacing interfaces

Spellbook is unreleased and changes rapidly.
Any commit may break APIs or stored data; backward compatibility and automatic upgrades are not guaranteed, and resetting/reimporting data may be required.

Replace interfaces and update first-party callers in the same change.
Delete superseded routes, code, adapters, tests and documentation instead of keeping compatibility aliases, redirects, fallbacks or a deprecation window.
Clients must update to the current implementation; API path versions do not promise compatibility across commits.
Describe removed interfaces and their replacements in the pull request.
Schema changes may require a fresh database and reimport of downloaded source JSON.
Keep SQL history needed for fresh installation and tests that verify current behavior; remove obsolete compatibility requirements with their replacements.
This policy does not authorize unrelated data deletion or resetting an actual database without task-specific authorization.
See [ADR-0029](docs/decisions/0029-remove-replaced-interfaces.md) for this decision.

## Security

Do not open public issues for vulnerabilities.
See [the security policy](.github/SECURITY.md) for private reporting instructions.
