# Frontend

- Status: Canonical
- Last Reviewed: 2026-10-03
- Source of Truth: code and upstream runtime documentation
- Update Triggers: routes, authentication, search, deck builder, component choices, runtime support and compatibility
- Related Docs: [System overview](./system-overview.md), [Auth](./auth.md), [Routes](../product/routing-and-games.md), [Search API](../integrations/meilisearch/search-api.md), [UI libraries](../reference/ui-libraries.md)

The SvelteKit application renders pages on the server and owns the application API. Svelte components and Tailwind styles implement the interface; Bits UI supplies accessible interactive components. The [UI library assessment](../reference/ui-libraries.md) records the selection.

[Routing and games](../product/routing-and-games.md) owns the route list and legacy redirects. [The product specification](../product/specification.md) owns workflow behavior and acceptance criteria.

Server loads and actions use the same Postgres repositories as `/api/mobile/v1/mtg/...`. Repositories scope mutations and reads to the authenticated account. The API keeps its existing MTG path segment for compatibility.

Authenticated browser sessions receive a search-only MeiliSearch key. Browser search queries the catalog directly; import resolution and API search run on the server. See [search behavior](../integrations/meilisearch/search-api.md).

[Mobile and scan](./mobile-and-scan.md) owns manifest capabilities, API validation, uploads, and recognition boundaries.

## Runtime compatibility

The application targets Node 24 LTS and pnpm 12, with exact versions in `frontend/.node-version` and `frontend/package.json`. On 2026-10-03, the [Node release schedule](https://github.com/nodejs/Release/blob/main/schedule.json) lists Node 24 as active LTS, supported through 2028-04-30. Node 26 is scheduled to enter LTS on 2026-10-28.

Svelte 5, SvelteKit 2, adapter-node 5, Tailwind 4, and TypeScript 6 remain the verified application stack. SvelteKit 3 and adapter-node 6 require the [upstream migration](https://github.com/sveltejs/kit/blob/main/documentation/docs/60-appendix/35-migrating-to-sveltekit-3.md); TypeScript 7 remains deferred because reviewed [svelte-check compatibility](https://registry.npmjs.org/svelte-check) covers TypeScript 5 and 6. Deferring these major upgrades is a compatibility decision, not a claim that SvelteKit 2 has an upstream LTS guarantee.

`frontend/pnpm-workspace.yaml` records dependency overrides. SvelteKit 2 still requests an older `cookie` release, so the override retains the security fix. Drizzle's legacy loader also needs a patched esbuild dependency. Release-age exceptions name only the exact new releases reviewed during the update. Frozen installs keep these decisions reproducible.

The application serves its machine-readable API contract at `/openapi.json`. It describes local authentication and MTG API operations, including typed requests, responses, and cookie or bearer authentication. The route implementation remains the source of truth for error conditions and transaction behavior.
