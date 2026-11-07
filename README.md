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

Configured deployments use one private root `.env` per checkout, with separate `PROD_*`, `DEMO_*` and `DEV_*` keys from `.env.example`.
Start the server connector with `podman-compose --env-file .env -p spellbook-site -f compose.site.yml up -d`.
Start hosted Demo with `podman-compose --env-file .env -p spellbook-demo -f compose.dev.yml -f compose.ingress.yml up --build -d`.
The Demo uses its own database and local Scan storage.
Its seed bootstraps the bundled Catalog only when no active Catalog exists, preserving subsequent full imports and private edits on restart.
Use the opt-in [Catalog worker](docs/operations/deployment.md#environment-update-and-reset-interface) to import Scryfall `all_cards`, including German and English Printings.
Hosted Demo and production publish no application host port.
Production stays stopped until explicitly selected.
Run `pnpm dev` for the Development Compose stack with normal accounts and no Demo seed or reset.
With `.env`, it starts configured Development through Newt.
Without `.env`, it uses a separate local project at `http://localhost:3000`, without Newt.
Use `pnpm dev:stop` to stop the selected stack and retain its data.
See [deployment and Development](docs/operations/deployment.md#stable-server-site-and-optional-development) for exact start/stop commands, origin builds and private configuration.

- [Product specification](docs/product/specification.md)
- [Documentation index](docs/README.md)
- [Domain glossary](GLOSSARY.md)
- [Repository verification](docs/operations/github-automation.md)
- [Deployment](docs/operations/deployment.md)
- [Local authentication and account recovery](docs/operations/local-auth.md)
- [Selected UI components](docs/reference/ui-libraries.md)

Card data comes from [Scryfall](https://scryfall.com/).
Spellbook is licensed under the [GNU Affero General Public License v3.0](LICENSE).
