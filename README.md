# Spellbook

Spellbook is an open-source, self-hosted Magic: The Gathering inventory and deck builder.
Search the Scryfall catalog, track owned printings, build decks, and compare required cards with inventory.

Spellbook is unreleased; APIs and stored data may break at any commit.
See the [pre-release policy](CONTRIBUTING.md#replacing-interfaces) for upgrade and reset expectations.

The monorepo separates the SvelteKit website, Python/FastAPI API and Kotlin/Compose Android project.
PostgreSQL stores application data; Python workers own public ingestion and the retained Scan scaffold.
Accounts use local username and password authentication.
The retained Scan route/API supports image uploads and manual printing selection; Scan UI development and navigation entrypoints are paused.
Future recognition is planned locally, with browser scanning and client responsibilities under review.
Android implementation and verification are in progress under the [independent applications contract](docs/architecture/independent-applications.md).
No production recognizer is implemented.
[The recognition decision](docs/decisions/0023-local-recognition-in-scanner-clients.md) distinguishes that direction from the current upload/review workflow.

Start the configured local development environment with `./dev.sh`.
Use `./demo.sh` for Demo mode and `./demo.sh stop` to stop the launcher.
This starts the API on loopback port 3001 and Vite on port 5173.
Startup applies the installed Python migrator once, then starts the independent State, Catalog and Scan workers.
Prepare Python environments with `pnpm setup:python` before first startup.
See [local development setup](docs/operations/deployment.md#local-development) for prerequisites, independent build/start commands and private configuration.

- [Product specification](docs/product/specification.md)
- [Documentation index](docs/README.md)
- [Domain glossary](GLOSSARY.md)
- [Repository verification](docs/operations/github-automation.md)
- [Deployment](docs/operations/deployment.md)
- [Local authentication and account recovery](docs/operations/local-auth.md)
- [Selected UI components](docs/reference/ui-libraries.md)

Card data comes from [Scryfall](https://scryfall.com/).
Spellbook is licensed under the [GNU Affero General Public License v3.0](LICENSE).
