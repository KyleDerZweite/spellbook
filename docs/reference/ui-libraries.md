# Selected UI components

- Status: Canonical
- Last Reviewed: 2026-10-05
- Source of Truth: accepted product decision, current application, upstream documentation
- Update Triggers: component adoption, generated source ownership, Svelte or Tailwind compatibility, interaction requirements
- Related Docs: [Reference](./README.md), [Bits UI](./bits-ui.md), [Frontend](../architecture/frontend.md), [Design direction](../product/ui-design-direction.md), [Product specification](../product/specification.md)

Spellbook uses shadcn-svelte source components with Bits UI, Svelte, and Tailwind. The first adopted component is the shared [Button](../../frontend/src/lib/components/ui/button/Button.svelte), adapted from the upstream implementation with its [MIT notice](../../frontend/src/lib/components/ui/button/LICENSE). Dialogs use Bits UI. Account and deck action groups use the shared [ActionMenu](../../frontend/src/lib/components/ui/menu/ActionMenu.svelte). Dropdown option selectors use the shared [Select](../../frontend/src/lib/components/ui/select/Select.svelte). The game and theme controls use [TooltipButton](../../frontend/src/lib/components/ui/tooltip/TooltipButton.svelte). The [design direction](../product/ui-design-direction.md) owns layout and branding.

shadcn-svelte supplies editable component source and Tailwind styling. The local Button uses existing CSS variants and Svelte class arrays; it adds no CLI or class-composition dependency. Bits UI supplies the keyboard, focus, and ARIA behavior for complex controls. Spellbook owns copied source, local changes, upstream fix adoption, and composed workflow behavior. Keep native inputs, checkboxes, radio groups, and buttons for simple form behavior. The avatar picker uses labeled native radios and the shared [Avatar](../../frontend/src/lib/components/profile/Avatar.svelte) renderer. Use the shared Select for option lists rather than adding a native select or another Bits composition.

The shared Select owns neutral trigger and menu styling, selected checkmarks, portalling, disabled options, and Bits keyboard behavior. Pass `options`, an accessible `label`, and a value or `bind:value`. Use `name` for form submission instead of duplicating its hidden input. Keep selectors inside their forms. Callers own filtering and save behavior. Scan selectors explicitly clear review confirmation when their values change.

ActionMenu owns action lists, link and download items, keyboard navigation, and the shared menu appearance. Use it for commands rather than option selection. Set `iconOnly` for the desktop account trigger to omit the chevron and reuse the shared icon-button styling. When a command opens a dialog, suppress the menu's close autofocus while that dialog opens, then return focus to the menu trigger when the dialog closes.

TooltipButton gives game and theme controls the same portal, collision handling, focus, hover, and Escape behavior. Tooltips supplement accessible button names. Separate dialog layouts can use Bits Dialog directly when their content and workflows differ.

Add only components needed by implemented workflows. Inspect their dependencies, retain license notices, and map styles to Spellbook's shared tokens. Review generated changes before using an initializer; do not overwrite application styles or introduce a second theme system to obtain one control. The CLI version does not version or update copied components.

Use SvelteKit 3's `#lib` package mapping with explicit `.ts` and `.svelte` extensions. Check TypeScript 7 resolution and share the semantic tokens in `app.css`. The [Kit installation guide](https://github.com/huntabyte/shadcn-svelte/blob/main/docs/content/installation/sveltekit.md), [Tailwind 4 migration guide](https://github.com/huntabyte/shadcn-svelte/blob/main/docs/content/migration/tailwind-v4.md), and [package-import fixture](https://github.com/huntabyte/shadcn-svelte/tree/main/packages/cli/test/fixtures/config-pkg-imports) provide integration references. Read the [local Bits UI index](./bits-ui.md) before changing its controls.

Future component changes must satisfy the [interface acceptance criteria](../product/specification.md#interface-acceptance) and follow the [verification workflow](../operations/github-automation.md#browser-verification-and-evidence).
