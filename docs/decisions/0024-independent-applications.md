# ADR-0024: Independent web, API and Android applications

- Status: Accepted
- Date: 2026-10-19
- Last Reviewed: 2026-10-19
- Source of Truth: maintainer-selected implementation direction
- Update Triggers: independent API/web ownership and relocated code references, runtime ownership, Android stack, HTTP compatibility, deployment topology
- Related Docs: [Implementation contract](../architecture/independent-applications.md), [System overview](../architecture/system-overview.md), [ADR-0015](./0015-shared-backend-use-cases-and-client-contracts.md), [ADR-0023](./0023-local-recognition-in-scanner-clients.md)

The shared SvelteKit deployment already separates backend use cases from web presentation, but it cannot independently start the API or deliver the accepted native mobile experience.
The maintainer selected independent applications in one monorepo and accepted Kotlin/Compose for Android.

Retain the existing workspace owners and add `android/`.
Extract a framework-independent Node HTTP host around the current backend.
Web rendering and forms call that host through HTTP.
Android uses the same authenticated API and owns its native layout and navigation.
PostgreSQL, transaction ownership, mutation receipts, credential authority and worker publication remain unchanged.

This advances ADR-0015 from package separation to separate runtimes.
It selects Kotlin/Compose for the Android client left open by ADR-0023.
Existing PWA delivery remains compatibility behavior.
Neither a backend language rewrite nor hardware protocols are selected.
The [implementation contract](../architecture/independent-applications.md) owns interfaces, scope and acceptance evidence.
Acceptance of this decision does not imply implementation or deployed verification.

## Implementation follow-up, 2026-10-19

[PR 243](https://github.com/KyleDerZweite/spellbook/pull/243) merged into [PR 231](https://github.com/KyleDerZweite/spellbook/pull/231), then main at `728703f391bc7d573819ce21ade621d97588b62b`.
[Issue 244](https://github.com/KyleDerZweite/spellbook/issues/244) tracks delivery from the reviewed `2d640d0` foundation.
Integrated `ff0b9a1` supplies separate Node API/web ownership and backend migrations/operators without changing SQL or publication history.
Raw-form/OpenAPI follow-up, Android integration and final acceptance remain in progress.
The selected Android toolchain pins SDK 37 and Kotlin/Compose in the [contract](../architecture/independent-applications.md#android-delivery).
Producer build/JVM/lint passed; the root emulator attempt exited 139 before boot.
Installation/native journeys were not run, and no workaround, hardware or production acceptance is claimed.
