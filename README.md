# Spellbook

**Your Magic: The Gathering Collection Companion**

Spellbook is a self-hosted card collection management platform built for speed and real-time collaboration.

> Active V1 redesign in progress. Backend infrastructure is functional; frontend is next. See [`docs/superpowers/specs/`](docs/superpowers/specs/) for architecture details.

## V1 Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│   SvelteKit     │────▶│   SpacetimeDB        │────▶│   MeiliSearch   │
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
| SpacetimeDB module | Implemented (Phase 1) |
| Python sync worker | Implemented (Phase 2) |
| MeiliSearch integration | Partial (indexing done, frontend search pending) |
| SvelteKit frontend | Planned (Phase 3) |

## License

[GNU Affero General Public License v3.0](LICENSE)

## Acknowledgements

- Card data provided by [Scryfall](https://scryfall.com/)
- Architecture and design assisted by [Claude](https://claude.ai) (Anthropic)
