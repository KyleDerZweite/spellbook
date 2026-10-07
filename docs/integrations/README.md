# Integrations

- Status: Canonical
- Last Reviewed: 2026-10-07
- Source of Truth: mixed
- Update Triggers: external system contracts, integration scope and provider evaluations
- Related Docs: [Market price research](./market-prices.md), [Card and deck categorization](./card-categorization.md), [Realtime backend evaluation](./realtime-backends.md), [Proposed card robot](./card-robot.md), [Worker](../architecture/worker.md), [Catalog](../architecture/catalog.md), [Docs index](../README.md), [Application contract](../architecture/application-contract.md), [Category rules](../architecture/category-rules.md)

The [card robot proposal](./card-robot.md) defines future scanner and sorter boundaries. It is not implemented hardware support.

Scryfall ingestion belongs to the [worker architecture](../architecture/worker.md), and PostgreSQL catalog contracts belong to [catalog architecture](../architecture/catalog.md).

[Market price research](./market-prices.md) records implemented Scryfall baseline references and provider evaluation. [Value tracking](../product/value-tracking.md) owns current reference presentation and planned value-only personal Inventory history. Scryfall EUR references and supplied product links are implemented. Optional Cardmarket and MTGJSON adapters and bounded public market history are implemented with explicit opt-ins. Acquisition-cost tracking is removed from scope. Marketplace account connections remain outside this pass; a sales/trading ledger is not implemented.

[Card and deck categorization](./card-categorization.md) records Oracle Tags coverage and the Jev/local-model evaluation. [Card grouping](../product/card-grouping.md) owns implemented starter entry categories and later category behavior. The optional local Commander Spellbook adapter is selected and unbuilt; [category rules](../architecture/category-rules.md) owns implemented public facts and starter decisions alongside its later planned mechanisms.

[Realtime backend evaluation](./realtime-backends.md) records dated Convex pricing, client and auth coupling, and the choice to retain PostgreSQL for the current pass. Q56 accepted PostgreSQL LISTEN/NOTIFY with account-scoped SSE; [application contract](../architecture/application-contract.md#saved-state-synchronization) owns the mechanisms. SavedState transport and Profile synchronization are implemented and verified. Mounted Profile/Dashboard/Inventory/Deck/Scan consumers are implemented; rendered workspace acceptance remains separate.
