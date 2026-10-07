# ADR-0016: PostgreSQL saved-state invalidation

- Status: Accepted
- Date: 2026-10-06
- Last Reviewed: 2026-10-07
- Owners: Kyle
- Source of Truth: Kyle's Q56 acceptance and implemented SavedState transport/Profile consumer
- Update Triggers: saved-state transport, session expiry/revocation, replica recovery and stream evidence
- Related Docs: [Application contract](../architecture/application-contract.md#saved-state-synchronization), [Auth](../architecture/auth.md), [Realtime research](../integrations/realtime-backends.md), [ADR-0015](./0015-shared-backend-use-cases-and-client-contracts.md), [Decisions](./README.md)

## Context

Slice 8 implements the SavedState transport and Profile consumer. Inventory/Deck/Scan workspace consumers remain slice 9. Its [acceptance record](https://github.com/KyleDerZweite/spellbook/issues/181) includes real two-process HTTP/PostgreSQL and rendered Profile journeys. Deployed proxy verification remains separate.

Opened clients need prompt visibility of saved account changes while retaining unsaved drafts. PostgreSQL remains authoritative. A hosted sync service or database migration adds dependencies and account/auth integration work.

## Decision

Kyle accepted account-scoped SSE invalidation with PostgreSQL LISTEN/NOTIFY in Q56 on 2026-10-06. Commit triggers emit coarse account topics. Each process owns a dedicated listener and fans notifications to authenticated streams. Clients refetch bounded current reads on connect, invalidation, reconnect and resume. The stream validates session expiry and revocation, including revalidation after listener recovery. The application contract owns detailed ordering, cleanup and error semantics.

## Consequences

Existing PostgreSQL, pg and Node capabilities support a single deployment with multiple replicas and no sticky sessions. Notifications provide no durable replay; current-state refetch recovers missed signals. Session revalidation, heartbeats, bounded queues and proxy behavior need real two-process HTTP/browser evidence. The approximate two-second target applies to healthy connected clients. Offline writes and closed-app push remain outside this pass.
