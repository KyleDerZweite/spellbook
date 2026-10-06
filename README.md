# Spellbook

Spellbook is an open-source, self-hosted Magic: The Gathering inventory and deck builder. Search the Scryfall catalog, track owned printings, build decks, and compare required cards with inventory.

The application uses SvelteKit, PostgreSQL, and a Python ingestion worker. Accounts use local username and password authentication. Scan review supports image uploads and manual printing selection. Automatic card recognition and direct browser camera capture remain planned.

Start the configured local development environment with `./dev.sh`. This runs Vite on port 5173 and the scan-worker on port 8087. See [local development setup](docs/operations/deployment.md#local-development) for prerequisites and private configuration.

- [Product specification](docs/product/specification.md)
- [Documentation index](docs/README.md)
- [Domain glossary](GLOSSARY.md)
- [Repository verification](docs/operations/github-automation.md)
- [Deployment](docs/operations/deployment.md)
- [Local authentication and account recovery](docs/operations/local-auth.md)
- [Selected UI components](docs/reference/ui-libraries.md)

Card data comes from [Scryfall](https://scryfall.com/). Spellbook is licensed under the [GNU Affero General Public License v3.0](LICENSE).
