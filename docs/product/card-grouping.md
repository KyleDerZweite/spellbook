# Card grouping

- Status: Canonical, Inventory groups implemented; deck categories proposed
- Last Reviewed: 2026-10-06
- Source of Truth: maintainer grouping decision, inventory and deck implementations
- Update Triggers: inventory groups, memberships, scan targets, deck category decisions
- Related Docs: [Product specification](./specification.md), [Domain model](../../GLOSSARY.md), [Frontend](../architecture/frontend.md), [Postgres](../architecture/postgres.md), [Mobile and scan](../architecture/mobile-and-scan.md), [UI direction](./ui-design-direction.md), [Product index](./README.md)

## Inventory groups

Inventory has one additional Groups view within `/mtg/inventory`. It does not add List/Grid variants or new automatic grouping controls. Existing list sorting and filtering remain available. Inventory groups are account-owned selections of entire inventory entries. They are separate from Decks and do not change deck requirements, availability or owned quantities.

Cards is the default view. Groups uses `?view=groups`; opening a named group uses `?view=groups&group=UUID` and the same compact inventory rows. View links preserve the shared header and content width. Groups shows empty groups as well as populated groups, with full entry and copy counts. The open group uses the shared filters and matching counts. Groups can be created, renamed and deleted. Group names contain 1 to 64 trimmed characters and are unique within one inventory, ignoring case, enforced by a database unique index. Creating or renaming a group does not add cards.

Assign cards in an open group leads to Cards, where the row action menu opens a Groups selection dialog. One entry can belong to multiple groups. Save replaces its selected memberships atomically, including an empty selection to remove all assignments; Cancel discards the draft. All copies within an entry share its memberships. The dialog identifies the entry's printing, finish, condition and quantity. Close returns focus to its row menu, or the group navigation when the saved selection removed that row from the current view. Pending and error handling follow the shared interaction rules.

Deleting a group requires confirmation and removes only its memberships. Deleting an inventory entry removes its memberships. Quantity edits update group counts without changing assignments. Overlapping group counts must not be summed as total ownership. The Inventory total counts every entry once. Removing a membership never removes owned cards.

## Implementation contract

A separate inventory-groups repository owns CRUD, batched group/count/membership reads and replacing an owned entry's memberships. The existing Inventory route supplies the presentation and form actions. Actions take account identity from the authenticated session and delegate to the repository. The repository validates entry and group ownership against the same inventory and game. Unknown or foreign identifiers fail without a partial membership update. The repository locks the owned inventory entry to serialize full membership replacements.

`inventory_groups` stores a stable UUID, inventory reference, name and timestamps. `inventory_group_memberships` joins a group ID to an entry ID, with a composite primary key and cascading foreign keys. The existing printing/finish/condition uniqueness and aggregate quantities remain unchanged. No dependency on deck tables or catalog reference data is introduced. The route loads memberships in a batch and filters locally, consistent with the current Inventory snapshot.

Reuse ActionMenu, FilterPopover, Select and ConfirmationDialog where their behavior fits. Group dialogs use Bits Dialog for focus and dismissal. Groups and Cards use the same row rendering. New views do not duplicate the navbar, card inspector or inventory addition form.

## Later Scan integration

Scan overhaul is a separate slice. Today's scan upload, review and commit remain unchanged. A future selector can choose an Inventory group by its stable identifier. The eventual scan commit must validate the target inventory, include the group ID in its idempotency fingerprint and update inventory plus membership within the existing transaction. A deleted or foreign target must fail before ownership changes.

Groups represent whole entries, not scan batches or physical locations. If a scan adds one copy to an entry that already owns three identical copies, assigning that entry to a group includes all four. Assigning only the scanned copy needs separate quantity allocations and is outside this slice. The recognition worker never owns group or account mutations.

## Acceptance

Verify CRUD and reload persistence, empty groups, multiple memberships without duplicated Inventory totals, Cancel and failed save retention, group deletion without lost cards, quantity changes, entry-deletion cascades and account isolation. Invalid mixed membership requests must roll back completely. Check keyboard focus, pending guards, desktop/mobile rendering and existing Card Details and Search overlay behavior. Existing scan and deck behavior must remain independent.

## Deck categories, proposed

Deck categories remain a separate unaccepted proposal. Current Decks groups by card type or section and sorts by name or quantity. Existing roles identify Main deck, Commander, Sideboard and Companion; categories must remain separate from those sections. No deck categories are implemented by the Inventory group slice.

Give each deck entry one primary category. This keeps every entry in one visible group and makes the group totals add up. A card that draws a card and counters a spell can belong to Counterspells in one deck and Draw in another. Multiple secondary tags would be a separate filter, rather than changing the primary grouping.

Deck categories belong to one deck. Deck categories do not change Inventory groups or the public catalog. Renaming a deck category does not rename another deck's categories.

Identify categories by stable IDs with editable names and ordering. Use an optional category reference on the entry, with Uncategorized as the fallback rather than a required setup step. Reject blank names and duplicate names within the same owner, ignoring case and surrounding whitespace. Assignment mutations must verify both the entry owner and category owner.

Rename changes the label without moving entries. Removing a category offers a replacement category or Uncategorized and moves its entries atomically. Removing a category never removes cards. Manual assignments survive quantity changes, import additions and printing replacement. If moving an entry between deck sections merges it into an existing entry, preserve the destination entry's category and explain that result before committing a conflicting move.

Suggested starter categories include Lands, Ramp, Draw, Counterspells, Removal, Board wipes, Protection and Recursion. Only populated suggestions need to appear. Custom names such as Token makers or Sacrifice outlets describe the user's deck plan without requiring a predefined taxonomy.

The current catalog supplies types, keywords and oracle text, but no authoritative strategy categories. Start automatic suggestions with narrow, deterministic rules and tested examples. Leave uncertain or multi-purpose cards in Uncategorized for review. Producing mana does not by itself make a land Ramp. Broad text matching does not establish a deck's strategy, and the interface must not present these rules as AI analysis.

Track whether an assignment is automatic or manual when suggestions are persisted. Manual choices always win. New cards can receive an automatic suggestion, but catalog refreshes and repeated imports must not silently reorganize existing assignments. Renamed categories keep their suggestion association through their stable ID; deleted suggestions must not immediately recreate a category the user removed. An explicit review action can reconsider automatic assignments later.
