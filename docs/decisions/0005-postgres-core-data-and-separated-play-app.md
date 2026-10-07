# ADR-0005: Postgres Core Data And Separated Play App

- Status: Accepted
- Date: 2026-04-25
- Last Reviewed: 2026-10-07
- Source of Truth: recorded decision
- Update Triggers: application module ownership, decision applicability, supersession, related document changes
- Owners: project
- Related Docs: [System Overview](../architecture/system-overview.md), [Postgres](../architecture/postgres.md), [Product specification](../product/specification.md), [Deployment](../operations/deployment.md)

## Context

Spellbook is in development and has no important production data to preserve. The base app product focus is card search, inventory, scan, and deck management. Full tabletop or Arena-style play would require a different state model, session lifecycle, and game-specific rules engine than the current inventory and deck workflows.

Keeping realtime game-session infrastructure in the base app creates product and operational coupling before play is a committed feature.

## Decision

Spellbook base app uses Postgres for durable user data.

SpacetimeDB is removed from the base app. User profiles, inventory, decks, scan sessions, scan artifacts, scan review items, and idempotency records live in Postgres and are accessed through authorized framework-free backend modules. SvelteKit adapts the shared contracts and transport; the [application contract](../architecture/application-contract.md) owns this current boundary.

Play is removed from the Spellbook base app scope. A future play experience must be a separate application or module. That application may use Spellbook as the source for catalog and deck data and may choose its own realtime/game-session infrastructure independently.

## Consequences

- The base deployment is simpler and uses a conventional durable database.
- The base app has no implicit realtime gameplay commitment.
- User-owned data access is centralized in SvelteKit server code.
- Collaborative deck editing is deferred and can be solved later on Postgres or separate realtime infrastructure.
- No existing user data migration is required because the project is still in development.

## Follow-Up

- Keep active product docs free of base-app play routes or play implementation commitments.
- If a play app is created, define its API contract against Spellbook catalog and deck data in a new ADR.
- Revisit collaboration separately when it becomes a committed product feature.

## References

- [Postgres Architecture](../architecture/postgres.md)
- [Product specification](../product/specification.md)
- [Deployment](../operations/deployment.md)
