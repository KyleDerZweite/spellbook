# Frontend

- Status: Canonical
- Last Reviewed: 2026-10-03
- Source of Truth: code
- Update Triggers: routes, authentication, search, deck builder, component choices
- Related Docs: [System overview](./system-overview.md), [Auth](./auth.md), [Routes](../product/routing-and-games.md), [Search API](../integrations/meilisearch/search-api.md), [UI libraries](../reference/ui-libraries.md)

The SvelteKit application renders pages on the server and owns the application API. Svelte components and Tailwind styles implement the interface; Bits UI supplies accessible interactive components. The [UI library assessment](../reference/ui-libraries.md) records the selection.

[Routing and games](../product/routing-and-games.md) owns the route list and legacy redirects. [The product specification](../product/specification.md) owns workflow behavior and acceptance criteria.

Server loads and actions use the same Postgres repositories as `/api/mobile/v1/mtg/...`. Repositories scope mutations and reads to the authenticated account. The API keeps its existing MTG path segment for compatibility.

Authenticated browser sessions receive a search-only MeiliSearch key. Browser search queries the catalog directly; import resolution and API search run on the server. See [search behavior](../integrations/meilisearch/search-api.md).

The web manifest provides install metadata and shortcuts. The installed app uses the same web routes and cookie session. The `/scan` workspace uploads and reviews images through the same authenticated API used by external scanners. A service worker, offline operation, and direct browser camera capture remain planned.

The deck builder combines catalog search, printing selection, editable deck entries, and inventory availability. Its behavior and limits belong in the product specification rather than a second feature list here.

## Runtime compatibility

The application targets Node 24 LTS and pnpm 12, with exact versions in `frontend/.node-version` and `frontend/package.json`. Svelte 5, SvelteKit 2, adapter-node 5, Tailwind 4, and TypeScript 6 remain the compatible application stack. Kit 3 and TypeScript 7 require a separate migration and checker compatibility work.

`frontend/pnpm-workspace.yaml` records dependency overrides. SvelteKit 2 still requests an older `cookie` release, so the override retains the security fix. Drizzle's legacy loader also needs a patched esbuild dependency. Release-age exceptions name only the exact new releases reviewed during the update. Frozen installs keep these decisions reproducible.

The application serves its machine-readable API contract at `/openapi.json`. It describes local authentication and MTG API operations, including typed requests, responses, and cookie or bearer authentication. The route implementation remains the source of truth for error conditions and transaction behavior.
