# Card grouping

- Status: Canonical, Inventory groups and starter primary Deck Entry Categories implemented; account rules and whole-deck categories planned
- Last Reviewed: 2026-10-07
- Source of Truth: maintainer grouping decision, inventory and deck implementations
- Update Triggers: inventory groups, memberships, scan targets, deck entry and whole-deck categories, automatic classification, account category definitions and manual overrides, accepted design contracts and implementation evidence
- Related Docs: [Product specification](./specification.md), [Domain model](../../GLOSSARY.md), [Classifier research](../integrations/card-categorization.md), [Frontend](../architecture/frontend.md), [Postgres](../architecture/postgres.md), [Mobile and scan](../architecture/mobile-and-scan.md), [UI direction](./ui-design-direction.md), [Product index](./README.md), [Category rules](../architecture/category-rules.md)

## Inventory groups

Inventory has one additional Groups view within `/mtg/inventory`. It does not add List/Grid variants or new automatic grouping controls. Existing list sorting and filtering remain available. Inventory groups are account-owned selections of entire inventory entries. They are separate from Decks and do not change deck requirements, availability or owned quantities.

Cards is the default view. Groups uses `?view=groups`; opening a named group uses `?view=groups&group=UUID` and the same compact inventory rows. View links preserve the shared header and content width. Groups shows empty groups as well as populated groups, with full entry and copy counts. The open group uses the shared filters and matching counts. Groups can be created, renamed and deleted. Group names contain 1 to 64 trimmed characters and are unique within one inventory, ignoring case, enforced by a database unique index. Creating or renaming a group does not add cards.

Assign cards in an open group leads to Cards, where the row action menu opens a Groups selection dialog. One entry can belong to multiple groups. Save replaces its selected memberships atomically, including an empty selection to remove all assignments; Cancel discards the draft. All copies within an entry share its memberships. The dialog identifies the entry's printing, finish, condition and quantity. Close returns focus to its row menu, or the group navigation when the saved selection removed that row from the current view. Pending and error handling follow the shared interaction rules.

Deleting a group requires confirmation and removes only its memberships. Deleting an inventory entry removes its memberships. Quantity edits update group counts without changing assignments. Overlapping group counts must not be summed as total ownership. The Inventory total counts every entry once. Removing a membership never removes owned cards.

## Implementation contract

