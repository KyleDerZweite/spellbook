# Value tracking

- Status: Scryfall reference prices and product links implemented; account value history and costs planned
- Last Reviewed: 2026-10-07
- Source of Truth: accepted maintainer requirements and Q56 design, existing Inventory behavior
- Update Triggers: price providers and fallback policy, daily history, reporting currency and timezone, cost batches, allocation and correction rules, tracking rollout and demo assumptions, valuation UI and API contracts
- Related Docs: [Product index](./README.md), [Specification](./specification.md), [Domain glossary](../../GLOSSARY.md), [Market price research](../integrations/market-prices.md), [Postgres](../architecture/postgres.md), [Worker](../architecture/worker.md), [System overview](../architecture/system-overview.md), [Design direction](./ui-design-direction.md), [Value and cost persistence](../architecture/value-and-costs.md), [Application contract](../architecture/application-contract.md)

## Selected scope

The maintainer selected daily Card and Inventory value history, acquisition-cost coverage and Pack/Bulk cost batches for this pass. A cost batch assigns an entered acquisition amount to specified card quantities. It can cover cards already scanned into Inventory without increasing their quantities again. The comparison with a reference value is an estimated value difference, not realized profit.

An explicitly free acquisition has a known zero cost; a forgotten purchase amount remains unknown. Persist that distinction. The maintainer selected zero as the calculation assumption for unknown acquisition costs, while displaying the cost as unknown. Estimated differences must expose that assumption and cost coverage. Missing market references remain unknown. Daily price and calculation cadence is sufficient; variation within a day is acceptable.

Trading starts with external product links. Sales, proceeds, sale fees, realized profit and the retrospective purchase/sale ledger are deferred. Marketplace account connections, listings, stock synchronization, orders and automatic transaction imports are outside this pass.

The selected source set is Scryfall as the baseline, with optional Cardmarket Price Guide and MTGJSON imports. Requiring a configured API key is acceptable for an optional source. Accounts must still work when optional sources are disabled, unconfigured or missing a reference. Preserve an unknown value when no eligible configured source supplies one. References with the same upstream are not independent confirmations. The [provider research](../integrations/market-prices.md) owns source availability, measures and mapping limits.

For EUR totals, prefer eligible fresh references before stale fallbacks. Within the same freshness class, prefer configured Cardmarket trend, then Scryfall EUR, then a matching MTGJSON EUR reference. Preserve the chosen source and measure with every observation. This priority does not make different source measures interchangeable or independent confirmations. The maintainer confirmed this policy on 2026-10-06.

References are fresh through 24 hours from source time, then eligible as stale through seven days. Reimporting unchanged data does not reset that age. Within each source, prefer exact printing before the eligible English fallback. Thus a fresh higher-priority English fallback can precede a fresh lower-priority exact printing. For MTGJSON EUR totals, only the validated paper/Cardmarket/retail series with matching normal or foil finish is eligible; its measure remains retail reference rather than Cardmarket trend. Absent or ambiguous series remain unknown. Q56 accepted this ordering and eligibility.

When a daily refresh fails, expose the failed refresh status and retain the last valid reference with its original source date. Its age still determines freshness: a reference within 24 hours remains fresh, then it is eligible as stale through seven days. Show its source date and stale coverage. After that limit it is unknown for current totals. A successful source response with a missing or null reference does not preserve an older price as its current result. Check eligible configured fallbacks, then report unknown.

## Current implementation

Inventory currently stores aggregate printing, finish and condition quantities without purchase or sale records. Its quantity mutations can delete an entry when no copies remain. Dashboard totals do not include prices or historical value. No ledger, cost allocation or daily financial snapshots are implemented.

The selected tracking model must preserve current Inventory identity and account isolation. Cost-batch records and daily history must survive removal or recreation of a current Inventory entry. Cost records must not imply individual physical-copy identifiers or deck reservations.

## Selected mutation and cost behavior

Ordinary Add, scan, import and quantity flows stay direct and do not require financial fields. Added quantities start with unknown costs until explicitly assigned. Cost assignment must distinguish newly added quantities from older copies of the same printing, finish and condition. Inventory group membership covers an entire entry and cannot identify just the copies from a pack. Logical acquisition lots can distinguish those quantities without adding physical-copy identifiers. Normal quantity reductions retire the oldest lots first, whether their costs are known or unknown. A later Add starts a new unknown-cost lot. This FIFO policy records no sale.

New cost batches allocate currently held unknown-cost quantities. Scan and import quantities can provide a preselection. Assignment does not add quantities again. Known costs change through an explicit correction to the existing batch. Removed quantities retain recorded history but cannot receive a new batch allocation in this pass.

The default allocation divides half the Batch total equally per selected copy and half in proportion to those copies' eligible EUR reference values. Quantities count as copies, not distinct entry names. If any selected card lacks an eligible reference, or the weighted reference sum is zero, the entire Batch uses equal allocation. The Preview shows the method, quantities and source dates. Preserve the exact EUR total with deterministic cent rounding. Store the allocation and reference observations used; later daily price changes do not reassign acquisition costs.

