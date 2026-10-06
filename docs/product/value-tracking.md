# Value tracking

- Status: Design in progress, not implemented
- Last Reviewed: 2026-10-06
- Source of Truth: accepted maintainer requirements, existing Inventory behavior and explicitly marked open decisions
- Update Triggers: price providers and fallback policy, daily history, reporting currency and timezone, cost batches, allocation and correction rules, valuation UI and API contracts
- Related Docs: [Product index](./README.md), [Specification](./specification.md), [Domain glossary](../../GLOSSARY.md), [Market price research](../integrations/market-prices.md), [Postgres](../architecture/postgres.md), [Worker](../architecture/worker.md), [System overview](../architecture/system-overview.md), [Design direction](./ui-design-direction.md)

## Selected scope

The maintainer selected daily Card and Inventory value history, acquisition-cost coverage and Pack/Bulk cost batches for this pass. A cost batch assigns an entered acquisition amount to specified card quantities. It can cover cards already scanned into Inventory without increasing their quantities again. The comparison with a reference value is an estimated value difference, not realized profit.

Existing holdings start with unknown acquisition costs. An explicitly free acquisition has a known zero cost; a forgotten purchase amount remains unknown. Missing references and costs are not zero. Daily price and calculation cadence is sufficient; variation within a day is acceptable.

Trading starts with external product links. Sales, proceeds, sale fees, realized profit and the retrospective purchase/sale ledger are deferred. Marketplace account connections, listings, stock synchronization, orders and automatic transaction imports are outside this pass.

The selected source set is Scryfall as the baseline, with optional Cardmarket Price Guide and MTGJSON imports. Requiring a configured API key is acceptable for an optional source. Accounts must still work when optional sources are disabled, unconfigured or missing a reference. Preserve an unknown value when no eligible configured source supplies one. References with the same upstream are not independent confirmations. The [provider research](../integrations/market-prices.md) owns source availability, measures and mapping limits. Precedence and exact matching remain under review.

When a daily refresh fails, the last valid reference remains eligible for current totals for up to seven days, visibly marked stale. Show its source date and stale coverage. After that limit it is unknown for current totals. A successful source response with a missing or null reference does not preserve an older price as its current result. Check eligible configured fallbacks, then report unknown.

## Current implementation

Inventory currently stores aggregate printing, finish and condition quantities without purchase or sale records. Its quantity mutations can delete an entry when no copies remain. Dashboard totals do not include prices or historical value. No ledger, cost allocation or daily financial snapshots are implemented.

The selected tracking model must preserve current Inventory identity and account isolation. Cost-batch records and daily history must survive removal or recreation of a current Inventory entry. Cost records must not imply individual physical-copy identifiers or deck reservations.

Ordinary Add, scan, import and quantity flows stay direct and do not require financial fields. Added quantities start with unknown costs until explicitly assigned. Cost assignment must distinguish newly added quantities from older copies of the same printing, finish and condition. Inventory group membership covers an entire entry and cannot identify just the copies from a pack. Logical acquisition lots can distinguish those quantities without adding physical-copy identifiers. The earlier FIFO choice remains the proposed removal policy for the reduced scope; allocation eligibility and correction behavior are still under review.

## Reporting requirements

EUR is the selected currency for entered costs and tracking totals. Other source currencies can appear separately but must not enter EUR aggregates without a selected conversion policy. Automatic currency conversion is outside this pass.

The selected reporting calendar uses an instance-configurable timezone, defaulting to `Europe/Berlin`. Daily history captures the end-of-day state. Current holdings remain live and current estimated value uses the latest eligible daily prices. Missing historical days are visible gaps. Preserve the calendar and source dates attached to existing snapshots rather than silently relabeling them after a timezone change.

Keep price coverage and acquisition-cost coverage distinct. A market-value estimate uses eligible price references for the held quantities. A complete estimated difference requires both reference values and known costs for those same quantities. Show known amounts and coverage when data is incomplete, rather than extrapolating a complete gain. Newly added holdings can increase estimated value without establishing a gain.

Every reference retains its source, measure where known, currency and data time. Exact printing and finish, language fallback, condition limits and stale-source handling need explicit rules. A source import time is not the time of an individual market sale. Historical values must use stored observations for their date, rather than today's price presented as an older observation.

The current quantity state remains separate from daily history. Daily history begins when valid tracking records exist. Missing historical data must remain visible. Report unknown or partial results with their coverage rather than presenting a complete gain or value.

Retain personal daily holdings history and the historical references needed for that history without automatic expiry. The complete unused catalog needs current prices, not indefinite daily price history for every printing. Missing observations must not be synthesized from today's values.

Dashboard summarizes current values, coverage and daily history. Inventory and Card Details show relevant price references and entry points to cost assignment. A private Costs/History workspace provides batch capture and corrections, reachable from Dashboard and Inventory. Its route and interaction design remain to be reviewed. Public Home retains its accepted design.

Decks also show the estimated reference value of all required cards and of their missing quantities. These are market estimates, separate from the owner's acquisition costs. Deck entries do not currently specify a finish, so this calculation uses nonfoil references and exposes unknown quantities and coverage. Availability does not reserve owned copies.

## Decisions still open

The review must settle equal or alternative batch allocation, eligible quantities, removal policy, and whether later cost corrections restate earlier cost statistics. It must also settle provider precedence, exact printing/finish matching and any explicit language fallback.

These requirements do not make the implementation slice Ready. Reconcile the product, module, mutation and acceptance contracts before implementation.
