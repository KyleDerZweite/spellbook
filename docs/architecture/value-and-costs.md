# Value and cost persistence

- Status: Scryfall reference publication/reads implemented; acquisition costs and personal history planned
- Last Reviewed: 2026-10-07
- Source of Truth: Kyle's Q56 acceptance of reference, lot, correction and capture mechanisms
- Update Triggers: source publication, mapping, lot intervals, exact allocation, cost revisions, daily capture, retention, historical restatement and acceptance evidence
- Related Docs: [Architecture](./README.md), [Value tracking](../product/value-tracking.md), [Market price research](../integrations/market-prices.md), [Application contract](./application-contract.md), [Postgres](./postgres.md), [Worker](./worker.md), [ADR-0018](../decisions/0018-acquisition-portions-and-atomic-history-restatement.md)

[Value tracking](../product/value-tracking.md) owns user-facing prices, cost coverage, allocation policy, reporting calendar and estimates. This document owns their accepted persistence and execution mechanisms. Scryfall publication, bounded reference reads and product links are implemented. Acquisition lots, account history, optional price adapters and cost correction remain planned.

## Ownership and source publication

The catalog worker imports public observations and validated printing mappings. Backend selects eligible references and owns account valuation, acquisition lots, assignment, daily history and corrections. Ingestion never mutates private holdings. Optional sources remain operator-configured; absence leaves unknown values. Account calculations use the shared authorized use-case interface.

Store observations independently of selected values, including successful null results and failed-refresh status. Atomically publish each validated source. A successful complete source view replaces missing/null products as well as amounts. Download/parse failure retains its prior valid publication. One optional source failure blocks neither other sources nor daily account capture. Retain source time precision and calendar; import time is not sale time. Unchanged reimports do not reset age. Reject source instants over five minutes in the future.

Persist the chosen source, measure, date, currency, finish match and marked language fallback. The product owner defines the complete selection order and eligible series; adapters validate actual payload currency, dimensions and IDs. Keep current observations for unused catalog printings without indefinite daily retention. Preserve observations needed by held quantities, committed costs or protected captures. Removed holdings retain saved personal history. Stop additional daily retention once no active requirement needs that printing.

## Stable acquisition portions

Logical acquisition lots survive deletion of current inventory entries. Each positive quantity delta creates an unknown-cost lot. Reductions retire oldest lots first, removing the oldest held interval within a partially retired lot. Stable quantity intervals identify portions rather than physical copies. Partial cost assignments reserve disjoint held unknown intervals. Saved historical evidence references those same intervals, so later assignment establishes costs for exactly the portions present on each saved day.

Activate existing demo quantities additively as unknown opening lots. Preserve holdings and create no pre-activation history. Add, Scan, import and ordinary reduction use the shared Inventory transaction/lock contract. Cost assignment never increases owned quantity or treats Inventory group membership as a portion allocation.

## Exact allocation and revisions

Cost assignment has a stable request ID and validates currently held unknown portions. Persist frozen reference observations and compressed equal-unit-cent-cost runs over selected intervals. The product allocation is half equal per copy and half reference-weighted, with whole-batch equal allocation if any reference is missing or the reference sum is zero.

Use exact rational or scaled-integer arithmetic. Floor per-copy entitlements, then distribute remaining cents by largest fractional remainder. Break ties by stable printing/finish/condition/lot/offset order. Preserve the exact batch total and the cost of later partial reductions. Store known free independently of unknown. The selected zero assumption belongs only to estimated difference calculations.

Corrections allow amount, descriptive acquisition date and reason changes with an expected batch revision and replay-safe request. Keep original membership, allocation method and reference weights. Amount changes reallocate all original portions, including retired portions. Date metadata neither backdates ownership nor reorders FIFO. Membership/method changes are deferred. Preserve traceable prior revisions.

Preview/commit revalidate selected quantities. Commit a valid preview's displayed frozen references; concurrent daily price refresh does not replace them silently. Reject quantity/revision conflicts instead of assigning overlapping portions or publishing a different displayed allocation.

## Daily capture and atomic restatement

