# Spellbook

**MTG-first, multi-TCG-ready inventory and deck companion**

Spellbook is a self-hosted trading card game inventory platform built for speed and real-time collaboration. The app now uses a game selector at `/`, with MTG living under `/mtg/` and room for future Pokemon, Yu-Gi-Oh!, and other TCG-specific experiences.

> MTG is the first implemented game. The current MVP includes MTG search, a canonical owned inventory, set progress, deck management, and a spellbook-style inventory mode.

## V1 Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│   SvelteKit     │────▶│   SpacetimeDB        │────▶│   MeiliSearch   │
│   (Game-scoped) │     │   (TS Modules + DB)  │     │   (Search)      │
└─────────────────┘     └──────────────────────┘     └─────────────────┘
                                   │
                        ┌──────────┴──────────┐
                        ▼                     ▼
              ┌─────────────────┐   ┌─────────────────┐
              │  Python Worker  │   │  Scryfall Data  │
              │  (Sync + Jobs)  │   │  (Card Catalog) │
              └─────────────────┘   └─────────────────┘
```

**Stack:**
- **SpacetimeDB** - real-time database with TypeScript modules (replaces FastAPI + PostgreSQL + WebSockets)
- **SvelteKit** - game-scoped web frontend with SSR
- **MeiliSearch** - full-text card search
- **Python worker** - Scryfall sync, background jobs

## Product Model

- `/` is the game selector
- `/mtg/` is the MTG landing page
- `/mtg/search` searches the MTG catalog
- `/mtg/inventory` tracks one canonical owned MTG inventory with list and spellbook modes
- `/mtg/decks` manages MTG decks separately from inventory, with owned-versus-required counts

## Status

| Component | Status |
|-----------|--------|
| SpacetimeDB module | Implemented (Phase 1) |
| Python sync worker | Implemented (Phase 2) |
| MeiliSearch integration | Implemented for MTG |
| SvelteKit frontend | Implemented for MTG selector, search, inventory, and decks |

## License

[GNU Affero General Public License v3.0](LICENSE)

## Acknowledgements

- Card data provided by [Scryfall](https://scryfall.com/)
- Architecture and design assisted by [Claude](https://claude.ai) (Anthropic)
