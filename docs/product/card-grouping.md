# Card grouping

- Status: Canonical, Inventory groups implemented; deck categories selected for design review
- Last Reviewed: 2026-10-06
- Source of Truth: maintainer grouping decision, inventory and deck implementations
- Update Triggers: inventory groups, memberships, scan targets, deck categories, automatic classification, account category templates and manual overrides
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

## Deck categories, design under review

On 2026-10-06, the maintainer included deck categories in the next implementation pass and selected one primary category per deck entry, separate from its role. The Category view groups Main deck; Commander, Sideboard and Companion retain their sections. Full automatic default categorization is required, with editable categories and manual override. Scryfall Oracle Tags remains a selected source. A semantic classifier such as TypeSafe Jev or a local model is now under evaluation; no additional provider is selected. Multi-purpose primary selection and reuse of custom categories across new decks remain under review. Current Decks groups by card type or section and sorts by name or quantity. No deck categories are implemented by the Inventory group slice.

The selected contract gives each deck entry one optional primary category. All copies of that entry share the assignment. This keeps every entry in one visible group and makes the group totals add up. A card that draws a card and counters a spell can belong to Counterspells in one deck and Draw in another. Multiple secondary tags would be a separate filter, rather than changing the primary grouping.

Deck categories belong to one deck. Deck categories do not change Inventory groups or the public catalog. Renaming a deck category does not rename another deck's categories.

Identify categories by stable IDs with editable names and ordering. Use an optional category reference on the entry, with Uncategorized as the fallback rather than a required setup step. Reject blank names and duplicate names within the same owner, ignoring case and surrounding whitespace. Assignment mutations must verify both the entry owner and category owner.

Rename changes the label without moving entries. Removing a category offers a replacement category or Uncategorized and moves its entries atomically. Removing a category never removes cards. Quantity changes and import additions preserve existing assignments. Role moves and printing replacement preserve the source category when no merge occurs. When either operation merges into an existing entry, preserve the destination entry's category and explain the result before committing a conflicting merge. The maintainer confirmed this merge rule on 2026-10-06.

Suggested starter categories include Lands, Ramp, Draw, Counterspells, Removal, Board wipes, Protection and Recursion. Only populated suggestions need to appear. Custom names such as Token makers or Sacrifice outlets describe the user's deck plan without requiring a predefined taxonomy.

The current catalog supplies types, keywords and Oracle text, but does not ingest the selected Oracle Tags source yet. Producing mana does not by itself make a land Ramp. Broad text matching does not establish a deck's strategy. Multi-purpose primary-category selection remains unresolved, and the interface must not present deterministic mapping as AI analysis.

Track whether an assignment is automatic or manual when suggestions are persisted. Apply automatic categorization once to existing Main-deck entries and to new entries. Manual choices always win, including a deliberate Uncategorized choice. Quantity changes, import additions and daily source refreshes must not silently reorganize existing assignments. Only an explicit Review/Reset re-evaluates automatic assignments. The maintainer confirmed this lifecycle on 2026-10-06.

Renamed categories keep their suggestion association through their stable ID; deleted suggestions must not immediately recreate a category the user removed. Account-wide category templates, custom automatic meanings and their relationship to deck-local labels remain under review.

## Automatic-category input research

Research on 2026-10-06 found that [Archidekt's announcement](https://archidekt.com/news/4958603) describes automatic defaults derived from common user assignments within an allowlisted vocabulary. It does not publish its algorithm or assignment dataset. Moxfield's [public repository](https://github.com/moxfield/moxfield-public) and first-party [tag feedback](https://moxfield.nolt.io/617) do not establish a public automatic strategy classifier. These findings do not justify recreating either site's hidden implementation.

[Scryfall's Tags API](https://scryfall.com/docs/api/tags) documents a public daily Oracle Tags bulk export. A no-credential fetch on 2026-10-06 confirmed the [bulk descriptor](https://api.scryfall.com/bulk-data/bd8df61e-5d0a-47a2-9086-40137a645b98). Tags join by `oracle_id` and have stable UUIDs, mutable names, parent/child relationships and direct card taggings. Consumers collect descendant taggings for parent traits. Weights describe prominence, not confidence probabilities. The community-maintained taxonomy is useful input, not a deck-specific purpose.

The sampled snapshot gave Command Tower a rainbow-land trait without Ramp, Rampant Growth a land-ramp trait, Sol Ring a mana-rock descendant of Ramp, and Archmage's Charm both Draw and Counterspell traits. Multiple inferred traits therefore need a local policy for the single primary category. Source adoption and explicit Review/Reset are selected. Mapping, ties and classifier quality remain under review. Full-catalog coverage and category conflicts have not been measured.

## Semantic-classifier evaluation

The maintainer requested an evaluation of TypeSafe Jev for automatic categories. The [HTTP API](https://docs.typesafe.ai/api) accepts structured card data as state and evaluates typed questions. A [Choice](https://docs.typesafe.ai/primitives/choice) selects one defined option; separate [Noul](https://docs.typesafe.ai/primitives/noul) questions can recognize multiple traits. The category list is supplied as criteria, not trained as customer-specific weights. The reviewed API documents shared-state questions, rather than an independent-record batch endpoint. Packing multiple card records into shared state would need its own quality and context-budget checks.

On 2026-10-06, the [model documentation](https://docs.typesafe.ai/models) lists Jev 1.13 at $0.042 per million input tokens, with output tokens free. It documents a hosted API and no downloadable weights or self-hosting procedure. No free allowance was established. Illustratively, 50,000 records at 1,000 input tokens each cost $2.10; actual catalog input size and spend have not been measured. A direct HTTP adapter would not require the vendor SDK, but would still depend on its hosted service and credentials.

No MTG quality advantage is established by typed output or the provider's confidence value. The [confidence guidance](https://docs.typesafe.ai/confidence) calls for target-domain evaluation, and the [model limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13) include option-order and irrelevant-state sensitivity. A candidate evaluation should compare a labeled card sample against Oracle Tags and the local default policy before selecting a provider. No authenticated inference call or model installation has occurred.

Catalog-time classification can produce generic card traits. It cannot know a later deck's intended use or a new account's custom category meaning. Category selection must remain separate from trait inference. Cached classifications with explicit input, taxonomy and model versions are a candidate design, not a selected integration. Existing manual assignments and the accepted Review/Reset lifecycle must survive any classifier change.
