# ADR-0020: Value-only Inventory history

- Status: Accepted
- Date: 2026-10-07
- Last Reviewed: 2026-10-07
- Owners: Kyle
- Source of Truth: Kyle's explicit 2026-10-07 instruction to drop all buy/acquisition/pack/bulk-cost tracking and consolidate value documentation
- Update Triggers: value/history scope, capture design readiness, reporting calendar, retention and supersession
- Related Docs: [Value tracking](../product/value-tracking.md), [Valuation](../architecture/valuation.md), [Domain glossary](../../GLOSSARY.md), [Application contract](../architecture/application-contract.md), [ADR-0018](./0018-acquisition-portions-and-atomic-history-restatement.md), [Decisions](./README.md)

## Context

The earlier Q56 value design combined market references with purchase-cost accounting. Kyle explicitly removed that accounting scope and requested documentation consolidation on 2026-10-07. The implemented public reference system remains useful without the unmerged cost design.

## Decision

Kyle selected card and Inventory market reference value and history instead of purchase-cost accounting. Buy prices, acquisition lots, FIFO retirement, pack/bulk allocation, cost corrections and gain/profit calculations are removed from active scope. This supersedes ADR-0018 and the cost-dependent parts of the earlier Q56 design.

Keep the implemented Scryfall baseline, optional Cardmarket/MTGJSON references, EUR selection, freshness, conservative finish/language matching, unknown coverage, supplied product links and bounded public source history. Planned personal daily history captures aggregate current Inventory quantities and their selected reference evidence. Its timezone, gaps and indefinite retention remain requirements owned by value tracking, distinct from the implemented rolling public market history.

## Consequences

The Costs slice remains unmerged. The old dependent personal-history slice needs a new design review against value-only scope and current main; its runner, schema and routes are not finalized by this decision. Deck estimates and nonreservation, Sources/Rules categories and later app delivery retain their accepted policies. This removes the cost-specific persistence and correction mechanisms while preserving historical value evidence independent of current-entry deletion and public pruning.
