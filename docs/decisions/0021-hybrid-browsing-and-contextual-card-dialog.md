# ADR-0021: Hybrid browsing and contextual Card dialog

- Status: Accepted
- Date: 2026-10-07
- Last Reviewed: 2026-10-07
- Owners: Kyle
- Source of Truth: Kyle's confirmed pagination, native-scroll and card-action requirements
- Update Triggers: browsing modes, URL/history behavior, viewport ownership, Card dialog responsibilities, API limit compatibility, scale and rendered acceptance
- Related Docs: [Design direction](../product/ui-design-direction.md#selected-hybrid-browsing-and-card-dialog), [Frontend contract](../architecture/frontend.md#selected-hybrid-browsing-contract), [Application contract](../architecture/application-contract.md), [Catalog](../architecture/catalog.md), [ADR-0014](./0014-public-landing-and-private-workspace.md), [ADR-0017](./0017-revisioned-inventory-windows-and-mutation-receipts.md), [Decisions](./README.md)

## Context

Current Inventory and Search use bounded virtual windows with 50-entry pages, request maxima of 100 and custom scroll viewports. Card inspection is shared internally but Search opens it inline, and Inventory also edits quantity in table rows. Kyle confirmed a replacement interaction on 2026-10-07. Earlier implementation acceptance does not cover this replacement.

## Decision

Select 100/200/500/Lazy for both workspaces, default 200, URL-addressed pagination and continuous Lazy loading. Select one native browser page scrollbar outside modals, with bounded internal Lazy rendering. Active modals retain installed Bits standard body locking and focus trapping, with one native overflow viewport for long content. SearchOverlay retains its modal/background history and uses that viewport; full Search uses the window. No nested Inspector-column, results or list scrollers are added. Select one context-aware Card dialog for Details, Inventory Edit and Add another printing. Inventory table quantity becomes read-only. Browsing Add to deck is Primary, Add to Inventory Secondary and visually smaller with touch access; Scan review's Accept to Inventory remains Primary. Deck quantity editing remains unchanged.

The product owner defines interactions; Frontend defines module interfaces, request ownership and acceptance. Select a backward-compatible Inventory/Catalog search limit expansion to 500 while preserving legacy omitted-limit defaults. This is planned work, requiring real integration and scale checks. No new printing endpoint, mutation command, dependency or framework is selected.

## Partial supersession

This decision supersedes ADR-0014 only for Search browser loading/navigation, its scroll/inspection presentation and the affected request maximum. Public landing, private dashboard, authentication destination and bounded catalog-generation ownership remain unchanged.

It supersedes ADR-0017 only for Inventory browser paging/mode, viewport, table quantity actions and the affected read maximum. Complete server filtering/counts, ICU ordering, account revisions, parent locking, authorized location reads, original mutation receipts and independent text revisions remain unchanged. Historical implementation evidence remains valid for its recorded revision.

## Consequences and gates

The selected requirements are not implemented at this revision. The [Frontend resource contract](../architecture/frontend.md#selected-hybrid-browsing-contract) settles hard request, context, resident-record, page, render and snapshot bounds, serialized cache-byte targets and local performance objectives. Byte targets preserve valid active pages and do not impose new HTTP or domain limits. Coherent source/interface and implementation-plan review makes window slices Ready; real PostgreSQL, HTTP and rendered evidence remain delivery acceptance gates. Independent API and Shell interfaces are reviewed separately and their work can proceed. Standard modal scroll ownership is settled routine engineering interpretation. All product choices are confirmed; no additional owner permission is required. Source inspection does not finalize unavailable library APIs.

Verify the deliberate limit expansion through actual PostgreSQL and built HTTP, then native/enhanced browser flows at 1k/10k/50k Inventory entries and the full Catalog. Record measured request/cache/DOM bounds, query latency and payloads, plus navigation, focus, draft and failure recovery. Product selection, design review, implementation, owner acceptance and deployment remain separate evidence.
