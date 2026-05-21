# Spellbook

**Open-source, self-hosted MTG inventory and deck availability**

Spellbook is a self-hosted Magic: The Gathering application for people who want to own their collection data, automate inventory workflows, and answer what decks they can build from the cards they physically have.

Active MTG product areas:

- search
- inventory
- deck import, export, and availability
- scan review foundation

Product direction:

- MTG only
- open source and self-hosted
- automation-friendly APIs
- no cloud lock-in
- no attempt to compete with full-service deckbuilding or marketplace apps

## Current Routes

- `/`
- `/search`
- `/inventory`
- `/decks`

## Architecture

```text
SvelteKit -> Postgres
          -> MeiliSearch
          -> Python worker -> Scryfall data
```

Core stack:

- Postgres for user-scoped application data
- SvelteKit for the frontend
- MeiliSearch for catalog search
- Python worker for MTG catalog ingestion and sync
- generic OIDC for authentication, with Zitadel as one supported provider

## Status

| Area             | Status                                      |
| ---------------- | ------------------------------------------- |
| MTG search       | Implemented (active)                        |
| MTG inventory    | Implemented (active, being improved)        |
| MTG decks        | Implemented, product surface needs redesign |
| MTG scan         | Backend scaffold and review flow foundation |
| Non-MTG adapters | Out of scope                                |

## Documentation

- [Docs index](docs/README.md)
- [Platform overview](docs/product/platform-overview.md)
- [Routing and games](docs/product/routing-and-games.md)
- [Deployment guide](docs/operations/deployment.md)
- [OIDC setup](docs/operations/oidc.md)
- [Zitadel setup](docs/operations/zitadel.md)

## License

[GNU Affero General Public License v3.0](LICENSE)

## Acknowledgements

- Card data provided by [Scryfall](https://scryfall.com/)
