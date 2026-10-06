# Integrations

- Status: Canonical
- Last Reviewed: 2026-10-06
- Source of Truth: mixed
- Update Triggers: external system contracts, integration scope and provider evaluations
- Related Docs: [Market price research](./market-prices.md), [Card and deck categorization](./card-categorization.md), [Realtime backend evaluation](./realtime-backends.md), [Proposed card robot](./card-robot.md), [Worker](../architecture/worker.md), [Catalog](../architecture/catalog.md), [Docs index](../README.md)

The [card robot proposal](./card-robot.md) defines future scanner and sorter boundaries. It is not implemented hardware support.

Scryfall ingestion belongs to the [worker architecture](../architecture/worker.md), and PostgreSQL catalog contracts belong to [catalog architecture](../architecture/catalog.md).

[Market price research](./market-prices.md) compares sources for the selected value-tracking pass. [Value tracking](../product/value-tracking.md) owns the planned cost-batch and daily-history behavior. Prices, cost allocation and trading connections are not implemented.

[Card and deck categorization](./card-categorization.md) records Oracle Tags coverage and the Jev/local-model evaluation. [Card grouping](../product/card-grouping.md) owns the category behavior under review.

[Realtime backend evaluation](./realtime-backends.md) records dated Convex pricing, client and auth coupling, and the choice to retain PostgreSQL for the current pass. The synchronization mechanism remains under design review.
