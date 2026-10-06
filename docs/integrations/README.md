# Integrations

- Status: Canonical
- Last Reviewed: 2026-10-06
- Source of Truth: mixed
- Update Triggers: external system contracts and integration scope
- Related Docs: [Market price research](./market-prices.md), [Proposed card robot](./card-robot.md), [Worker](../architecture/worker.md), [Catalog](../architecture/catalog.md), [Docs index](../README.md)

The [card robot proposal](./card-robot.md) defines future scanner and sorter boundaries. It is not implemented hardware support.

Scryfall ingestion belongs to the [worker architecture](../architecture/worker.md), and PostgreSQL catalog contracts belong to [catalog architecture](../architecture/catalog.md).

[Market price research](./market-prices.md) compares Scryfall and marketplace reference data for a later Inventory valuation. Prices, cost basis and trading connections are not implemented.
