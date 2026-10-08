# ADR-0022: Daily value observation checkpoints

- Status: Accepted, technical design reviewed; implementation pending
- Date: 2026-10-08
- Last Reviewed: 2026-10-08
- Owners: Kyle
- Source of Truth: accepted value-only requirements and technical capture contract
- Update Triggers: daily observation tolerance, calendar changes, snapshot consistency, retention, runtime scheduling and acceptance evidence
- Related Docs: [Value tracking](../product/value-tracking.md), [Valuation](../architecture/valuation.md#reviewed-personal-history-contract), [ADR-0020](./0020-value-only-inventory-history.md), [Decisions](./README.md)

## Context

Daily personal history must preserve actual held quantities and selected market evidence. Today's holdings after restart cannot prove yesterday's state. The withdrawn cost design is not a suitable implementation dependency. Kyle authorized sequential completion of value-only history and Dashboard/Deck estimates.

## Decision

Use durable, consistent observations during the final 60 seconds of the local reporting day. Repeat attempts every ten seconds; keep the newest successful observation for that account and date. The exact observation time is visible. Eligibility follows observation time. An eligible observation begun before midnight may finish committing afterwards. An observation begun after the boundary cannot replace the date. Once eligible in-flight observations finish, the checkpoint is immutable. Missing eligible observations remain gaps, with no startup backfill.

Preserve reporting dates, timezone and actual UTC boundaries. One date has at most one stored account observation; changing timezone cannot overwrite an existing date. Keep copied reference evidence independently of live Inventory and rolling public source history. Runtime scheduling belongs to Backend Valuation and application composition. Source ingestion remains independent of private holdings. The canonical implementation contract is in Valuation.

## Consequences

This provides a documented approximation close to day end, not an exact reconstruction at midnight. A holdings change after the last successful observation cannot be silently included. Exact reconstruction would need durable mutation evidence or additional Inventory-write coupling; neither is introduced for this slice. Direct Inventory writes remain unchanged. History, current values and Deck estimates share exact selection and coverage, with no acquisition costs or profit inference. Technical and rendered acceptance remain separate from the reviewed contract.
