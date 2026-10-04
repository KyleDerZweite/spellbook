# Contributing

Bug reports, issue discussions, feature proposals, and code or documentation changes are welcome.

Maintainers review contributions for correctness, project scope, design, and ongoing maintenance. Opening an issue or pull request does not guarantee acceptance or a merge. If a change is not accepted, you can keep it in your fork and are responsible for maintaining that version.

## Before you start

1. Open an issue for bugs, feature proposals, or significant changes.
2. Check existing issues and PRs to avoid duplicate work.
3. Keep changes focused and small.

Use the [issue label rules](docs/ISSUE_LABELS.md) when triaging issues. Labels describe the work and its current status; they do not promise acceptance or a delivery date.

## Development workflow

1. Fork the repository and create a branch from `main`.
2. Make your changes with clear commit messages.
3. Follow the [repository verification workflow](docs/operations/github-automation.md#local-checks) before opening a PR.
4. Open a pull request against `main` with a concise description.

## Pull request expectations

1. Explain what changed and why.
2. Reference related issues.
3. Include screenshots for UI changes when helpful.
4. Keep PR scope limited to one concern whenever possible.

AI-assisted contributions are welcome. In each pull request, name the AI tools and models actually used, describe the material work they performed, and identify the responsible GitHub contributor. State what human review occurred and which tests ran, including failures or checks that remain pending. The contributor remains responsible for the change.

Write `none` when no AI assistance was used and `unknown` when a tool or model cannot be verified. A proxy's model label is not proof of its underlying model. Attribute adopted contributions separately without guessing whether their authors used AI. Do not include private prompts, credentials, or other secrets.

Use the [pull request template](.github/pull_request_template.md) for this disclosure. Maintainers evaluate scope and quality regardless of AI use. The review and acceptance policy above still applies.

## Security

Do not open public issues for vulnerabilities. See [the security policy](.github/SECURITY.md) for private reporting instructions.
