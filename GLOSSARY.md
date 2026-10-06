# Spellbook

- Status: Canonical domain glossary
- Last Reviewed: 2026-10-06
- Source of Truth: product specification, accepted domain requirements, schema, catalog and account repositories
- Update Triggers: card identity, inventory grouping, deck roles, deck entry categories, whole-deck categories and availability, reference prices and acquisition costs, scan review, physical-card terminology, profile cards and metric placeholders
- Related Docs: [Product specification](docs/product/specification.md), [Value tracking](docs/product/value-tracking.md), [Catalog](docs/architecture/catalog.md), [Postgres](docs/architecture/postgres.md), [Card scanner and sorter](docs/integrations/card-robot.md)

Spellbook describes MTG catalog identities, owned cards, deck requirements, and scan review in one context. This glossary owns terminology; the linked documents own behavior and proposed capabilities.

## Language

**Profile card**:
A user-designed digital card representing an account, with chosen artwork and text that may include current account metrics.
_Avoid_: Canonical card, printing, inventory entry

**KPI placeholder**:
A named marker in profile-card text that refers to a current measured account value rather than a fixed user-written number.
_Avoid_: Rank, historical trend, completed-set claim

**Canonical card**:
A Magic: The Gathering identity shared across printings, identified by Scryfall's `oracle_id` and recorded as `canonicalCardId` in inventory and deck entries.
_Avoid_: Catalog card, printing, owned card

**Printing**:
A particular Scryfall record identified by its `id` and recorded as `catalogCardId` in inventory and deck entries. Its identity includes its set, collector number, and language.
_Avoid_: Canonical card, inventory entry

**Catalog**:
The shared reference data for canonical cards and their printings, independent of any account's ownership.
_Avoid_: Inventory, collection

**Catalog generation**:
A complete transformed catalog snapshot from one Scryfall bulk source. The active generation is the published snapshot used for current catalog lookups.
_Avoid_: Inventory version, search session

**Inventory**:
An account's ledger of owned physical MTG cards, represented by grouped inventory entries.
_Avoid_: Collection as a separate domain object, deck

**Inventory group**:
A named selection of inventory entries within one inventory. An entry can belong to multiple groups, and all its copies share that membership.
_Avoid_: Deck, physical location, scan batch, owned quantity

**Group membership**:
An association between an inventory entry and an inventory group, without changing ownership.
_Avoid_: Deck entry, copy allocation, physical reservation

**Inventory entry**:
A quantity of one printing with one finish and condition in an account's inventory. It represents interchangeable copies rather than individually identified physical cards.
_Avoid_: Printing, physical copy

**Reference price**:
A source's dated market measure for a printing and finish in a stated currency. It is an estimate reference, not the owner's purchase cost or a guaranteed sale amount.
_Avoid_: Acquisition cost, sale proceeds, exact condition price

**Acquisition cost**:
The known amount an owner spent to acquire a quantity of cards, including the purchase fees assigned to it. An unknown acquisition cost is different from a known zero cost.
_Avoid_: Reference price, current market value

**Cost batch**:
An acquisition amount associated with specified card quantities from a pack, bulk or other shared acquisition. It is separate from the quantities currently held in inventory.
_Avoid_: Inventory group, sale, market value

**Acquisition lot**:
A quantity acquired together with a shared cost status and acquisition date when known. It distinguishes remaining and removed quantities without identifying individual physical copies.
_Avoid_: Inventory group, physical location, physical-copy identifier

**Physical copy**:
One physical MTG card, potentially sharing its printing, finish, and condition with other copies. Individual copy identifiers are not part of the current inventory model.
_Avoid_: Inventory entry, printing

**Finish**:
An inventory entry's recorded surface treatment, currently `nonfoil` or `foil`.
_Avoid_: Printing, condition

**Condition**:
An inventory entry's recorded physical grade, one of `NM`, `LP`, `MP`, `HP`, or `DMG`.
_Avoid_: Finish, availability

**Display position**:
An inventory entry's stored ordering value, named `spellbookPosition` in code. It is not a physical binder, box, or tray location.
_Avoid_: Physical location, copy identifier

**Deck**:
An account-owned named decklist with a format, description, and deck entries. It expresses card requirements without establishing ownership or physical assignment.
_Avoid_: Inventory, assembled physical deck

**Deck entry**:
A required quantity of one printing in one deck role.
_Avoid_: Owned card, inventory entry

**Deck role**:
A deck entry's section, one of `main`, `sideboard`, `commander`, or `companion`.
_Avoid_: Physical location, card type

**Deck entry category**:
A deck-owned primary grouping of entries by purpose. Each entry has at most one category, shared by all its copies; Uncategorized means unassigned.
_Avoid_: Deck category, deck role, inventory group, secondary tag

**Deck category**:
An account-owned grouping of whole decks by strategy, archetype or another user-defined meaning. It is separate from the categories of cards within a deck.
_Avoid_: Deck entry category, deck role, format

**Category definition**:
An account-owned reusable name, meaning and classification rules for either Deck entries or whole Decks. Its scope is explicit; deck-local categories and assignments remain separate from the definition.
_Avoid_: Deck entry category, Deck category assignment, catalog tag

**Deck availability**:
A comparison of one deck's required quantities with its owner's inventory, allocating exact printing matches before alternate printings.
_Avoid_: Legality, physical reservation

**Exact printing match**:
An owned copy whose printing identifier matches the printing required by a deck entry.
_Avoid_: Same name, same canonical card

**Alternate printing**:
A printing with the same canonical card identifier as the requested printing but a different printing identifier.
_Avoid_: Similar card, substitute card

**Missing quantity**:
The required quantity left after allocating eligible owned copies across the entries of one deck.
_Avoid_: Not legal, unowned printing

**Import preview**:
The parsed and resolved interpretation of submitted import text before commitment, retaining ambiguous, unresolved, and malformed lines for review.
_Avoid_: Saved deck, completed import

**Scan session**:
An account-owned grouping of scan artifacts and their review lifecycle.
_Avoid_: Physical sorting job, ownership record

**Scan artifact**:
A stored scan record linking an uploaded image to recognition metadata and candidates within a scan session.
_Avoid_: Physical copy, inventory entry

**Recognition candidate**:
A proposed printing match for a captured card, with optional evidence such as a score or recognized text. It is not confirmation of ownership or physical placement.
_Avoid_: Confirmed import, physical copy identifier

**Scan review item**:
A reviewed printing selection associated with a scan artifact, including quantity, finish, and condition.
_Avoid_: Recognition candidate, inventory entry

**Confirmed import**:
Explicit acceptance of reviewed scan selections for addition to owned inventory. This confirmation does not establish a physical location.
_Avoid_: Recognition result, deck import, output placement

**Output placement**:
The observed arrival of a physical card at a sorter destination, established through sensor evidence or operator reconciliation. This proposed workflow has no persisted placement record in the current application.
_Avoid_: Movement command, confirmed import

**Deck assembly**:
The proposed physical selection of required cards from the stack fed into a device for one fixed decklist. It does not imply retrieval from other storage or AI deck recommendations.
_Avoid_: Deck editing, deck availability
