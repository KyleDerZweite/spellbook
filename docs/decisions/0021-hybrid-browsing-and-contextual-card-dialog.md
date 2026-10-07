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

Replacement window slices remain Not Ready until finite resource facts and their coherent contracts are reviewed. Independent API and Shell interfaces are reviewed separately and their work can proceed. The selected requirements are not implemented at this revision. Root has settled standard modal scroll ownership as routine engineering interpretation. Finite payload/render/cache/snapshot budgets and declared performance targets remain engineering work before window implementation review. Independent API and Shell work can proceed; actual rendered geometry checks remain acceptance evidence. All product choices are confirmed; these engineering checks require no additional owner permission. Source inspection does not finalize unavailable library APIs.

Verify the deliberate limit expansion through actual PostgreSQL and built HTTP, then native/enhanced browser flows at 1k/10k/50k Inventory entries and the full Catalog. Record measured request/cache/DOM bounds, query latency and payloads, plus navigation, focus, draft and failure recovery. Product selection, design review, implementation, owner acceptance and deployment remain separate evidence.
