# ADR-0011: A card-led collector workspace

- Status: Accepted
- Last Reviewed: 2026-10-05
- Source of Truth: maintainer redesign request, application components
- Update Triggers: visual identity, navigation structure, frontend stack changes
- Related Docs: [Design direction](../product/ui-design-direction.md), [Frontend](../architecture/frontend.md), [Decisions](./README.md)

The maintainer requested a full replacement of the frontend design and permitted a stack change. The prior fixed visual direction no longer constrains this work.

Use a neutral dark card workspace with compact top navigation. Separate public introduction from signed-in inventory and deck tasks. Use actual card artwork and CSS perspective for the public showcase. Pokémon and Yu-Gi-Oh! artwork does not add support for those games. Keep the existing SvelteKit, Tailwind, and Bits UI implementation because it supports the new layout without replacing authenticated routes, form actions, or accessible dialogs. No new dependency is needed.

The canonical design direction owns palette, typography, responsive rules, and workflow presentation. Real card content, readable metadata, and direct workflow actions take priority over slogans and decorative panels. The deck workspace uses compact editing, contextual inspection, and a shared list/stacks model based on working references. Custom categories and gameplay analysis remain separate future features. Demo authentication is an explicit deployment mode documented by the authentication owner.
