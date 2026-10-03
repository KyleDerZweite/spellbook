# Spellbook

Spellbook is an open-source, self-hosted Magic: The Gathering inventory and deck builder. Search the Scryfall catalog, track owned printings, build decks, and compare required cards with inventory.

The application uses SvelteKit, Postgres, MeiliSearch, and a Python ingestion worker. Accounts use local username and password authentication. Scan review supports image uploads and manual printing selection. Automatic card recognition and direct browser camera capture remain planned.

- [Product specification](docs/product/specification.md)
- [Documentation index](docs/README.md)
- [Deployment](docs/operations/deployment.md)
- [Local authentication and account recovery](docs/operations/local-auth.md)
- [Backend language assessment](docs/architecture/backend-language.md)
- [UI library assessment](docs/reference/ui-libraries.md)

Card data comes from [Scryfall](https://scryfall.com/). Spellbook is licensed under the [GNU Affero General Public License v3.0](LICENSE).
