# Value tracking

- Status: Market references, public source history and product links implemented; account value summaries and personal daily history planned
- Last Reviewed: 2026-10-08
- Source of Truth: implemented reference contracts and Kyle's value-only scope decision of 2026-10-07
- Update Triggers: price providers and fallback policy, value coverage, daily history, reporting currency and timezone, retention, valuation UI and API contracts
- Related Docs: [Product index](./README.md), [Specification](./specification.md), [Domain glossary](../../GLOSSARY.md), [Market price research](../integrations/market-prices.md), [Valuation](../architecture/valuation.md), [Application contract](../architecture/application-contract.md), [ADR-0020](../decisions/0020-value-only-inventory-history.md)

## Selected scope

Kyle selected card and Inventory market reference value and history on 2026-10-07. This document owns those requirements. Buy prices, acquisition records, pack/bulk cost tracking, allocation, cost corrections and gain/profit calculations are removed from the selected scope, rather than deferred requirements. [ADR-0020](../decisions/0020-value-only-inventory-history.md) supersedes the earlier cost-dependent decision.

Keep aggregate Inventory entries defined by printing, finish and condition. Add, Scan, import and quantity flows remain direct. No acquisition lots, FIFO retirement, financial fields or individual physical-copy identifiers are needed for value tracking. Inventory groups select whole entries and do not create separate ownership. Deck availability does not reserve copies.

External product links remain available independently of prices. Marketplace account connections, listings, stock synchronization, orders and automatic transaction imports are outside this pass.

## Reference selection and coverage

The selected source set is Scryfall as the baseline, with optional Cardmarket Price Guide and MTGJSON imports. The implemented optional public downloads need no account or API key. Accounts must still work when optional sources are disabled, unconfigured or missing a reference. Preserve an unknown value when no eligible configured source supplies one. References with the same upstream are not independent confirmations. The [provider research](../integrations/market-prices.md) owns source availability, measures and mapping limits.

For EUR totals, prefer eligible fresh references before stale fallbacks. Within the same freshness class, prefer configured Cardmarket trend, then Scryfall EUR, then a matching MTGJSON EUR reference. Preserve the chosen source and measure with every observation. This priority does not make different source measures interchangeable or independent confirmations. The maintainer confirmed this policy on 2026-10-06.

References are fresh through 24 hours from source time, then eligible as stale through seven days. Reimporting unchanged data does not reset that age. Within each source, prefer exact printing before the eligible English fallback. Thus a fresh higher-priority English fallback can precede a fresh lower-priority exact printing. For MTGJSON EUR totals, only the validated paper/Cardmarket/retail series with matching normal or foil finish is eligible; its measure remains retail reference rather than Cardmarket trend. Absent or ambiguous series remain unknown. Q56 accepted this ordering and eligibility.

When a daily refresh fails, expose the failed refresh status and retain the last valid reference with its original source date. Its age still determines freshness: a reference within 24 hours remains fresh, then it is eligible as stale through seven days. Show its source date and stale coverage. After that limit it is unknown for current totals. A successful source response with a missing or null reference does not preserve an older price as its current result. Check eligible configured fallbacks, then report unknown.

Every reference retains source, measure, currency and data time. Prefer an exact printing and finish match. An unambiguous English printing from the same edition, collector number and printing variant may supply a visibly marked fallback. Mapping accounts for artwork and promotional differences; ambiguity remains unknown. Finish must match. Etched never inherits Foil or Nonfoil prices. References apply no invented condition discount and remain estimates. [Valuation](../architecture/valuation.md) owns the implemented mapping and exact-decimal mechanics.

EUR is the reporting currency. Other source currencies may appear separately but do not enter EUR aggregates without a selected conversion policy. Automatic currency conversion is outside this pass. A known zero reference is different from an unknown amount. Missing market prices must not become zero.

Market-value estimates sum quantity times eligible reference for covered holdings. Show covered, unknown and stale quantities, with stale a subset of covered. A subtotal for covered quantities is not a fully determined Inventory value. Holdings added or removed can change the total independently of market-price changes; no purchase cost or profit inference follows.

## Personal daily Inventory history

Personal history remains planned. Capture the aggregate Inventory entries and held quantities at the end of each reporting day, together with the chosen reference evidence and coverage for those quantities. Preserve printing, finish and condition identity so captured entries support card-level history as well as Inventory totals, without introducing acquisition portions. Saved history survives removal or recreation of a current entry and remains separate from live current holdings.

The reporting calendar uses an instance-configurable timezone, defaulting to `Europe/Berlin`. Preserve the calendar and source dates attached to saved observations instead of relabeling them after a timezone change. The reviewed capture contract records the last successful observation within the final minute of the day and shows its actual time. It does not claim a reconstructed exact-midnight state. A missed capture window is a gap. [Valuation](../architecture/valuation.md#reviewed-personal-history-contract) owns the runtime, transaction and route contract; implementation remains pending.

History starts when valid capture records exist. Missing days remain visible gaps. Restart must not reconstruct an uncaptured day from today's holdings. Historical values use their captured references and quantities, never today's price presented as an older observation. Empty captured holdings are known zero; a missing capture is a gap.

Retain personal daily holdings history and its captured reference evidence indefinitely, without automatic expiry. Public source history is a separate implemented rolling 90-day UTC view. Its pruning must not remove evidence needed by saved personal history. The unused Catalog does not need indefinite daily prices for every printing.

## Planned reporting and acceptance

Dashboard summaries will show current estimated Inventory value, coverage and personal daily history. Card Details continues to show printing references and public source history. No completed personal-history UI or new route is claimed here. Public Home retains its accepted design.

Planned Deck reporting estimates the reference value of all required cards and missing quantities. Deck entries currently lack a finish, so the planned calculation uses nonfoil references and exposes unknown quantities and coverage. These estimates do not change ownership, availability or nonreservation.

Sources/Rules categories, reusable definitions, manual overrides, Review/Reset and the later separate app keep their existing scope. [Card grouping](./card-grouping.md) and [the application contract](../architecture/application-contract.md) remain their owners.

The former Costs slice 12 is unmerged and is excluded from main. The replacement personal-history contract is reviewed against value-only scope and current main before implementation. Preserve unaffected reviewed boundaries and implemented references. Verify real provider selection, unknown coverage, entry removal/recreation, calendar changes, missing days, retention and account isolation against the revised design; source checks alone do not establish rendered acceptance or deployment.

## Current reference presentation

Card Details and the Inventory inspector show selected exact-finish EUR references, source date/measure, freshness and marked English fallback. Owned-entry reads derive quantities from the authenticated account and show covered/unknown quantity; stale is a subset of covered. Missing references remain Unknown, including when product links exist. Safe supplied marketplace links render independently of EUR availability or optional adapters. They do not establish finish/condition stock or a guaranteed sale amount. [Valuation](../architecture/valuation.md#implemented-market-references) owns implementation; full-account values and personal daily history remain planned.

An open Inventory Inspector reloads its private reference after a confirmed write acknowledgement, Inventory revision or saved entry snapshot changes. A successful write invalidates the old private estimate even if the subsequent Inventory-window refresh fails. Unsaved quantity drafts never change the estimate or enter the price request. Account/opening/request guards discard late responses before and after JSON parsing. A removed selected entry clears its old quantity/reference and reports that the entry is unavailable.

Card Details also shows bounded public source history, with actual Instant/Day source precision, upstream attribution and explicit gaps. This is market history, not personal holdings history. [Valuation](../architecture/valuation.md#optional-references-and-public-source-history) owns the UTC day freshness policy and source-history retention. Dashboard/Deck values and personal daily captures remain planned.
