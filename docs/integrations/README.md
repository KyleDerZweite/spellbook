# Integrations

- Status: Canonical
- Last Reviewed: 2026-10-06
- Source of Truth: mixed
- Update Triggers: external system contracts, integration scope and provider evaluations
- Related Docs: [Market price research](./market-prices.md), [Realtime backend evaluation](./realtime-backends.md), [Proposed card robot](./card-robot.md), [Worker](../architecture/worker.md), [Catalog](../architecture/catalog.md), [Docs index](../README.md)

The [card robot proposal](./card-robot.md) defines future scanner and sorter boundaries. It is not implemented hardware support.

Scryfall ingestion belongs to the [worker architecture](../architecture/worker.md), and PostgreSQL catalog contracts belong to [catalog architecture](../architecture/catalog.md).

[Market price research](./market-prices.md) compares Scryfall and marketplace reference data for a later Inventory valuation. Prices, cost basis and trading connections are not implemented.

[Realtime backend evaluation](./realtime-backends.md) records dated Convex pricing, client and auth coupling, and the choice to retain PostgreSQL for the current pass. The synchronization mechanism remains under design review.
