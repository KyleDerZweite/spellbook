# Spellbook

**Your Magic: The Gathering Collection Companion**

Spellbook is a self-hosted card collection management platform built for speed and real-time collaboration.

> This project is under active redesign (V1). The codebase is pre-release and not yet functional. See [`docs/superpowers/specs/`](docs/superpowers/specs/) for the current architecture spec.

## V1 Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│   SvelteKit     │───▶│   SpacetimeDB        │───▶│   MeiliSearch   │
│   (Web App)     │     │   (TS Modules + DB)  │     │   (Search)      │
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
- **SvelteKit** - web frontend with SSR
- **MeiliSearch** - full-text card search
- **Python worker** - Scryfall sync, background jobs

## Status

| Component | Status |
|-----------|--------|
| SpacetimeDB module | Planned |
| SvelteKit frontend | Planned |
| MeiliSearch integration | Planned |
| Python sync worker | Planned |

## License

[GNU Affero General Public License v3.0](LICENSE)

## Acknowledgements

- Card data provided by [Scryfall](https://scryfall.com/)
- Architecture and design assisted by [Claude](https://claude.ai) (Anthropic)
