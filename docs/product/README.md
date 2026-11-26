# Product docs

- Status: Canonical
- Last Reviewed: 2026-11-26
- Source of Truth: product documents
- Update Triggers:
  - managed Category removal
  - product document ownership
  - specification changes
  - deck legality rules (`deck-rules` v1)
  - glossary changes
  - routes
  - interface requirements
  - value tracking
- Related Docs:
  - [Specification](./specification.md)
  - [Deck format legality rules](./deck-rules.md)
  - [Domain model](../../GLOSSARY.md)
  - [Routes](./routing-and-games.md)
  - [UI direction](./ui-design-direction.md)
  - [Android design handoff](./mobile-app-exploration.md)
  - [Card grouping](./card-grouping.md)
  - [Value tracking](./value-tracking.md)
  - [Docs index](../README.md)

> **TL;DR**
>
> - What Spellbook does for users, and the words it uses.
> - Start with the [product specification](./specification.md).
> - Implementation details live in [architecture](../architecture/README.md). Runtime setup lives in
>   [operations](../operations/README.md).

## Documents

| Document                                                          | Owns                                                                                                                                          |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| [Product specification](./specification.md)                       | Functional requirements, implementation status, planned capabilities and acceptance checks                                                    |
| [Domain model](../../GLOSSARY.md)                                 | Card, inventory, deck, availability and review terminology                                                                                    |
| [Routes](./routing-and-games.md)                                  | Implemented pages, API paths and compatibility redirects                                                                                      |
| [UI design direction](./ui-design-direction.md)                   | Interaction patterns, component choices and visual requirements                                                                               |
| [Website and Android design handoff](./mobile-app-exploration.md) | Active Android journeys, compact app structure, Cardstation/capture simulations, source references and online-first implementation boundaries |
| [Card grouping](./card-grouping.md)                               | Inventory groups and memberships, Deck type groups and the read-only related Token appendix                                                   |
| [Deck format legality rules](./deck-rules.md)                     | Versioned `deck-rules` v1 format legality, Commander color-identity, eligibility/pairing checks and non-blocking warning policy               |
| [Value tracking](./value-tracking.md)                             | Scryfall and optional references, public source history, product links, value-only daily Inventory history and selected-Deck estimates        |

[Market price research](../integrations/market-prices.md) owns provider facts and evaluation.
Superseded product documents live in Git history, not in a parallel archive.
