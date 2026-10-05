# Frontend

- Status: Canonical
- Last Reviewed: 2026-10-06
- Source of Truth: code and upstream runtime documentation
- Update Triggers: routes, authentication, public landing, responsive layout, typography, development review controls, search, deck builder, component choices, runtime support and compatibility
- Related Docs: [System overview](./system-overview.md), [Auth](./auth.md), [Routes](../product/routing-and-games.md), [Catalog](./catalog.md), [Selected UI components](../reference/ui-libraries.md), [Design direction](../product/ui-design-direction.md)

The SvelteKit application renders pages on the server and owns the application API. Svelte components and Tailwind styles implement the interface; Bits UI supplies accessible interactive components. The [selected component guidance](../reference/ui-libraries.md) owns shadcn-svelte source adoption and its boundary with existing Bits UI controls. The shared stylesheet defines the neutral light and dark, icon-accented card workspace design described in [design direction](../product/ui-design-direction.md).

The signed-out home renders the shared [PublicLanding](../../frontend/src/lib/components/showcase/PublicLanding.svelte). Its primary action links directly to `/mtg/search` without requiring authentication.

The signed-out root uses Background with a floating Commander deck card. Search remains public and the landing uses shared design tokens. The previous three-row ownership example, isolated card-and-pack strip, and visible oversized Spellbook headings are removed.

The numbered comparison routes, their matcher and the `/fonts` comparison page are removed. In development, `/?review=landing` renders the public landing for signed-in users too. It only overrides which home composition is shown. Ordinary signed-in home behavior remains unchanged.

[LandingBackdrop](../../frontend/src/lib/components/showcase/LandingBackdrop.svelte) owns Background. Its right-aligned diagonal field has six columns and six rows of decorative tiles mixing Magic, Pokémon, Yu-Gi-Oh! and Digimon. Its 36 tiles contain 27 cards and nine packs. All four games have pack artwork. Tile widths scale with the viewport. Partial cards remain visible at softly faded edges. Desktop actions are vertically centered on the left, and the deck card sits in the lower-right corner. Mobile places the right-aligned deck card after the actions in the normal page flow.

[LandingCommander](../../frontend/src/lib/components/showcase/LandingCommander.svelte) supplies the floating deck card inside Background. Its header uses the actual deck name beside blue and red color symbols. A card stack sits above the format, 100-card total, and creator attribution. It links to the full public list on Archidekt. Its data comes from a complete static snapshot; no account import, inventory comparison, or live synchronization occurs. Hover, focus, or tap selects one of eight actual deck cards directly. The selected card lifts and enlarges; preceding cards shift left. The Commander marker and format label reuse `--color-role-commander`, also used by Commander groups and entries in the deck editor. Arrow keys, Home and End move keyboard focus between cards. There is no automatic cycling. Reduced motion removes the brief transition while preserving selection. The [asset reference](../reference/website-icons.md#card-showcase-assets) owns snapshot provenance and refresh boundaries.

The landing wrapper and navigation share `--layout-wide-width`, defined as `clamp(100rem, 84vw, 150rem)`. Their bounded width grows on large screens, and Background matches the navigation's responsive horizontal padding. The public home and hero use column flex layouts to fill the space remaining after the header and actual footer content. The hero retains its responsive minimum height; short viewports scroll naturally instead of clipping content. Background tiles and the floating deck scale within separate bounds, while action text stays at its normal size. Search and editing workspaces keep their existing content-width rules.

A smaller Search cards action appears beside a disabled App coming soon control. The latter has no download destination or release-date promise.

Shared application tokens use the selected Marcellus display face with a serif fallback and IBM Plex Mono interface face with monospace fallbacks. Marcellus remains provisional, but only an explicit user instruction may change the selected heading font; agents must not replace it autonomously. Font selectors, optional comparison font loading and the `font` and `uiFont` query overrides are removed. [Design direction](../product/ui-design-direction.md) owns the accepted content and visual requirements.

The synchronous `static/theme.js` bootstrap owns theme preference, local storage, system appearance changes, and browser theme color. It runs before page content to avoid a mismatched initial palette. The shared `ThemeToggle` controls that bootstrap through browser events; account and workspace headers expose the same control. Storage failure leaves the control functional for the current page.

Shared CSS styles native scrollbars with the theme-specific `--color-scrollbar` token. Browsers without standard scrollbar-color support use the WebKit scrollbar fallback. The shell defines `--app-header-height` for desktop and mobile. `.app-main` owns scrolling; the initial header clearance belongs to `.app-content`, so sticky descendants apply the header offset only once. The deck summary and catalog use that shared value. Navigation underlines remain visible when labels collapse to icons.

[Routing and games](../product/routing-and-games.md) owns the route list and legacy redirects. [The product specification](../product/specification.md) owns workflow behavior and acceptance criteria.

Server loads and actions use the same Postgres repositories as `/api/mobile/v1/mtg/...`. Repositories scope mutations and reads to the authenticated account. The API keeps its existing MTG path segment for compatibility.

Public browser search, authenticated import resolution, and external API search use the same PostgreSQL [catalog](./catalog.md) through SvelteKit. Browser requests can carry the local session cookie, but public catalog reads do not require it. No catalog key or separate search origin is required.

[Mobile and scan](./mobile-and-scan.md) owns manifest capabilities, API validation, uploads, and recognition boundaries.

## Runtime compatibility

The application targets Node 26 and pnpm 12, with exact versions in `frontend/.node-version` and `frontend/package.json`. Node 26 is a stable Current release on 2026-10-03, not yet LTS. The [Node schedule](https://github.com/nodejs/Release/blob/main/schedule.json) starts its LTS phase on 2026-10-28 and supports the release through 2029-04-30.

The implemented stack uses Svelte 5, SvelteKit 3, adapter-node 6, and Tailwind 4. The [Kit 3 migration](https://github.com/sveltejs/kit/blob/main/documentation/docs/60-appendix/35-migrating-to-sveltekit-3.md) moves configuration into the SvelteKit Vite plugin. Application imports use the `#lib/*` package mapping, and [`src/env.ts`](../../frontend/src/env.ts) declares environment variables exposed through the framework's environment modules.

Application type checking uses TypeScript 7 through the `typescript-native` alias. Kit 3 and svelte-check still require TypeScript 6's compiler API. Installing TypeScript 7 as that API dependency fails because it does not provide the expected `ts.sys.readFile` interface. The compatibility dependency supports those tools; it does not replace the project's TypeScript 7 check. The [verification workflow](../operations/github-automation.md#local-checks) owns the commands.

[`pnpm-workspace.yaml`](../../frontend/pnpm-workspace.yaml) retains the patched esbuild dependency for Drizzle's legacy loader. Its scoped `runed` peer rule accepts Kit 3 because Bits UI uses the framework-independent entry point, not `runed/kit`. Frozen installs preserve these choices.

`APP_ORIGIN` configures `paths.origin` at build time in [`vite.config.ts`](../../frontend/vite.config.ts). Compose passes it to both frontend and migration builds. Adapter-node 6 no longer reads runtime `ORIGIN`; changing the public origin requires rebuilding the frontend. [Deployment](../operations/deployment.md) owns the operator procedure.

The application serves its machine-readable API contract at `/openapi.json`. It describes local authentication and MTG API operations, including typed requests, responses, and cookie or bearer authentication. The route implementation remains the source of truth for error conditions and transaction behavior.
