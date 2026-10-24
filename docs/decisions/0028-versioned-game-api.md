# ADR-0028: Versioned API with game-specific modules

- Status: Accepted
- Implementation: Selected for PR 276; implementation pending
- Date: 2026-10-24
- Last Reviewed: 2026-10-24
- Owners: Kyle
- Source of Truth: Kyle's selected API direction on 2026-10-24
- Update Triggers: API namespaces, compatibility aliases, game-specific module ownership and client migration
- Related Docs: [Independent applications](../architecture/independent-applications.md), [Migration contract](../architecture/python-backend-migration.md), [Routes](../product/routing-and-games.md), [ADR-0027](./0027-python-functional-migration-acceptance.md)

Keep one Python API and shared authentication, account identity, database and HTTP infrastructure.
Give game-specific operations canonical `/api/v1/{game}/...` routes and explicit game modules.
MTG search, filters, card identities, Deck rules and imports remain MTG-owned; no universal card/filter framework or additional supported game is introduced.

Shared Auth and account routes use `/api/v1/auth/...` and `/api/v1/account/...`.
MTG Catalog uses `/api/v1/mtg/catalog/...`; Dashboard uses `/api/v1/mtg/dashboard`.
Existing private MTG resources use `/api/v1/mtg/...` without the client-specific `mobile` segment.
The nine existing browser mutation commands use `/api/v1/mtg/commands`; raw-form adapters use `/api/v1/web/...`.
Web and Android use these canonical routes.

Preserve previous API paths as small direct-dispatch compatibility aliases with their original authorization, bodies, headers and errors.
In particular, public Catalog and authenticated legacy Catalog aliases retain their distinct access policies.
POST bodies are not redirected, and canonical QR cookies, stream handling, Origin rules and cache policy must work under the new paths.
OpenAPI describes the canonical API; the frozen compatibility inventory continues to describe the previous API.

This decision explicitly permits route and module changes in the otherwise compatible Python migration candidate.
Payloads, SQL history, stored data, original mutation receipts, browser page paths and production authority remain unchanged.
The existing account Profile payload still includes MTG presentation and metrics; its game dependency remains explicit rather than implying general support for other games.
Shared business abstractions should follow demonstrated reuse when another TCG is implemented.
