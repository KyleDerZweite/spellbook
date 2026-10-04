# UI design direction

- Status: Canonical
- Last Reviewed: 2026-10-04
- Source of Truth: accepted product requirements, application components, selected logo and component choices
- Update Triggers: navigation, deck editor interactions, component choices, visual design, brand identity, icon direction, responsive behavior, accessibility requirements
- Related Docs: [Product specification](./specification.md), [Routes](./routing-and-games.md), [Domain model](../../CONTEXT.md), [Selected UI components](../reference/ui-libraries.md), [Bits UI](../reference/bits-ui.md), [Brand assets](../reference/website-icons.md), [Frontend architecture](../architecture/frontend.md), [Product index](./README.md)

Spellbook is a card workspace with direct access to search, inventory, decks, and scan review. Its base design uses dark graphite surfaces, white sans-serif text, teal primary actions, blue accents, and small violet details. The supplied logo and visual reference inform these choices; the application adapts their core idea to its own workflows. This base design is implemented and remains fixed for the current scope. Further UI work is deferred in [issue #168](https://github.com/KyleDerZweite/spellbook/issues/168).

## References and component choice

[Moxfield](https://www.moxfield.com/) and [Archidekt](https://archidekt.com/) are references for card-centered deck editing. Their catalog search, grouped deck sections, visible counts, compact card rows, and import/export patterns inform functional research. Use these interaction ideas where they fit Spellbook's own inventory and deck workflows; do not copy either service's branding or layout wholesale.

These references do not establish feature parity with either service. Public social pages, recommendations, collaboration, and gameplay tools remain outside this change.

The current application uses Svelte, Tailwind, and Bits UI. Existing components and native HTML controls cover simple forms; Bits UI supplies dialogs, menus, and other interactions that need managed focus and keyboard behavior. The shared Button is adapted from shadcn-svelte; existing Bits UI controls remain in use. The [component guidance](../reference/ui-libraries.md) owns adopted files and maintenance rules.

## Selected brand artwork

The user-supplied `logo.png` is the selected Spellbook artwork. Its derivatives supply navigation and installation icons. The home workspace uses a separate modeled card-box illustration. The [brand asset reference](../reference/website-icons.md) owns source files, installed filenames, dimensions, and verification. Prior generated concepts are discarded; keep local exploration and provenance artifacts outside production assets.

The application applies the reference's dark neutral base, clear white typography, and colored card-sleeve groups as a coherent interface. Preserve the distinction between brand accents and MTG mana or rarity colors.

## Workspace structure

Navigation presents the implemented workspaces consistently. The home page offers authenticated catalog search or local account actions, plus direct links to the deck builder, card search, inventory, and scan review. Signed-in accounts see their inventory totals and recent additions. Shared panels and compact controls carry the base design across account forms and card workspaces.

On desktop, the deck editor can place catalog discovery beside the selected deck. Keep the selected deck's name, format, quantities, role sections, and import/export actions easy to find. Use compact rows when users compare many quantities and show images where they aid recognition.

On narrow screens, stack discovery and editing areas. Keep required actions visible without horizontal page scrolling or hover. A menu may condense navigation, but it must retain accessible names and usable touch targets.

## Workflow rules

Search identifies canonical cards, and printing selection chooses the record added to inventory or a deck. Show the card name and relevant printing metadata before an add. Preserve the selected printing when changing the quantity, finish, or condition.

Inventory is the owned-card ledger and presents entries as a list. Stored ordering metadata does not establish a binder view or physical location. Do not show location filters or movement actions until physical locations exist.

The deck editor groups entries by main deck, sideboard, commander, and companion. Quantity edits and role moves update deck requirements. Availability labels distinguish exact owned copies, alternate printings, and missing copies. They must not imply that inventory has been reserved across decks.

Import uses an explicit preview followed by commit. Editing the submitted text invalidates the preview. Unresolved and ambiguous lines stay readable, and the interface states what will remain uncommitted. Export returns the supported plain-text representation.

The `/scan` workspace uploads images, displays candidates, supports manual printing selection, and requires explicit inventory confirmation. External recognition results remain reviewable evidence. Direct browser camera capture and automatic recognition remain planned.

## Visual and interaction rules

Use graphite surfaces, teal actions, blue accents, and restrained violet details through shared semantic tokens. Plus Jakarta Sans supplies compact interface typography, with system sans-serif fallbacks. Use components needed for implemented workflows. Avoid oversized headings and decorative subtitles. Do not introduce new visible subheadings. Keep form labels, role names, and accessible structure clear. Avoid decorative panels that displace inventory or deck content. Color can reinforce role or availability state, but a text label must carry the meaning.

Reuse shared buttons, inputs, panels, dialogs, and loading indicators. Avoid introducing a second theme or component system for one workflow. A component library supplies interaction mechanisms; application code still owns labels, composition, error states, and contrast.

Keep visible focus, label all inputs, and provide accessible names for icon controls. Dialogs must have a title, support keyboard dismissal where appropriate, contain focus, and restore focus to a useful control. Account for touch interaction and reduced motion.

Every mutation needs pending, success, and failure feedback. Keep user input after a failed request so correction does not require re-entry. Require explicit confirmation for deleting a deck, while keeping ordinary quantity edits direct.

The [specification's acceptance criteria](./specification.md#interface-acceptance) define workflow requirements. The [verification workflow](../operations/github-automation.md#browser-verification-and-evidence) owns browser checks and evidence.
