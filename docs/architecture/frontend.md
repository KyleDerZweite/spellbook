# Frontend

- Status: Canonical
- Last Reviewed: 2026-10-04
- Source of Truth: code and upstream runtime documentation
- Update Triggers: routes, authentication, search, deck builder, component choices, runtime support and compatibility
- Related Docs: [System overview](./system-overview.md), [Auth](./auth.md), [Routes](../product/routing-and-games.md), [Catalog](./catalog.md), [Selected UI components](../reference/ui-libraries.md)

The SvelteKit application renders pages on the server and owns the application API. Svelte components and Tailwind styles implement the interface; Bits UI supplies accessible interactive components. The [selected component guidance](../reference/ui-libraries.md) owns shadcn-svelte source adoption and its boundary with existing Bits UI controls. The shared stylesheet defines the graphite, white, teal, blue, and restrained violet base design described in [design direction](../product/ui-design-direction.md).

[Routing and games](../product/routing-and-games.md) owns the route list and legacy redirects. [The product specification](../product/specification.md) owns workflow behavior and acceptance criteria.

Server loads and actions use the same Postgres repositories as `/api/mobile/v1/mtg/...`. Repositories scope mutations and reads to the authenticated account. The API keeps its existing MTG path segment for compatibility.

Authenticated browser search, import resolution, and external API search use the same PostgreSQL [catalog](./catalog.md) through SvelteKit. Browser requests carry the local session cookie; no catalog key or separate search origin is required.

[Mobile and scan](./mobile-and-scan.md) owns manifest capabilities, API validation, uploads, and recognition boundaries.

## Runtime compatibility

The application targets Node 26 and pnpm 12, with exact versions in `frontend/.node-version` and `frontend/package.json`. Node 26 is a stable Current release on 2026-10-03, not yet LTS. The [Node schedule](https://github.com/nodejs/Release/blob/main/schedule.json) starts its LTS phase on 2026-10-28 and supports the release through 2029-04-30.

The implemented stack uses Svelte 5, SvelteKit 3, adapter-node 6, and Tailwind 4. The [Kit 3 migration](https://github.com/sveltejs/kit/blob/main/documentation/docs/60-appendix/35-migrating-to-sveltekit-3.md) moves configuration into the SvelteKit Vite plugin. Application imports use the `#lib/*` package mapping, and [`src/env.ts`](../../frontend/src/env.ts) declares environment variables exposed through the framework's environment modules.

Application type checking uses TypeScript 7 through the `typescript-native` alias. Kit 3 and svelte-check still require TypeScript 6's compiler API. Installing TypeScript 7 as that API dependency fails because it does not provide the expected `ts.sys.readFile` interface. The compatibility dependency supports those tools; it does not replace the project's TypeScript 7 check. The [verification workflow](../operations/github-automation.md#local-checks) owns the commands.

[`pnpm-workspace.yaml`](../../frontend/pnpm-workspace.yaml) retains the patched esbuild dependency for Drizzle's legacy loader. Its scoped `runed` peer rule accepts Kit 3 because Bits UI uses the framework-independent entry point, not `runed/kit`. Frozen installs preserve these choices.

`APP_ORIGIN` configures `paths.origin` at build time in [`vite.config.ts`](../../frontend/vite.config.ts). Compose passes it to both frontend and migration builds. Adapter-node 6 no longer reads runtime `ORIGIN`; changing the public origin requires rebuilding the frontend. [Deployment](../operations/deployment.md) owns the operator procedure.

The application serves its machine-readable API contract at `/openapi.json`. It describes local authentication and MTG API operations, including typed requests, responses, and cookie or bearer authentication. The route implementation remains the source of truth for error conditions and transaction behavior.