An independent backend job runner uses the existing Node runtime and backend code. A PostgreSQL lease elects one capture per calendar/day/account, independently of provider downloads and web requests. Capture uses a consistent committed database snapshot. Record held lot intervals, reference observations, cost evidence, actual capture time, cutoff and calendar version.

The product calendar defaults to Europe/Berlin. Use a configurable five-minute scheduling tolerance around day close. An uncaptured day beyond tolerance remains a gap. Restart can finish already captured evidence, but cannot reconstruct an uncaptured historical day from current holdings. Empty tracked holdings are known zero. Calendar changes affect future captures and preserve existing labels. Verify midnight, daylight saving and concurrent-runner behavior against the real database.

Assignment and correction restate affected cost/difference statistics through indexed set-based interval intersections in the same cost transaction under the Inventory lock. Preserve historical quantities, market observations, gaps and prior statistic revisions. The acknowledgement and all affected statistics become visible atomically. Benchmark long histories. If atomic restatement becomes too costly, revise the accepted design before introducing partly published asynchronous statistics.

## Acceptance evidence

Verify exact total preservation, equal/weighted fallback, known free versus unknown, FIFO partial reductions, disjoint portion assignments, request replay and stale previews. Corrections must cover retired portions and historical intersections without changing quantities, prices or missing days. Capture evidence covers duplicate runners, restart, outages, pruning, midnight and daylight saving. Source priority/null/failure/age/finish/language cases use actual imported fixtures and optional configurations. Substitute data does not establish a real provider integration. Keep evidence with the relevant implementation slice and refresh it after affected changes.

## Implemented Scryfall references

Migration 0015 adds independent immutable price publications, projected printing facts, nullable exact observations and active/previous pointers. Worker publishes the baseline Catalog/Price pair atomically under the existing publisher lock. Currentness checks require both extraction and mapping versions. Source descriptor time and payload digest identify the imported input; import time never resets freshness. Failed attempts retain the active publication and store safe health separately after rollback. A successful complete null/missing view replaces the older same-source amount.

Backend Valuation evaluates bounded requests in one repeatable-read transaction with one clock. It returns exact decimal EUR strings, source/measure/time, publication/observation identities, Fresh/Stale, requested and matched finishes/printings and marked English provenance. References expire after seven days. Zero is known; missing market amount is Unknown. Ordinary nonnegative decimal inputs are limited to 128 characters and 18 fractional digits before Decimal/BigInt work. Invalid source amounts abort publication; invalid stored amounts produce an operational read failure, including expired references. Exact bigint arithmetic multiplies before half-up two-decimal display rounding. No condition discount or currency conversion is applied.

English mapping v1 requires valid matching Oracle/edition IDs, set code, exact collector number, supported layout, explicit variation false, matching top artwork or ordered multi-face artwork, frame/border/treatment/promo facts and explicit equal unordered frame-effects/promo-types arrays. Missing/null evidence never defaults to equality. Exactly one English identity/finish candidate is required even if its amount is null. Supported layouts are normal, transform, modal_dfc, split, adventure and flip; reversible/unsupported layouts decline fallback. Exact finishes come from the source array; an explicit empty array is valid unsupported availability, while malformed finish values fail publication. An explicit Foil member permits the typed `eur_foil` field even when Etched also appears. Etched-only printings remain unsupported, and the price API accepts no Etched request. Extractor v3 records this interpretation and decimal bounds without changing printing identity.

Current/previous public price views have no cascading Catalog dependency. Backend's internal frozen-reference evidence includes the exact reference, publication descriptor, raw selected amount and requested/matched identity facts. Later protected preview/history consumers must copy this trusted evidence before public pruning. Ingestion never inspects private holdings. The actual protected persistence mechanism remains later work.

[Contracts](../../contracts/src/valuation.ts), [backend Valuation](../../backend/src/valuation/read.ts) and [Worker extraction](../../worker/src/worker/prices.py) own concrete shapes and rules. [HTTP ownership](./mobile-and-scan.md#reference-price-http-contract) owns routes, limits and errors; [deployment](../operations/deployment.md#catalog-migration-and-recovery) owns paired recovery.
