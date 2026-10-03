# UI library evaluation

- Status: Canonical research reference
- Last Reviewed: 2026-10-03
- Source of Truth: repository code, upstream documentation, npm metadata, upstream releases
- Update Triggers: UI library replacement, major Svelte or Tailwind upgrades, unresolved component defects, a new workflow requiring unsupported controls
- Related Docs: [Reference index](./README.md), [Bits UI documentation](./bits-ui.md), [Frontend architecture](../architecture/frontend.md), [UI design direction](../product/ui-design-direction.md)

Retain Bits UI and Spellbook's custom Tailwind styling. Prefer native HTML controls for simple forms. Consider individual shadcn-svelte components when a concrete workflow needs a component that the existing code does not provide. The reviewed alternatives do not justify replacing the current UI library.

This recommendation evaluates compatibility and maintenance evidence. It does not claim that the application has passed an accessibility audit or that alternative libraries have been installed and tested in Spellbook.

## Current fit

Spellbook already uses Svelte 5 and Tailwind 4. The [frontend manifest](../../frontend/package.json) and [lockfile](../../frontend/pnpm-lock.yaml) own the installed versions. The [application stylesheet](../../frontend/src/app.css) owns its color, typography, and shared component styles.

Existing Bits UI callers include the card detail dialog, quick-add selects, search filter sections, and navigation menus. See [card components](../../frontend/src/lib/components/cards/), [search components](../../frontend/src/lib/components/search/), and [layout components](../../frontend/src/lib/components/layout/). These controls need keyboard behavior and focus management while retaining MTG-specific content and styling.

The product direction favors dense inventory and deck workflows. A pre-styled dashboard library would still require custom card displays, printing selection, mana symbols, inventory mutations, and deck availability logic. It would also require replacing working component APIs and reconciling a second set of theme conventions.

## Compatibility and release evidence

The following stable npm releases and peer requirements were checked on 2026-10-03. Release dates are UTC. They describe upstream packages, not the versions installed in Spellbook. A recent release is maintenance evidence, not a guarantee of correctness or future support.

| Candidate                 | Stable release observed                      | Svelte 5 and Tailwind 4 evidence                                                                                                                               | Fit and migration cost                                                                                                                                          |
| ------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bits UI                   | `2.19.5`, 2026-10-03                         | Svelte peer `^5.33.0`. Headless components accept application CSS and impose no Tailwind peer dependency.                                                      | Best fit. Existing callers and theme remain usable. Upgrade and test the existing controls.                                                                     |
| shadcn-svelte             | CLI `1.7.0`, 2026-09-16                      | Svelte peer `^5.0.0`. The official migration guide explicitly supports Svelte 5, Tailwind 4, and CSS theme directives.                                         | Useful source for individual components. Wholesale adoption requires copied files, token mapping, and additional dependencies selected by each component.       |
| Melt UI, legacy package   | `@melt-ui/svelte` `0.86.6`, 2025-03-28       | The peer range includes `^5.0.0-next.118`. Headless builders have no Tailwind dependency. The documentation directs users to the separate runes-based version. | Poor replacement target. It adds a different builder API and an older release track without resolving a demonstrated gap.                                       |
| Melt UI, Svelte 5 package | `melt` `0.44.0`, 2026-01-04                  | Svelte peer `^5.30.1`. The documentation identifies this as the Svelte 5 generation. Styling remains application-owned.                                        | Technically compatible. Replacing component composition with builders requires rewriting callers. Evaluate only for a specific missing capability.              |
| Skeleton                  | Core and Svelte packages `5.0.1`, 2026-08-19 | Core requires Tailwind `^4.0.0`; the Svelte package requires Svelte `^5.40.0`. Its installation guide supports SvelteKit 2.                                    | Better suited to adopting an opinionated design system. Migration requires theme integration, component replacement, and evaluation of its Zag.js dependencies. |
| Flowbite Svelte           | `1.33.1`, 2026-04-07                         | Svelte peer `^5.40.0` and Tailwind peer `^4.1.4`. Its setup adds the Flowbite plugin and package source scanning.                                              | Suitable for pre-styled general interfaces. Spellbook would need to reconcile its custom styles and replace component APIs.                                     |

The `shadcn-svelte` version is a CLI release. Copied component code has its own upstream history and does not update when the CLI version changes. Melt's two package names represent different APIs and must not be treated as interchangeable upgrade targets. Flowbite's observed `next` tag was `2.0.0-next.14`; this evaluation uses the stable release.

