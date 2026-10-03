# Spellbook domain model

- Status: Canonical
- Last Reviewed: 2026-10-03
- Source of Truth: product specification, schema, catalog contracts
- Update Triggers: changes to card identity, inventory grouping, deck roles, availability semantics, scan review terminology, physical-card workflow requirements
- Related Docs: [Product specification](./specification.md), [Postgres architecture](../architecture/postgres.md), [Catalog architecture](../architecture/catalog.md), [Card scanner and sorter](../integrations/card-robot.md)

Spellbook describes MTG catalog cards, owned cards, and deck requirements. This glossary owns their meanings; the specification owns behavior.

## Language

**Catalog card**:
A Magic: The Gathering card identity shared across its printings, identified by Scryfall's `oracle_id` and stored as `canonicalCardId` in owned entries and deck entries.
_Avoid_: Printing, owned card

**Printing**:
A particular Scryfall catalog record identified by its `id`, stored as `catalogCardId` in owned entries and deck entries. A printing has a set, collector number, and language.
_Avoid_: Catalog card, inventory entry

**Inventory**:
An account's ledger of owned physical MTG cards.
_Avoid_: Collection as a separate domain object, deck

**Inventory entry**:
A quantity of one printing with one finish and condition in an account's inventory. The entry represents interchangeable copies rather than individually serialized physical cards.
_Avoid_: Printing, single physical card

**Physical copy**:
One physical MTG card, which may share its printing, finish, and condition with other copies. The current inventory records grouped quantities rather than a persistent identifier for each copy.
_Avoid_: Inventory entry, printing

**Finish**:
The inventory entry's supported surface treatment, currently `nonfoil` or `foil`.
_Avoid_: Printing, condition

**Condition**:
The inventory entry's recorded physical grade, one of `NM`, `LP`, `MP`, `HP`, or `DMG`.
_Avoid_: Finish, availability

**Spellbook view**:
The binder-style presentation of an inventory using its stored display positions.
_Avoid_: Separate inventory, physical location

**Deck**:
An account-owned named decklist with a format, description, and deck entries. A deck does not establish ownership of its cards.
_Avoid_: Inventory, physical card assignment

**Deck entry**:
A required quantity of one printing in one role within a deck.
_Avoid_: Owned card, inventory entry

**Role**:
A deck entry's section, one of `main`, `sideboard`, `commander`, or `companion`.
_Avoid_: Physical location, card type

**Deck availability**:
The comparison of a deck's required quantities with its owner's inventory, using exact printings first and alternate printings of the same catalog card second.
_Avoid_: Legality, physical reservation

**Exact match**:
An owned copy whose printing identifier matches the deck entry's printing identifier.
_Avoid_: Same name, same catalog card

**Alternate printing**:
An owned printing with the same canonical card identifier as the requested printing but a different printing identifier.
_Avoid_: Similar card, substitute card

**Missing quantity**:
The required quantity left after distributing eligible owned copies across the entries of one deck.
_Avoid_: Not legal, unowned printing

**Import preview**:
The parsed and resolved interpretation of submitted text, including ambiguous, unresolved, and malformed lines, before a user commits it.
_Avoid_: Saved deck, completed import

**Scan review item**:
A reviewed printing selection associated with a scan artifact, including its quantity, finish, and condition. The stored review records the selection used for an explicit inventory commit.
_Avoid_: Owned card, confirmed recognition

**Recognition candidate**:
A proposed printing match for a captured card, with optional evidence such as a score or recognized text. A candidate is neither an ownership record nor confirmation of physical placement.
_Avoid_: Confirmed import, physical copy identifier

**Confirmed import**:
An explicit acceptance of a reviewed card that authorizes its addition to owned inventory. A confirmed import alone does not establish the card's physical location.
_Avoid_: Recognition candidate, output placement

**Output placement**:
The observed arrival of a presented physical card at a sorter destination, established through sensor evidence or operator reconciliation. This proposed physical workflow has no persisted placement record in the current application.
_Avoid_: Movement command, confirmed import

**Deck assembly**:
The proposed physical selection of required cards from the stack fed into a device for one fixed decklist. It does not imply retrieval from other storage or AI deck recommendations.
_Avoid_: Deck editing, deck availability