The shared backend [Inventory mutation use cases](../../backend/src/inventory/mutations.ts) own Group CRUD and whole-entry membership replacement. Web forms and public Group HTTP routes delegate with a trusted session-produced actor, caller-stable request IDs and compact original receipts. Backend page reads own bounded directory pages, group counts and loaded memberships. Unknown or foreign entry/group IDs fail atomically. [The application contract](../architecture/application-contract.md#inventory-query-contract) owns Profile/account, Inventory, entry and Group lock ordering, semantic revisions and replay after deletion.

`inventory_groups` stores a stable UUID, inventory reference, name and timestamps. `inventory_group_memberships` joins a group ID to an entry ID, with a composite primary key and cascading foreign keys. The existing printing/finish/condition uniqueness and aggregate quantities remain unchanged. No dependency on deck tables or catalog reference data is introduced. Backend page reads apply filters before paging and return memberships only for loaded entries. Full group counts remain metadata; the directory page is bounded. [The query contract](../architecture/application-contract.md#inventory-query-contract) owns consistency and count semantics.

Reuse ActionMenu, FilterPopover, Select and ConfirmationDialog where their behavior fits. Group dialogs use Bits Dialog for focus and dismissal. Groups and Cards use the same row rendering. New views do not duplicate the navbar, card inspector or inventory addition form.

## Later Scan integration

Scan overhaul is a separate slice. Today's scan upload, review and commit remain unchanged. A future selector can choose an Inventory group by its stable identifier. The eventual scan commit must validate the target inventory, include the group ID in its idempotency fingerprint and update inventory plus membership within the existing transaction. A deleted or foreign target must fail before ownership changes.

Groups represent whole entries, not scan batches or physical locations. If a scan adds one copy to an entry that already owns three identical copies, assigning that entry to a group includes all four. Assigning only the scanned copy needs separate quantity allocations and is outside this slice. The recognition worker never owns group or account mutations.

## Acceptance

Verify CRUD and reload persistence, empty groups, multiple memberships without duplicated Inventory totals, Cancel and failed save retention, group deletion without lost cards, quantity changes, entry-deletion cascades and account isolation. Invalid mixed membership requests must roll back completely. Check keyboard focus, pending guards, desktop/mobile rendering and existing Card Details and Search overlay behavior. Existing scan and deck behavior must remain independent.

## Deck categories

The maintainer selected both Deck entry categories inside the editor and Deck categories for whole decks in the Library. These are separate concepts in the [glossary](../../GLOSSARY.md). Full automatic default categorization, editable custom meanings and manual override are required. Starter primary categories are implemented separately from Inventory groups. Account customization and whole-deck categories remain planned.

Scryfall Oracle Tags remains a selected source for card traits. On 2026-10-06, the maintainer selected automatic categorization from sources, card types and explicit rules. Free-text-only meanings and a stronger or hybrid semantic classifier are outside this pass. Jev remains the recorded prototype. Q56 accepted the optional local Commander Spellbook bulk adapter for documented ingredients/outcomes. [Integration research](../integrations/card-categorization.md) owns dated source evidence; [category rules](../architecture/category-rules.md) owns the accepted adapter constraints and evaluation mechanisms. The Oracle Tags importer and starter primary assignment lifecycle are implemented; the optional combo adapter remains planned.

### Implemented starter Deck entry categories

One primary category belongs to each deck entry, separate from its role. The Category view groups Main deck; Commander, Sideboard and Companion retain their sections. Decks groups by card type, section or primary category and sorts by name or quantity.

The implemented starter contract gives each Main entry one optional primary category. All copies of that entry share the assignment. This keeps every entry in one visible group and makes the group totals add up. A card that draws a card and counters a spell can belong to Counterspells in one deck and Draw in another. Multiple secondary tags would be a separate filter, rather than changing the primary grouping.

Deck entry categories belong to one deck. They do not change Inventory groups or the public catalog. Deck creation adopts the complete ordered starter bundle. Existing Decks initialize through an explicit POST; enhanced opening submits it once and native forms expose the same command. Reads never mutate. Pending source evidence is visibly distinct from Manual Uncategorized. The [category owner](../architecture/category-rules.md#implemented-starter-entry-decisions) records the implementation. The following account-library operations remain planned. Reusable definitions belong to an account library with separate scopes for Deck entries and whole Decks. Names, meaning and explicit rules are edited together when creating a new meaning. The definition is then available automatically to new decks. Existing decks retain their names and assignments until explicit Review/Reset; the starter Draw meaning remains available as a fallback. The maintainer confirmed this ownership on 2026-10-06.

Identify categories by stable IDs with editable names and ordering. Use an optional category reference on the entry, with Uncategorized as the fallback rather than a required setup step. Reject blank names and duplicate names within the same owner, ignoring case and surrounding whitespace. Assignment mutations must verify both the entry owner and category owner.

Rename changes the label without moving entries. Removing a category offers a replacement category or Uncategorized and moves its entries atomically. Removing a category never removes cards. Quantity changes and import additions preserve existing assignments. Role moves and printing replacement preserve the source category when no merge occurs. When either operation merges into an existing entry, preserve the destination entry's category and explain the result before committing a conflicting merge. The maintainer confirmed this merge rule on 2026-10-06.

The accepted first-match starter order is Lands, Board wipes, Counterspells, Removal, Ramp, Draw, Protection, Recursion. Custom-rule priority precedes starters and is independent of display-group ordering. Only populated suggestions need to appear. Custom names such as Token makers or Sacrifice outlets describe the user's deck plan without requiring a predefined taxonomy.

The current catalog supplies types, keywords and Oracle text. An independent public Oracle Tags publication supplies starter traits. Producing mana does not by itself make a land Ramp. Broad text matching does not establish a deck's strategy. The accepted [rule interface](../architecture/category-rules.md#later-bounded-rule-interface) supports explicit catalog traits, versioned source tags and bounded predicates. Missing source evidence remains unknown, including under negation. A broad Token-makers starter is excluded because the inspected narrow subtree does not support it. The interface must not present source/rule mapping as AI analysis.

Track whether an assignment is automatic or manual when suggestions are persisted. Apply automatic categorization once to existing Main-deck entries and to new entries. Manual choices always win, including a deliberate Uncategorized choice. Quantity changes, import additions and daily source refreshes must not silently reorganize existing assignments. Only an explicit Review/Reset re-evaluates automatic assignments. The maintainer confirmed this lifecycle on 2026-10-06.

Renamed entry categories keep stable identifiers; deleted suggestions must not immediately recreate a category the user removed. Changing Draw into a new meaning such as Infinite Counter updates explicit classification criteria and its reusable account definition, rather than inferring meaning from a label alone. The selected pass uses rules, not free-text semantic inference.

### Later whole-Deck categories

Deck categories group whole decks in the Library. The maintainer selected automatic reuse of custom meanings, including an Infinite Counter example, for new decks. This classification may need the deck's full composition. Card-level traits alone do not establish an infinite combo or an archetype.

Definitions belong to the account. One deck can belong to multiple categories, such as Control and Combo. Library filters use these assignments; overall totals count each deck once even when categories overlap. Whole-deck categories do not replace the selected primary category of each entry, its role or the deck's format.

Re-evaluate automatic whole-deck assignments after saved composition changes, coalescing short editing bursts. Preserve manual decisions. Editing a definition's meaning or rules does not reorganize existing decks until explicit Review/Reset. New decks use the current definitions. The maintainer confirmed this lifecycle and multiple categories per deck on 2026-10-06. Q56 accepted immutable definition versions and adoption of the full ordered bundle at deck creation, including definitions that do not initially match. [Category rules](../architecture/category-rules.md) owns storage and revision protection. Composition-triggered whole-deck reevaluation uses the latest valid source facts with exact provenance; a source refresh alone never reassigns categories. Unknown reevaluation retains a prior valid result visibly pending/stale.

## Classifier research

[Automatic card categorization](../integrations/card-categorization.md) owns the dated Oracle Tags coverage probe, comparable-tool findings, Jev experiment and curated combo alternative. Source coverage and typed model output do not establish primary-category quality. Q56 accepted the [category contract](../architecture/category-rules.md), including supported rules, source provenance, version adoption and fixed-example acceptance requirements. Review previews latest definitions/sources and preserves manual decisions. Reset releases manual choices only within the selected scope. Both show moves and changed labels before commit, reject stale composition/decision revisions and restore suppressed origins only by explicit selection. Existing manual assignments must survive source changes.
