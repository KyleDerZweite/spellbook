# Product docs

- Status: Canonical
- Last Reviewed: 2026-11-02
- Source of Truth: product documents
- Update Triggers: managed Category removal, product document ownership, specification changes, glossary changes, routes, interface requirements, value tracking
- Related Docs: [Specification](./specification.md), [Domain model](../../GLOSSARY.md), [Routes](./routing-and-games.md), [UI direction](./ui-design-direction.md), [Android design handoff](./mobile-app-exploration.md), [Card grouping](./card-grouping.md), [Value tracking](./value-tracking.md), [Docs index](../README.md)

Product docs describe Spellbook's requirements, behavior, and user-facing language.
Start with the specification; use the other documents for their distinct subjects.

- [Product specification](./specification.md) owns functional requirements, implementation status, planned capabilities, and acceptance checks.
- [Domain model](../../GLOSSARY.md) owns card, inventory, deck, availability, and review terminology.
- [Routes](./routing-and-games.md) lists implemented pages, API paths, and compatibility redirects.
- [UI design direction](./ui-design-direction.md) owns interaction patterns, component choices, and visual requirements.
- [Website and Android design handoff](./mobile-app-exploration.md) links the active Android journeys, compact app structure, Cardstation/capture simulations, source references and online-first implementation boundaries.
- [Card grouping](./card-grouping.md) owns Inventory groups and memberships, Deck type groups and the read-only related Token appendix.
- [Value tracking](./value-tracking.md) owns current Scryfall/optional references, public source history and product-link presentation and implemented value-only daily Inventory history and selected-Deck estimates.
  [Market price research](../integrations/market-prices.md) owns provider facts and evaluation.

Internal implementation details belong in [architecture](../architecture/README.md), and runtime setup belongs in [operations](../operations/README.md).
Superseded product documents belong in git history rather than a parallel active archive.