Adding or correcting a batch cost restates affected stored cost and estimated value-difference statistics, with a traceable correction revision. Preserve the historical quantities and market references. Do not invent days before tracking began or fill missing daily data. A price refresh alone never changes allocated acquisition costs. The maintainer confirmed FIFO and historical cost restatement on 2026-10-06.

The maintainer confirmed that the review dataset consists of demonstration cards and decks, with no production account holdings to reconstruct. This pass does not need a legacy purchase-evidence recovery flow.

## Reporting requirements

EUR is the selected currency for entered costs and tracking totals. Other source currencies can appear separately but must not enter EUR aggregates without a selected conversion policy. Automatic currency conversion is outside this pass.

The selected reporting calendar uses an instance-configurable timezone, defaulting to `Europe/Berlin`. Daily history captures the end-of-day state. Current holdings remain live and current estimated value uses the latest eligible daily prices. Missing historical days are visible gaps. Preserve the calendar and source dates attached to existing snapshots rather than silently relabeling them after a timezone change.

Keep price coverage and acquisition-cost coverage distinct. A market-value estimate uses eligible references for the held quantities. Its estimated difference subtracts allocated costs for those same quantities, using the selected zero assumption for unknown costs. Show known cost, unknown-cost quantities and the assumption separately. A known free copy and an unknown-cost copy contribute the same assumed cost to this calculation but have different evidence status. Newly added holdings can increase estimated value without establishing realized profit.

The zero assumption applies only to acquisition costs. Missing market prices must not become zero. A card without an eligible reference has an unknown value difference. Aggregate comparisons of covered quantities must show that coverage and cannot claim a complete Batch or Inventory result when reference prices are missing.

Every reference retains its source, measure where known, currency and data time. Prefer an exact product/printing and finish match. If a differently named language printing has no price, an unambiguous English printing from the same edition, collector number and printing variant may supply a visibly marked fallback. Variant mapping must account for relevant artwork and promotional differences; ambiguity remains unknown. Finish must match. Etched does not inherit a Foil or Nonfoil price. References have no invented condition discount and remain estimates. The maintainer confirmed this fallback on 2026-10-06.

A source import time is not the time of an individual market sale. Historical values must use stored observations for their date, rather than today's price presented as an older observation.

The current quantity state remains separate from daily history. Daily history begins when valid tracking records exist. Missing historical data must remain visible. Report unknown or partial results with their coverage rather than presenting a complete gain or value.

Retain personal daily holdings history and the historical references needed for that history without automatic expiry. The complete unused catalog needs current prices, not indefinite daily price history for every printing. Missing observations must not be synthesized from today's values.

Dashboard summarizes current values, coverage and daily history. Inventory and Card Details show relevant price references and entry points to cost assignment. A private Costs/History workspace provides batch capture and corrections, reachable from Dashboard and Inventory. Its implementation must provide the accepted preview, frozen-reference commitment and correction behavior; no route or completed UI is claimed here. Public Home retains its accepted design.

Decks also show the estimated reference value of all required cards and of their missing quantities. These are market estimates, separate from the owner's acquisition costs. Deck entries do not currently specify a finish, so this calculation uses nonfoil references and exposes unknown quantities and coverage. Availability does not reserve owned copies.

## Accepted implementation contract

Kyle accepted the lot-portion, exact-cent, correction and capture mechanisms in Q56 on 2026-10-06. [Value and cost persistence](../architecture/value-and-costs.md) owns stable quantity intervals, compressed cent allocations, frozen observations, revision checks, PostgreSQL lease capture and atomic historical restatement. [The application contract](../architecture/application-contract.md) owns authorization, shared use cases, locking and replay acknowledgements.

Corrections preserve original batch membership, method and reference weights, including retired portions. Acquisition-date edits are descriptive and neither backdate holdings nor reorder FIFO. The default configurable daily capture tolerance is five minutes around day close. Missed captures remain gaps; restart never invents an uncaptured day from current holdings. These accepted mechanisms are unimplemented and still require their real-database/source/browser evidence.

## Current reference presentation

Card Details and the Inventory inspector show exact-finish Scryfall EUR references, source date/measure, freshness and marked English fallback. Owned-entry reads derive quantities from the authenticated account and show covered/unknown quantity; stale is a subset of covered. Missing references remain Unknown, including when product links exist. Safe supplied marketplace links render independently of EUR availability or optional adapters. They do not establish finish/condition stock or a guaranteed sale amount. [Value persistence](../architecture/value-and-costs.md#implemented-scryfall-references) owns implementation; full-account values, costs and personal daily history remain planned.

An open Inventory Inspector reloads its private reference after a confirmed write acknowledgement, Inventory revision or saved entry snapshot changes. A successful write invalidates the old private estimate even if the subsequent Inventory-window refresh fails. Unsaved quantity drafts never change the estimate or enter the price request. Account/opening/request guards discard late responses before and after JSON parsing. A removed selected entry clears its old quantity/reference and reports that the entry is unavailable.
