# ADR-0024: Independent web, API and Android applications

- Status: Accepted
- Date: 2026-10-19
- Last Reviewed: 2026-10-19
- Source of Truth: maintainer-selected implementation direction
- Update Triggers: runtime ownership, Android stack, HTTP compatibility, deployment topology
- Related Docs: [Implementation contract](../architecture/independent-applications.md), [System overview](../architecture/system-overview.md), [ADR-0015](./0015-shared-backend-use-cases-and-client-contracts.md), [ADR-0023](./0023-local-recognition-in-scanner-clients.md)

The shared SvelteKit deployment already separates backend use cases from web presentation, but it cannot independently start the API or deliver the accepted native mobile experience. The maintainer selected independent applications in one monorepo and accepted Kotlin/Compose for Android.

Retain the existing workspace owners and add `android/`. Extract a framework-independent Node HTTP host around the current backend. Web rendering and forms call that host through HTTP. Android uses the same authenticated API and owns its native layout and navigation. PostgreSQL, transaction ownership, mutation receipts, credential authority and worker publication remain unchanged.

This advances ADR-0015 from package separation to separate runtimes. It selects Kotlin/Compose for the Android client left open by ADR-0023. Existing PWA delivery remains compatibility behavior. Neither a backend language rewrite nor hardware protocols are selected. The [implementation contract](../architecture/independent-applications.md) owns interfaces, scope and acceptance evidence. Acceptance of this decision does not imply implementation or deployed verification.
