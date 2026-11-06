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

Start the built Demo with `podman-compose --env-file .env -p spellbook-demo -f compose.dev.yml up --build -d`.
The private environment file must supply `APP_ORIGIN` and a strong `POSTGRES_PASSWORD`.
Web listens on port 3000 inside the container network; no host ports are published.
The API is private to the frontend network namespace.
Startup migrates and seeds an isolated Demo database before API and State start.
The Demo uses the bundled Catalog, local Scan storage and no live Catalog worker.
The optional `tunnel` profile connects Newt to Pangolin.
Stop with the same options followed by `down`, without removing volumes.
See [Demo deployment](docs/operations/deployment.md#demo-deployment) for configuration and [independent build/start](docs/operations/deployment.md#independent-build-and-start) for native development.

- [Product specification](docs/product/specification.md)
- [Documentation index](docs/README.md)
- [Domain glossary](GLOSSARY.md)
- [Repository verification](docs/operations/github-automation.md)
- [Deployment](docs/operations/deployment.md)
- [Local authentication and account recovery](docs/operations/local-auth.md)
- [Selected UI components](docs/reference/ui-libraries.md)

Card data comes from [Scryfall](https://scryfall.com/).
Spellbook is licensed under the [GNU Affero General Public License v3.0](LICENSE).
