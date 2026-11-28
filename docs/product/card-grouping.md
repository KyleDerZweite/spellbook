# Card grouping

- Status: Canonical, Inventory groups implemented; Deck presentation contract accepted
- Last Reviewed: 2026-11-28
- Source of Truth: maintainer grouping decision, inventory and deck implementations
- Update Triggers:
  - managed Category removal
  - versioned MTG routes and module ownership
  - Python source activation and server contraction
  - Inventory Box labels versus future physical storage
  - inventory groups
  - memberships
  - scan targets
  - accepted design contracts and implementation evidence
- Related Docs:
  - [Product specification](./specification.md)
  - [Domain model](../../GLOSSARY.md)
  - [Frontend](../architecture/frontend.md)
  - [Postgres](../architecture/postgres.md)
  - [Mobile and scan](../architecture/mobile-and-scan.md)
  - [UI direction](./ui-design-direction.md)
  - [Product index](./README.md)
  - [Cardstation physical storage decision](../decisions/0030-cardstation-physical-storage.md)

## Inventory groups

Inventory has one additional Boxes view within `/mtg/inventory`. Boxes is the interface name for
existing Inventory groups. Physical storage and per-box quantities remain a later domain decision.
It does not add List/Grid variants or new automatic grouping controls. Existing list sorting and
filtering remain available. Inventory groups are account-owned selections of entire inventory
entries. They are separate from Decks and do not change deck requirements, availability or owned
quantities.

Cards is the default view. Boxes uses `?view=groups`; opening a named group uses
`?view=groups&group=UUID` and the same compact inventory rows. View links preserve the shared header
and content width. Boxes shows empty groups as well as populated groups, with full entry and copy
counts. The open group uses the shared filters and matching counts. Groups can be created, renamed
and deleted. Group names contain 1 to 64 trimmed characters and are unique within one inventory,
ignoring case, enforced by a database unique index. Creating or renaming a group does not add cards.

Assign cards in an open group leads to Cards, where the row action menu opens a Boxes selection
dialog. One entry can belong to multiple groups. Save replaces its selected memberships atomically,
including an empty selection to remove all assignments; Cancel discards the draft. All copies within
an entry share its memberships. The dialog identifies the entry's printing, finish, condition and
quantity. Close returns focus to its row menu, or the group navigation when the saved selection
removed that row from the current view. Pending and error handling follow the shared interaction
rules.

Deleting a group requires confirmation and removes only its memberships. Deleting an inventory entry
removes its memberships. Quantity edits update group counts without changing assignments.
Overlapping group counts must not be summed as total ownership. The Inventory total counts every
entry once. Removing a membership never removes owned cards.

The accepted [Cardstation storage direction](../decisions/0030-cardstation-physical-storage.md)
keeps these virtual Boxes unchanged. A later **Physical Box** is a distinct account-owned storage
location with **quantities per Inventory entry**, not another Inventory group or an automatic
one-to-one mapping. A physical Box may contain several quantities from an entry, and one entry may
be allocated across several physical Boxes. Future QR labels identify the physical Box, not this
group or its selected members. The current page does not display recorded physical contents. The
proposed [filter and label interface](../integrations/cardstation-filter-box-interface.md) belongs
to later integration and does not redefine current group CRUD.

## Implementation contract

The label change preserves existing `group` query parameters, action names, DTO fields and
persistence. It adds no physical-copy allocation or worker integration.

The shared backend
[Inventory mutation use cases](../../backend/core/src/spellbook_core/mtg/inventory.py) own Group
CRUD and whole-entry membership replacement. Web forms and public Group HTTP routes delegate with a
trusted session-produced actor, caller-stable request IDs and compact original receipts. Backend
page reads own bounded directory pages, group counts and loaded memberships. Unknown or foreign
entry/group IDs fail atomically.
[The application contract](../architecture/application-contract.md#inventory-query-contract) owns
Profile/account, Inventory, entry and Group lock ordering, semantic revisions and replay after
deletion.

`inventory_groups` stores a stable UUID, inventory reference, name and timestamps.
`inventory_group_memberships` joins a group ID to an entry ID, with a composite primary key and
cascading foreign keys. The existing printing/finish/condition uniqueness and aggregate quantities
remain unchanged. No dependency on deck tables or catalog reference data is introduced. Backend page
reads apply filters before paging and return memberships only for loaded entries. Full group counts
remain metadata; the directory page is bounded.
[The query contract](../architecture/application-contract.md#inventory-query-contract) owns
consistency and count semantics.

Reuse ActionMenu, FilterPopover, Select and ConfirmationDialog where their behavior fits. Box
dialogs use Bits Dialog for focus and dismissal. Boxes and Cards use the same row rendering. New
views do not duplicate the navbar, card inspector or inventory addition form.

## Later Scan integration

Scan overhaul is a separate slice. Today's scan upload, review and commit remain unchanged. A future
selector can choose an Inventory group by its stable identifier. The eventual scan commit must
validate the target inventory, include the group ID in its idempotency fingerprint and update
inventory plus membership within the existing transaction. A deleted or foreign target must fail
before ownership changes.

Groups represent whole entries, not scan batches or physical locations. If a scan adds one copy to
an entry that already owns three identical copies, assigning that entry to a group includes all
four. Assigning only the scanned copy needs separate quantity allocations and is outside this slice.
The recognition worker never owns group or account mutations.

## Acceptance

Verify CRUD and reload persistence, empty groups, multiple memberships without duplicated Inventory
totals, Cancel and failed save retention, group deletion without lost cards, quantity changes,
entry-deletion cascades and account isolation. Invalid mixed membership requests must roll back
completely. Check keyboard focus, pending guards, desktop/mobile rendering and existing Card Details
and Search overlay behavior. Existing scan and deck behavior must remain independent.

## Deck presentation

Commander, Main, Sideboard and Companion remain distinct Deck roles. Main groups entries only by
actual card types from the Catalog. These presentation groups do not change Deck requirements,
quantities or Inventory ownership.

### Deck Tokens

The Deck Token list appears after the Deck sections. Spellbook uses direct Catalog Token references
from Commander, Main and Companion entries and records the source entry IDs. Each source contributes
an estimate. A fixed amount is multiplied by the entry's copies and capped at 10. Repeatable
abilities contribute 3 per copy, capped at 6. Variable X contributes 3 per entry. An unclear
Oracle-text amount contributes 1 per entry. Spellbook adds these estimates for each Token printing.

Auto-refresh is on by default and recalculates the list when Deck composition changes. Turning it on
recalculates immediately. Refresh Tokens recalculates on demand. Each refresh preserves the signed
adjustment. Setting a quantity stores the difference from the suggestion, and reset clears the
adjustment. The effective quantity is the suggestion plus the adjustment, with a minimum of 0.

Tokens whose last source disappears stay visible with a zero suggestion and retain any positive
adjustment. Users can remove these Tokens or include them in the printed Deck list. An included
Token with quantity 0 prints as one copy. When source metadata is unavailable, Spellbook retains
the last estimate for that source and reports incomplete Catalog evidence.

Deck Tokens are independent of Deck size, format legality, valuation and Inventory ownership.
