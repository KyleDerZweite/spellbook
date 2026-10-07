# ADR-0018: Acquisition portions and atomic history restatement

- Status: Superseded by ADR-0020
- Date: 2026-10-06
- Last Reviewed: 2026-10-07
- Owners: Kyle
- Source of Truth: Kyle's Q56 acceptance of the reviewed implementation contract
- Update Triggers: supersession status and historical decision references
- Related Docs: [Value tracking](../product/value-tracking.md), [Valuation](../architecture/valuation.md), [Application contract](../architecture/application-contract.md), [ADR-0015](./0015-shared-backend-use-cases-and-client-contracts.md), [Decisions](./README.md)

## Supersession

Kyle removed all acquisition and cost tracking from the selected scope on 2026-10-07. [ADR-0020](./0020-value-only-inventory-history.md) supersedes this decision. The unmerged Costs slice is not part of main; its dependent personal-history design requires value-only rereview. The original decision below is retained for provenance and must not guide new implementation.

## Context

This was accepted design on 2026-10-06, not an implemented capability on main.

Aggregate Inventory entries do not distinguish acquisition costs within a quantity. Partial reductions and later corrections need durable historical quantities and exact cost portions without physical-copy identity or a sales ledger.

## Decision

Kyle accepted stable lot quantity intervals, FIFO retirement and compressed exact-cent allocation runs in Q56. Freeze preview references and retain original batch membership/method/weights through amount/date/reason correction. An independent Node backend runner uses a PostgreSQL lease for committed daily captures with actual time, calendar version and a configurable five-minute tolerance. Assignments/corrections restate affected history through indexed interval intersections in the same cost transaction.

## Consequences

Portions preserve exact partial-reduction cost and traceable restatement after entry deletion. More persistence is required than aggregate costs. Synchronous restatement guarantees atomic visible statistics but must be benchmarked over long histories; change the design if that cost is unacceptable. Missing days stay gaps. Corrections neither rewrite historical quantities/market observations nor backdate ownership. Existing demo quantities activate additively with unknown costs.