Bits UI `2.19.5` fixes select label persistence, fast touch dismissal, body style restoration, and focus handling inside shadow roots. The [release notes](https://github.com/huntabyte/bits-ui/releases/tag/bits-ui%402.19.5) provide concrete evidence that current interaction defects receive fixes. This makes updating and checking existing controls more useful than changing libraries solely for modernization.

## Ownership and accessibility

| Choice          | What the library provides                                             | What Spellbook still owns                                                                                    |
| --------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Bits UI         | Unstyled components with keyboard, focus, and ARIA behavior.          | Correct composition, labels, content, styling, and application workflow checks.                              |
| shadcn-svelte   | Component source that commonly composes Bits UI with Tailwind styles. | The copied code, upstream fix adoption, local customizations, and checks after changing markup or behavior.  |
| Melt UI         | Headless builders that supply attributes, events, and state.          | Element selection, builder wiring, markup, styles, and composed behavior.                                    |
| Skeleton        | Styled components, theme conventions, and Zag.js behavior.            | Theme contrast, labels, composition, and interaction with application forms and overlays.                    |
| Flowbite Svelte | Pre-styled Svelte components and configurable Tailwind styling.       | Component-specific behavior checks, accessible names, application state, and the effects of style overrides. |
| Native HTML     | Browser behavior for buttons, links, inputs, selects, and tables.     | Semantic structure, labels, validation feedback, styles, and any custom interaction.                         |

Bits UI's upstream [dialog browser tests](https://github.com/huntabyte/bits-ui/blob/main/tests/src/tests/dialog/dialog.browser.test.ts) cover focus trapping, restoration, nested dialogs, and ARIA relationships. Its [select browser tests](https://github.com/huntabyte/bits-ui/blob/main/tests/src/tests/select/select.browser.test.ts) cover keyboard navigation, selection, Escape, and form values. These tests are stronger evidence than an accessibility claim on a landing page. They do not prove that Spellbook's composed controls meet accessibility requirements.

For any changed interactive component, verify its accessible name, keyboard operation, visible focus, and disabled state. Dialogs must manage focus and return it to a useful control. Nested menus and selects must dismiss correctly on keyboard and touch. Check application colors, reduced-motion behavior, and screen-reader announcements in the actual workflow. Successful type checks alone cannot establish those properties.

## Adoption guidance

Use existing components before adding a dependency. Use native controls when their behavior meets the requirement. Keep Bits UI for interactions that need managed overlays, keyboard navigation, or focus containment. Keep product-specific rendering and shared style rules in the current component directories and stylesheet.

If a new workflow benefits from shadcn-svelte, inspect the specific component and its dependencies first. Copy only the required source, adapt it to existing tokens, and retain its license notices. Treat that code as maintained application code. Do not initialize a second theme system across the application solely to obtain one component.

Reconsider a full library migration when a required interaction cannot be supported reliably, maintenance stops addressing material defects, or an approved visual redesign adopts a different design system. Compare a working representative implementation before committing to that migration. Measure its dependency changes and test the affected flows; this research does not provide bundle-size or performance measurements.

## Primary sources

All sources below were accessed on 2026-10-03. npm package metadata supplies the stable version, publication timestamp, and peer requirements in the table. Upstream documentation supplies the API and styling model. GitHub release records provide an independent publication history.

- Bits UI: [npm metadata](https://registry.npmjs.org/bits-ui), [introduction source](https://github.com/huntabyte/bits-ui/blob/main/docs/content/introduction.md), [releases](https://github.com/huntabyte/bits-ui/releases), and the [local documentation index](./bits-ui.md).
- shadcn-svelte: [npm metadata](https://registry.npmjs.org/shadcn-svelte), [project README](https://github.com/huntabyte/shadcn-svelte/blob/main/README.md), [Svelte 5 and Tailwind 4 migration guide](https://github.com/huntabyte/shadcn-svelte/blob/main/docs/content/migration/tailwind-v4.md), and [releases](https://github.com/huntabyte/shadcn-svelte/releases).
- Melt UI: [legacy npm metadata](https://registry.npmjs.org/@melt-ui/svelte), [legacy introduction](https://www.melt-ui.com/docs/introduction), [Svelte 5 npm metadata](https://registry.npmjs.org/melt), [Svelte 5 documentation](https://next.melt-ui.com/), and [Svelte 5 releases](https://github.com/melt-ui/next-gen/releases).
- Skeleton: [core npm metadata](https://registry.npmjs.org/@skeletonlabs/skeleton), [Svelte npm metadata](https://registry.npmjs.org/@skeletonlabs/skeleton-svelte), [design-system introduction](https://github.com/skeletonlabs/skeleton/blob/main/sites/skeleton.dev/src/content/docs/get-started/introduction.mdx), [SvelteKit installation](https://github.com/skeletonlabs/skeleton/blob/main/sites/skeleton.dev/src/content/docs/get-started/installation/sveltekit.mdx), and [releases](https://github.com/skeletonlabs/skeleton/releases).
- Flowbite Svelte: [npm metadata](https://registry.npmjs.org/flowbite-svelte), [introduction source](https://github.com/themesberg/flowbite-svelte/blob/main/src/routes/docs/pages/introduction.md), [setup guide](https://github.com/themesberg/flowbite-svelte/blob/main/src/routes/docs/pages/quickstart.md), and [releases](https://github.com/themesberg/flowbite-svelte/releases).

Bits UI and shadcn-svelte documentation endpoints returned HTTP 403 during this review. Flowbite's documentation endpoint returned HTTP 429. Their upstream documentation source files were read instead. No recommendation depends on unverified access to those rendered pages.
