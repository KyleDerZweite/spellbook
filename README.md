# Spellbook

**MTG-first, multi-TCG platform for search, inventory, decks, and scan**

Spellbook is a self-hosted trading card game platform. Today, MTG is the only implemented game. The live product currently exposes a game selector at `/`, with MTG under `/mtg/`.

Active MTG product areas:

- search
- inventory
- scan (backend scaffold, frontend surface in progress)

Implemented but hidden from the active surface:

- decks (reachable at `/mtg/decks` via direct URL)

Planned platform direction:

- flat user-facing routes with active game stored in client state
- future supported games sharing the same search, inventory, scan, and deck surfaces

## Current Routes

- `/`
- `/mtg/`
- `/mtg/search`
- `/mtg/inventory`
- `/mtg/decks`

Top-level `/search` and `/collections*` still exist only as temporary MTG redirects and are planned for removal.

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
- Zitadel for direct OIDC authentication

## Status

| Area | Status |
|------|--------|
| MTG search | Implemented (active) |
| MTG inventory | Implemented (active, being improved) |
| MTG scan | Backend scaffold, frontend surface in progress |
| MTG decks | Implemented, hidden from product surface |
| Non-MTG adapters | Not implemented |

## Documentation

- [Docs index](/home/kyle/CodingProjects/spellbook/docs/README.md)
- [Platform overview](/home/kyle/CodingProjects/spellbook/docs/product/platform-overview.md)
- [Routing and games](/home/kyle/CodingProjects/spellbook/docs/product/routing-and-games.md)
- [Deployment guide](/home/kyle/CodingProjects/spellbook/docs/operations/deployment.md)
- [Zitadel setup](/home/kyle/CodingProjects/spellbook/docs/operations/zitadel.md)

## License

[GNU Affero General Public License v3.0](LICENSE)

## Acknowledgements

- Card data provided by [Scryfall](https://scryfall.com/)
