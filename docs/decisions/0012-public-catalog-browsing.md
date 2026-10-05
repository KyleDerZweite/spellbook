# ADR-0012: Public catalog browsing

- Status: Accepted
- Date: 2026-10-05
- Last Reviewed: 2026-10-05
- Source of Truth: user requirement and implemented routes
- Update Triggers: catalog access policy, public API contracts, account mutation boundaries
- Related Docs: [Catalog](../architecture/catalog.md), [Authentication](../architecture/auth.md), [Routes](../product/routing-and-games.md), [ADR-0010](./0010-postgres-catalog.md)

Visitors can search cards and inspect printings without creating an account. Catalog metadata is shared reference data; private inventory and deck changes still require an authenticated account.

Public browser endpoints under `/api/catalog/` reuse the catalog request handlers and validation used by the versioned integration API. The existing integration routes retain their authentication contract. Publication, ranking, pagination, and ownership checks are unchanged. This replaces the browser authentication requirement described in ADR-0010 without changing its storage decision.

The browser shows a sign-in action when a visitor wants to add a card to inventory, preserving a search for that card as the return destination. Search responses do not contain account ownership data. Public browsing does not add support for games beyond MTG.
