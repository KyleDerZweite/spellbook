# Selected UI components

- Status: Canonical
- Last Reviewed: 2026-10-04
- Source of Truth: accepted product decision, current application, upstream documentation
- Update Triggers: component adoption, generated source ownership, Svelte or Tailwind compatibility, interaction requirements
- Related Docs: [Reference](./README.md), [Bits UI](./bits-ui.md), [Frontend](../architecture/frontend.md), [Design direction](../product/ui-design-direction.md), [Product specification](../product/specification.md)

Spellbook uses shadcn-svelte source components with Bits UI, Svelte, and Tailwind. The first adopted component is the shared [Button](../../frontend/src/lib/components/ui/button/Button.svelte), adapted from the upstream implementation with its [MIT notice](../../frontend/src/lib/components/ui/button/LICENSE). Navigation account actions use it. Existing dialogs, menus, and selects continue to use Bits UI directly. The [design direction](../product/ui-design-direction.md) owns layout and branding. Further UI adoption is deferred with issue #168; the current component set remains in place.

shadcn-svelte supplies editable component source and Tailwind styling. The local Button uses existing CSS variants and Svelte class arrays; it adds no CLI or class-composition dependency. Bits UI supplies the keyboard, focus, and ARIA behavior for complex controls. Spellbook owns copied source, local changes, upstream fix adoption, and composed workflow behavior. Keep native controls for simple forms where they meet the requirement.

Add only components needed by implemented workflows. Inspect their dependencies, retain license notices, and map styles to Spellbook's shared tokens. Review generated changes before using an initializer; do not overwrite application styles or introduce a second theme system to obtain one control. The CLI version does not version or update copied components.

Use SvelteKit 3's `#lib` package mapping with explicit `.ts` and `.svelte` extensions. Check TypeScript 7 resolution and share the semantic tokens in `app.css`. The [Kit installation guide](https://github.com/huntabyte/shadcn-svelte/blob/main/docs/content/installation/sveltekit.md), [Tailwind 4 migration guide](https://github.com/huntabyte/shadcn-svelte/blob/main/docs/content/migration/tailwind-v4.md), and [package-import fixture](https://github.com/huntabyte/shadcn-svelte/tree/main/packages/cli/test/fixtures/config-pkg-imports) provide integration references. Read the [local Bits UI index](./bits-ui.md) before changing its controls.

Future component changes must satisfy the [interface acceptance criteria](../product/specification.md#interface-acceptance) and follow the [verification workflow](../operations/github-automation.md#browser-verification-and-evidence).
