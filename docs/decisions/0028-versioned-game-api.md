# ADR-0028: Versioned API with game-specific modules

- Status: Accepted; legacy alias requirements superseded by [ADR-0029](./0029-remove-replaced-interfaces.md)
- Implementation: Canonical routes, OpenAPI, MTG modules and clients implemented in unmerged PR 276; removal of legacy aliases follows ADR-0029
- Date: 2026-10-24
- Last Reviewed: 2026-10-25
- Owners: Kyle
- Source of Truth: Kyle's selected API direction on 2026-10-24
- Update Triggers: native FastAPI HTTP contract and pre-release receipt scope, ADR-0029 removal policy, API namespaces, game-specific module ownership and client migration
- Related Docs: [Independent applications](../architecture/independent-applications.md), [Migration contract](../architecture/python-backend-migration.md), [Routes](../product/routing-and-games.md), [ADR-0027](./0027-python-functional-migration-acceptance.md)

Keep one Python API and shared authentication, account identity, database and HTTP infrastructure.
Give game-specific operations canonical `/api/v1/{game}/...` routes and explicit game modules.
MTG search, filters, card identities, Deck rules and imports remain MTG-owned; no universal card/filter framework or additional supported game is introduced.

Shared Auth and account routes use `/api/v1/auth/...` and `/api/v1/account/...`.
MTG Catalog uses `/api/v1/mtg/catalog/...`; Dashboard uses `/api/v1/mtg/dashboard`.
Existing private MTG resources use `/api/v1/mtg/...` without the client-specific `mobile` segment.
The nine existing browser mutation commands use `/api/v1/mtg/commands`; raw-form adapters use `/api/v1/web/...`.
Web and Android use these canonical routes.

[ADR-0029](./0029-remove-replaced-interfaces.md) supersedes the original requirements for direct-dispatch legacy aliases, a frozen route inventory and an old-path transfer map.
The original decision remains in Git history.
Current implementation and acceptance follow the canonical-only contract in [independent applications](../architecture/independent-applications.md#selected-versioned-game-api).
QR cookies, stream handling, Origin rules and cache policy retain their behavior on current paths.

The original 2026-10-24 choice retained payload and stored-data compatibility while changing route and module ownership.
On 2026-10-25, Kyle superseded that compatibility promise with the pre-release policy in [ADR-0029](./0029-remove-replaced-interfaces.md).
The selected native FastAPI contract now owns current HTTP behavior through [independent applications](../architecture/independent-applications.md#selected-versioned-game-api).
Current-version receipt replay, account isolation and separate production authority remain required.
The existing account Profile payload still includes MTG presentation and metrics; its game dependency remains explicit rather than implying general support for other games.
Shared business abstractions should follow demonstrated reuse when another TCG is implemented.

Canonical route factories dispatch directly to application handlers without path translation.
Canonical Catalog reads remain public.
Shared Profile preferences retain an explicit dependency on the MTG card/metric helper without changing their response body.
This source implementation establishes neither current-head real-database/client acceptance nor production deployment.
