# ADR-0021: Hybrid browsing and contextual Card dialog

- Status: Accepted
- Date: 2026-10-07
- Last Reviewed: 2026-10-07
- Owners: Kyle
- Source of Truth: Kyle's confirmed continuous Lazy, native-scroll and card-action requirements
- Update Triggers: continuous Lazy policy, legacy range normalization, URL/history behavior, viewport ownership, Card dialog responsibilities, API limit compatibility, scale and rendered acceptance
- Related Docs: [Design direction](../product/ui-design-direction.md#selected-hybrid-browsing-and-card-dialog), [Frontend contract](../architecture/frontend.md#selected-hybrid-browsing-contract), [Application contract](../architecture/application-contract.md), [Catalog](../architecture/catalog.md), [ADR-0014](./0014-public-landing-and-private-workspace.md), [ADR-0017](./0017-revisioned-inventory-windows-and-mutation-receipts.md), [Decisions](./README.md)

## Context

When this decision was selected, Inventory and Search used bounded virtual windows with 50-entry pages, request maxima of 100 and custom scroll viewports. Card inspection was shared internally but Search opened it inline, and Inventory also edited quantity in table rows. Kyle initially selected numeric/Lazy browsing on 2026-10-07, then withdrew numeric pagination and its selector before delivery. The final selection is uniform continuous Lazy loading with bounded DOM management. Earlier implementation acceptance does not cover this replacement.

## Decision

Select continuous Lazy loading throughout Search and Inventory, including the full Search route, Search overlay and Inventory Groups. Enhanced browsing exposes neither numeric pagination nor a page-size selector. Logical 200-entry range addresses support deep links, reload and Back/Forward without fetching earlier ranges. `pageSize=lazy` records this policy; legacy numeric addresses normalize to the containing 200-entry range. Native no-JavaScript use alone retains 200-entry Previous/Next fallback links. Select one native browser page scrollbar outside modals, with bounded internal Lazy rendering. Active modals retain installed Bits standard body locking and focus trapping, with one native overflow viewport for long content. SearchOverlay retains its modal/background history and uses that viewport; full Search uses the window. No nested Inspector-column, results or list scrollers are added. Select one context-aware Card dialog for Details, Inventory Edit and Add another printing. Inventory table quantity becomes read-only. Browsing Add to deck is Primary, Add to Inventory Secondary and visually smaller with touch access; Scan review's Accept to Inventory remains Primary. Deck quantity editing remains unchanged.

The product owner defines interactions; Frontend defines module interfaces, request ownership and acceptance. The backward-compatible Inventory/Catalog search limit expansion to 500 is implemented with legacy omitted-limit defaults preserved. Uniform Lazy adoption is the replacement delivery requirement. Representative composed scale checks remain a delivery gate. No new printing endpoint, mutation command, dependency or framework is selected.

## Partial supersession

This decision supersedes ADR-0014 only for Search browser loading/navigation, its scroll/inspection presentation and the affected request maximum. Public landing, private dashboard, authentication destination and bounded catalog-generation ownership remain unchanged.

It supersedes ADR-0017 only for Inventory browser range navigation, viewport, table quantity actions and the affected read maximum. Complete server filtering/counts, ICU ordering, account revisions, parent locking, authorized location reads, original mutation receipts and independent text revisions remain unchanged. Historical implementation evidence remains valid for its recorded revision.

## Consequences and gates

The API maximum of 500, native Shell window scrolling and bounded Deck-choice read are implemented. Native no-JavaScript fallback retains the shared Previous/Next control. Contextual Card actions and bounded result-window foundations are implemented. The reviewed uniform Lazy browser-policy and native/caller replacement is implemented; current-head composed verification remains pending. The [Frontend resource contract](../architecture/frontend.md#selected-hybrid-browsing-contract) settles hard request, context, resident-record, page, render and snapshot bounds, serialized cache-byte targets and local performance objectives. Byte targets preserve valid active pages and do not impose new HTTP or domain limits. Coherent source/interface and implementation-plan review makes window slices Ready; combined real PostgreSQL, HTTP, scale and rendered evidence remain delivery acceptance gates. Standard modal scroll ownership is settled routine engineering interpretation. All product choices are confirmed; no additional owner permission is required. Source inspection does not finalize unavailable library APIs.

Verify the deliberate limit expansion through actual PostgreSQL and built HTTP, then native/enhanced browser flows at 1k/10k/50k Inventory entries and the full Catalog. Record measured request/cache/DOM bounds, query latency and payloads, plus navigation, focus, draft and failure recovery. Product selection, design review, implementation, owner acceptance and deployment remain separate evidence.
