# Cardstation sort-rule DSL v1

- Status: Proposed contract for offline phase 1; runtime integration is not implemented
- Last Reviewed: 2026-11-11
- Source of Truth: [JSON Schema](../../contracts/schemas/cardstation-sort-rule.v1.schema.json),
  [cross-language fixtures](../../contracts/fixtures/cardstation-sort-rule.v1.json)
- Update Triggers:
  - Cardstation recognition fields, output-slot hardware, filter-editor behavior or account integration
- Related Docs:
  - [Card robot](./card-robot.md)
  - [Inventory Groups](../product/card-grouping.md)
  - [Cardstation boundaries](https://github.com/KyleDerZweite/spellbook-cardstation/blob/main/docs/project-boundaries.md)

The filter editor in Spellbook and the Cardstation's local offline editor must emit the
**same versioned JSON document**, not two independently interpreted UI configurations.
Spellbook owns the canonical schema and TypeScript validator. Cardstation vendors an
unchanged schema/fixture snapshot and owns its standard-library Python interpreter.
Both sides test the exact same input/output vectors. A rule document is device
configuration, not an Inventory query, a persistent scan record or a physical Box.

## Document

```json
{
  "dsl": "spellbook.cardstation.sort",
  "version": 1,
  "name": "Color demo",
  "rules": [
    { "when": [{ "field": "printedColor", "oneOf": ["white"] }], "slot": 1 },
    { "when": [{ "field": "printedColor", "oneOf": ["blue"] }], "slot": 2 }
  ],
  "fallbackSlot": 8
}
```

- A `rule` is an ordered list of conditions. First matching rule wins.
- `when` contains one to three conditions joined with logical AND. A condition
  compares one allowlisted field against a nonempty finite list of allowed values.
- Version 1 allows `printedColor` (white, blue, black, red, green,
  multicolor, colorless), `rarity` (common, uncommon, rare, mythic, special,
  bonus) and lowercase `setCode` (2 to 6 alphanumeric characters).
- `slot` and `fallbackSlot` are physical output positions 1 through 8,
  **not** physical Box IDs. More than one rule may intentionally use the same slot.
- Unknown, missing or unreliable recognition always reaches `fallbackSlot`.
  Cardstation must reserve and verify the fallback position before feeding cards.
- An editor preview is not proof of device support: Cardstation must advertise
  supported observation fields and actual accessible output slots. Starting with
  an unsupported field or blocked slot is refused. The first proof of concept may
  offer only `printedColor` if that classifier is verified locally.
- The editor snapshots and validates the entire rule before starting a job.
  The active job never reads live edits. Only configuration/presets may persist in
  the offline device. Individual image, recognized card and job history must not.

Version 1 has no JavaScript, SQL, regex entered by users, imports, network
callbacks, account identifier, quantity changes or QR payload. Unknown versions,
properties, fields and duplicate conditions for one field are rejected. Future
predicates or routing policies require a contract version and new shared fixtures.

## Ownership and future API

The Spellbook editor may eventually save account-owned presets and send a
validated rule over a future authenticated device-job API. Until that API is
specified, **this DSL defines only the exchanged configuration document**.
Offline Cardstation must not fetch a rule from Spellbook to start.

Virtual Spellbook Boxes remain overlapping Inventory Groups. Physical Boxes are
account-owned storage locations in a later phase, with quantities per physical
Box. A future Box QR label contains a stable Box identifier, never this rule,
credentials or account Inventory data. Label registration, permissions, and
device delivery are separate contracts.

## Synchronizing two repos

1. Update this canonical JSON Schema, TypeScript parser and fixture together.
2. Copy the Schema and fixture byte-for-byte into Cardstation `contracts/`.
3. Run TypeScript fixture tests here and Python fixture tests in Cardstation.
4. Record both repository revisions in the eventual integration PR. A mismatch
   prevents enabling a rule, even if its `version` number happens to match.

These checks prove deterministic parsing and rule execution. They do not prove
recognition reliability, a working physical eject, or an authenticated transfer.
