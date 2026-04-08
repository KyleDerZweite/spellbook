# Spellbook

**MTG-first, multi-TCG platform for search, inventory, decks, and future play**

Spellbook is a self-hosted trading card game platform. Today, MTG is the only implemented game. The live product currently exposes a game selector at `/`, with MTG under `/mtg/`.

Current MTG product areas:

- search
- inventory
- decks

Planned platform direction:

- per-game routing under `/:game/...`
- future `play` surface per supported game

## Current Routes

- `/`
- `/mtg/`
- `/mtg/search`
- `/mtg/inventory`
- `/mtg/decks`

Top-level `/search` and `/collections*` still exist only as temporary MTG redirects and are planned for removal.

## Planned Route Model

The long-term route contract is:

```text
/:game/{index,search,inventory,decks,play}
```

This is the planned platform shape, not the current implementation status for all games.

## Architecture

```text
SvelteKit -> SpacetimeDB -> MeiliSearch
                    \
                     -> Python worker -> Scryfall data
```

Core stack:

- SpacetimeDB for user-scoped real-time data
- SvelteKit for the frontend
- MeiliSearch for catalog search
- Python worker for MTG catalog ingestion and sync
- Zitadel for direct OIDC authentication

## Status

| Area | Status |
|------|--------|
| MTG search | Implemented |
| MTG inventory | Implemented |
| MTG decks | Implemented |
| MTG play | Not implemented |
| Non-MTG adapters | Not implemented |

## Documentation

- [Docs index](/home/kyle/CodingProjects/spellbook/docs/README.md)
- [Platform overview](/home/kyle/CodingProjects/spellbook/docs/platform-overview.md)
- [Routing and games](/home/kyle/CodingProjects/spellbook/docs/routing-and-games.md)
- [Deployment guide](/home/kyle/CodingProjects/spellbook/docs/deployment.md)
- [Zitadel setup](/home/kyle/CodingProjects/spellbook/docs/zitadel.md)

## License

[GNU Affero General Public License v3.0](LICENSE)

## Acknowledgements

- Card data provided by [Scryfall](https://scryfall.com/)
