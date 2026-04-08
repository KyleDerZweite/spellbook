# Spellbook Documentation

This directory documents the current Spellbook product and the planned platform direction.

## Canonical Docs

### Product

- [Platform overview](./platform-overview.md) - what Spellbook is today and what it is becoming
- [Routing and games](./routing-and-games.md) - current routes, canonical future route contract, and game-scoping rules
- [Feature status](./feature-status.md) - implementation status by pillar and by game
- [UI design direction](./ui-design-direction.md) - active visual and interaction direction for the product

### Operations

- [Deployment guide](./deployment.md) - generic self-hosted deployment guidance
- [Zitadel setup](./zitadel.md) - direct OIDC setup for Spellbook
- [Private instance template](./private-instance-template.md) - non-repo template for live domains, client IDs, and operator-specific notes

### Search

- [MeiliSearch overview](./meilisearch/README.md)
- [Authentication](./meilisearch/authentication.md)
- [Documents](./meilisearch/documents.md)
- [Indexes and settings](./meilisearch/indexes-and-settings.md)
- [Search API](./meilisearch/search-api.md)
- [Tasks](./meilisearch/tasks.md)

### Reference

- [Bits UI reference index](./bits-ui.md)
- [Mana font reference](./fonts/mana.md)

## Current Truth

- MTG is the only implemented game today.
- The live product routes are `/`, `/mtg/`, `/mtg/search`, `/mtg/inventory`, and `/mtg/decks`.
- `/search` and `/collections*` still exist only as temporary MTG redirects.
- Spellbook already uses game-aware backend models, but non-MTG adapters are not implemented yet.

## Planned Direction

The long-term route contract is:

```text
/:game/{index,search,inventory,decks,play}
```

This contract is documented as platform direction, not as fully implemented behavior.

## Historical Docs

The [superpowers](./superpowers/README.md) directory is historical. Those files describe earlier collection-era plans and should not be used as the current source of truth.

## Follow-Up Outside This Pass

The in-app legal pages under `frontend/src/routes/privacy` and `frontend/src/routes/terms` are still instance-specific and MTG-specific. They are intentionally not updated in this documentation pass.
