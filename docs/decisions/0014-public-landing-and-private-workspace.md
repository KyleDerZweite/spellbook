# ADR-0014: Public landing and private workspace

- Status: Accepted
- Date: 2026-10-06
- Last Reviewed: 2026-10-06
- Source of Truth: accepted user requirements and implemented routes, shell and client search
- Update Triggers: home composition, dashboard ownership, default auth destination, shared layout, browser search boundaries
- Related Docs: [Specification](../product/specification.md#dashboard), [Routes](../product/routing-and-games.md), [Auth](../architecture/auth.md), [Frontend](../architecture/frontend.md), [Catalog](../architecture/catalog.md#browser-result-window), [Design direction](../product/ui-design-direction.md)

`/` shows the same public landing page for every session. The private dashboard lives at `/mtg/dashboard`. Sign-in and registration lead to Inventory unless a safe, explicit `returnTo` was supplied. Public presentation, inventory work and private summaries remain separate tasks. An explicit return to `/` or a deck is preserved. A development override for the landing page is unnecessary.

All workspaces use the same outer layout and header. Inventory remains in the middle of the navigation. The dashboard calculates current owned quantities and existing deck availability independently for each deck. These summaries do not establish reservations across decks, price history or growth history.

Search starts without filters and represents the full result count in a virtual grid. The client retains only bounded, addressable pages and discards mixed catalog generations. CatalogWindow owns requests, caching and generation consistency. VirtualCardGrid owns geometry and visible indices. The existing API contract is preserved. The catalog document owns the concrete limits; implementation alone does not demonstrate full-catalog performance.
