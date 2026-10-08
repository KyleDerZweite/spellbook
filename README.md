# Spellbook

Spellbook is an open-source, self-hosted Magic: The Gathering inventory and deck builder. Search the Scryfall catalog, track owned printings, build decks, and compare required cards with inventory.

The application uses SvelteKit, PostgreSQL, and a Python ingestion worker. Accounts use local username and password authentication. The retained Scan route/API supports image uploads and manual printing selection; Scan UI development and navigation entrypoints are paused. Future recognition is planned locally, with browser scanning and client responsibilities under review. The phone app should offer the website's functions; no separate app or production recognizer is implemented. [The recognition decision](docs/decisions/0023-local-recognition-in-scanner-clients.md) distinguishes that direction from the current upload/review workflow.

Start the configured local development environment with `./dev.sh`. This runs Vite on port 5173. `./dev.sh --scan` additionally starts the retained scan-worker on port 8087. See [local development setup](docs/operations/deployment.md#local-development) for prerequisites and private configuration.

- [Product specification](docs/product/specification.md)
- [Documentation index](docs/README.md)
- [Domain glossary](GLOSSARY.md)
- [Repository verification](docs/operations/github-automation.md)
- [Deployment](docs/operations/deployment.md)
- [Local authentication and account recovery](docs/operations/local-auth.md)
- [Selected UI components](docs/reference/ui-libraries.md)

Card data comes from [Scryfall](https://scryfall.com/). Spellbook is licensed under the [GNU Affero General Public License v3.0](LICENSE).
