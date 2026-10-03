# Selected UI components

- Status: Canonical; shadcn-svelte adoption selected and implementation deferred
- Last Reviewed: 2026-10-03
- Source of Truth: accepted product decision, current application, upstream documentation
- Update Triggers: component adoption, generated source ownership, Svelte or Tailwind compatibility, interaction requirements
- Related Docs: [Reference](./README.md), [Bits UI](./bits-ui.md), [Frontend](../architecture/frontend.md), [Design direction](../product/ui-design-direction.md), [Product specification](../product/specification.md)

Use shadcn-svelte with Bits UI for the deferred frontend redesign in [issue #168](https://github.com/KyleDerZweite/spellbook/issues/168). This is the selected approach. The current application already uses Bits UI with custom Svelte and Tailwind components; shadcn-svelte components have not been adopted by this change. The [design direction](../product/ui-design-direction.md) owns layout and branding.

shadcn-svelte supplies editable component source and Tailwind styling. Bits UI supplies the keyboard, focus, and ARIA behavior for complex controls. Spellbook owns copied source, local changes, upstream fix adoption, and composed workflow behavior. Keep native controls for simple forms where they meet the requirement.

Add only components needed by implemented workflows. Inspect their dependencies, retain license notices, and map styles to Spellbook's shared tokens. Review generated changes before using an initializer; do not overwrite application styles or introduce a second theme system to obtain one control. The CLI version does not version or update copied components.

Map generated imports to SvelteKit 3's `#lib` package mapping with explicit `.ts` and `.svelte` extensions. Check TypeScript 7 resolution and map shadcn tokens to the existing semantic tokens in `app.css`. The [Kit installation guide](https://github.com/huntabyte/shadcn-svelte/blob/main/docs/content/installation/sveltekit.md), [Tailwind 4 migration guide](https://github.com/huntabyte/shadcn-svelte/blob/main/docs/content/migration/tailwind-v4.md), and [package-import fixture](https://github.com/huntabyte/shadcn-svelte/tree/main/packages/cli/test/fixtures/config-pkg-imports) provide integration references. Read the [local Bits UI index](./bits-ui.md) before changing its controls.

Validate an inventory quantity editor, a printing selector inside a dialog, and narrow-screen scan confirmation when adopting components. Check keyboard and touch operation, focus containment and restoration, labels, contrast, reduced motion, and pending or failed mutations. Type checks and upstream accessibility tests do not establish correct behavior in the composed application. The [interface acceptance checks](../product/specification.md#interface-acceptance) remain authoritative.
