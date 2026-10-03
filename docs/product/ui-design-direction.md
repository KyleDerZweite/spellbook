# UI design direction

- Status: Canonical
- Last Reviewed: 2026-10-03
- Source of Truth: accepted product requirements, application components, UI library research
- Update Triggers: navigation, deck editor interactions, component choices, visual design, responsive behavior, accessibility requirements
- Related Docs: [Product specification](./specification.md), [Routes](./routing-and-games.md), [Domain model](./domain-model.md), [UI library evaluation](../reference/ui-libraries.md), [Bits UI](../reference/bits-ui.md), [Frontend architecture](../architecture/frontend.md), [Product index](./README.md)

Spellbook is a card workspace with direct access to search, inventory, and decks. The interface retains Spellbook's original dark-purple and gold identity and established layout. This change adds required workflow components and reduces oversized text. A broader visual redesign is deferred to [issue #168](https://github.com/KyleDerZweite/spellbook/issues/168).

## References and component choice

[Moxfield](https://www.moxfield.com/) and [Archidekt](https://archidekt.com/) are references for card-centered deck editing. Their catalog search, grouped deck sections, visible counts, compact card rows, and import/export patterns inform functional research. A later design task may evaluate their layout ideas. Spellbook keeps its original visual identity and layout during this change.

These references do not establish a shipped design overhaul or feature parity with either service. Public social pages, recommendations, collaboration, and gameplay tools remain outside this change.

Retain Svelte, Tailwind, and Bits UI. Use existing components first and native HTML controls when they meet the requirement. Use Bits UI for dialogs, menus, and other interactions that need managed focus and keyboard behavior. The [library evaluation](../reference/ui-libraries.md) records the alternatives and reasons for retaining this combination.

## Workspace structure

Navigation presents the implemented workspaces consistently. Local account actions remain reachable without competing with card work. The home page should lead users into the workspace rather than imply that social or unimplemented features exist.

On desktop, the deck editor can place catalog discovery beside the selected deck. Keep the selected deck's name, format, quantities, role sections, and import/export actions easy to find. Use compact rows when users compare many quantities and show images where they aid recognition.

On narrow screens, stack discovery and editing areas. Keep required actions visible without horizontal page scrolling or hover. A menu may condense navigation, but it must retain accessible names and usable touch targets.

## Workflow rules

Search identifies catalog cards, and printing selection chooses the record added to inventory or a deck. Show the card name and relevant printing metadata before an add. Preserve the selected printing when changing the quantity, finish, or condition.

Inventory is the owned-card ledger. Its list and spellbook presentations show the same data. A spellbook position does not represent a binder or box location. Do not show location filters or movement actions until physical locations exist.

The deck editor groups entries by main deck, sideboard, commander, and companion. Quantity edits and role moves update deck requirements. Availability labels distinguish exact owned copies, alternate printings, and missing copies. They must not imply that inventory has been reserved across decks.

Import uses an explicit preview followed by commit. Editing the submitted text invalidates the preview. Unresolved and ambiguous lines stay readable, and the interface states what will remain uncommitted. Export returns the supported plain-text representation.

The `/scan` workspace uploads images, displays candidates, supports manual printing selection, and requires explicit inventory confirmation. External recognition results remain reviewable evidence. Direct browser camera capture and automatic recognition remain planned.

## Visual and interaction rules

Preserve the original dark-purple surfaces, gold accents, typography, and familiar layout. Use smaller, readable interface text and add only the components needed for implemented workflows. Do not introduce a slate or teal replacement theme, oversized headings, decorative subtitles, or new visual subheadings. Keep form labels, role names, and accessible structure clear. Avoid decorative panels that displace inventory or deck content. Color can reinforce role or availability state, but a text label must carry the meaning.

Reuse shared buttons, inputs, panels, dialogs, and loading indicators. Avoid introducing a second theme or component system for one workflow. A component library supplies interaction mechanisms; application code still owns labels, composition, error states, and contrast.

Keep visible focus, label all inputs, and provide accessible names for icon controls. Dialogs must have a title, support keyboard dismissal where appropriate, contain focus, and restore focus to a useful control. Account for touch interaction and reduced motion.

Every mutation needs pending, success, and failure feedback. Keep user input after a failed request so correction does not require re-entry. Require explicit confirmation for deleting a deck, while keeping ordinary quantity edits direct.

The [specification's acceptance checks](./specification.md#interface-acceptance) determine workflow completion. Browser verification must inspect the composed application rather than infer accessibility from a dependency's documentation.
