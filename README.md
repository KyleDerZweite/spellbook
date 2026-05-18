# Spellbook

**MTG-first, multi-TCG platform for search, inventory, decks, and scan**

Spellbook is a self-hosted trading card game platform. Today, MTG is the only implemented game. The live product uses flat user-facing routes with the active game tracked in client state.

Active MTG product areas:

- search
- inventory
- scan (backend scaffold, frontend surface in progress)

Implemented but hidden from the active surface:

- decks (reachable at `/decks` via direct URL)

Planned platform direction:

- future supported games sharing the same search, inventory, scan, and deck surfaces

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

| Area             | Status                                         |
| ---------------- | ---------------------------------------------- |
| MTG search       | Implemented (active)                           |
| MTG inventory    | Implemented (active, being improved)           |
| MTG scan         | Backend scaffold, frontend surface in progress |
| MTG decks        | Implemented, hidden from product surface       |
| Non-MTG adapters | Not implemented                                |

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
