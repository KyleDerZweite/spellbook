# Card grouping proposal

- Status: Proposed, not implemented
- Last Reviewed: 2026-10-06
- Source of Truth: maintainer grouping request, current deck and inventory workflows
- Update Triggers: grouping decisions, category ownership, automatic suggestions, sorting, deck or inventory entry behavior
- Related Docs: [Product specification](./specification.md), [Domain model](../../GLOSSARY.md), [UI direction](./ui-design-direction.md), [Product index](./README.md)

This proposal adds editable categories and consistent grouping controls to Decks and Inventory. It records recommendations for review, not implemented behavior or an accepted architecture. The [UI direction](./ui-design-direction.md) continues to own shared visual and interaction rules.

Currently, Decks groups by card type or section and sorts by name or quantity. Inventory's clickable column headers support set grouping and additional finish, condition or quantity ordering. Its toolbar Sort menu exposes the same ordering choices, including Newest first by entry creation date. [Owned inventory](./specification.md#owned-inventory) defines this implemented behavior. Neither workflow stores custom categories. Existing deck `role` values identify Main deck, Commander, Sideboard and Companion; categories must remain separate from those sections.

## Presentation

Use the same shared Group and Sort controls in both workspaces. A small collapsible group header contains its name and copy count, followed by the existing rows or stacks. Keep neutral surfaces and spacing instead of enclosing every group in a panel. Category actions use the shared action menu. A group heading is functional navigation, not a decorative subtitle.

| Workspace | Recommended default      | Group options                                                       | Sort options                                                      |
| --------- | ------------------------ | ------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Decks     | Category, name ascending | Category, Type, Section                                             | Name ascending or descending, Quantity; Mana value when available |
| Inventory | None, name ascending     | None, Category, Set, Finish, Condition; Type after metadata support | Name ascending or descending, Quantity, Newest first              |

Grouping and sorting are independent. Sorting orders entries inside each group; it does not rearrange the categories. Use a stable category order, alphabetical set groups and fixed type order. Break equal sort values with name, printing and entry identity so rows do not jump unexpectedly. Grouping choices must not change ownership, deck requirements or stored display positions.

Inventory starts ungrouped to preserve its compact list. Decks starts with categories once that feature exists. An entry without a category appears under Uncategorized. An empty deck shows its existing empty state, without a list of empty starter groups. Hide empty automatic groups; retain empty categories that the user created so they can still edit them.

Commander stays first. Main deck uses the selected category or type grouping. Sideboard and Companion remain visibly separate sections, even when their entries share a category with Main deck. Section names retain their existing meaning and cannot be renamed through category controls.

Apply filters before computing visible group counts. Sum quantities, not rows: deck counts represent required copies and inventory counts represent owned copies. Keep the unfiltered workspace total distinguishable from matching counts. Collapsing a group changes visibility only. Inventory set completion continues to count distinct canonical cards separately from copy counts.

Use a keyboard-operable disclosure button with its expanded state. Keep group actions usable on touch and keyboard without hover. Reuse the existing Select and ActionMenu components; share group presentation where it has the same behavior across both pages.

## Categories and suggestions

Give each entry one primary category. This keeps every entry in one visible group and makes the group totals add up. A card that draws a card and counters a spell can belong to Counterspells in one deck and Draw in another. Multiple secondary tags are a possible later filter, not part of the first grouping model.

Deck categories belong to one deck. Inventory categories belong to an account and game and apply to its owned entries. Neither assignment changes the public catalog. Inventory must not inherit a category from whichever deck happened to be opened last. Renaming a deck category does not rename inventory categories or another deck's categories.

Identify categories by stable IDs with editable names and ordering. Use an optional category reference on the entry, with Uncategorized as the fallback rather than a required setup step. Reject blank names and duplicate names within the same owner, ignoring case and surrounding whitespace. Assignment mutations must verify both the entry owner and category owner.

Rename changes the label without moving entries. Removing a category offers a replacement category or Uncategorized and moves its entries atomically. Removing a category never removes cards. Manual assignments survive quantity changes, import additions and printing replacement. If moving an entry between deck sections merges it into an existing entry, preserve the destination entry's category and explain that result before committing a conflicting move.

Suggested starter categories include Lands, Ramp, Draw, Counterspells, Removal, Board wipes, Protection and Recursion. Only populated suggestions need to appear. Custom names such as Token makers or Sacrifice outlets describe the user's deck plan without requiring a predefined taxonomy.

The current catalog supplies types, keywords and oracle text, but no authoritative strategy categories. Start automatic suggestions with narrow, deterministic rules and tested examples. Leave uncertain or multi-purpose cards in Uncategorized for review. Producing mana does not by itself make a land Ramp. Broad text matching does not establish a deck's strategy, and the interface must not present these rules as AI analysis.

Track whether an assignment is automatic or manual when suggestions are persisted. Manual choices always win. New cards can receive an automatic suggestion, but catalog refreshes and repeated imports must not silently reorganize existing assignments. Renamed categories keep their suggestion association through their stable ID; deleted suggestions must not immediately recreate a category the user removed. An explicit review action can reconsider automatic assignments later.

## Scope and verification

Begin with shared grouping presentation, independent sorting, category editing and assignment persistence. Name descending and grouping by stored inventory fields need no new catalog service. Inventory Type grouping requires batch catalog metadata because inventory entries currently store no card type; do not add per-row requests or treat placeholder card documents as authoritative metadata. Add automatic suggestions only when their rules and unknown cases have useful coverage.

The recommended first release uses entry-level categories and one primary assignment. This means all interchangeable copies within an inventory entry share its category. Splitting copies into Trade and Keep would require a separate ownership model and is outside this proposal. Reusable cross-deck templates, multi-tag groups, drag-and-drop ordering and inferred deck archetypes can remain later decisions.

Verify account and deck isolation, rename and deletion behavior, stable sorting, filtered quantity totals, automatic versus manual assignments, printing replacement, import additions and section merges. Browser checks should cover a realistic 100-card deck, duplicate printings, long category names, narrow screens, keyboard controls and collapsed groups. Existing availability and set-completion calculations must retain their distinct semantics.
