# Deck format legality rules (`deck-rules` v1)

- Status: Canonical
- Last Reviewed: 2026-11-26
- Source of Truth: `backend/core/src/spellbook_core/mtg/decks/rules.py`, `contracts/src/legality.ts`
- Update Triggers:
  - Supported format list or deck size/copy limits
  - Commander color-identity, eligibility or 2-commander pairing checks
  - Legality warning codes or non-blocking presentation policy
- Related Docs:
  - [Product docs](./README.md)
  - [Product specification](./specification.md)
  - [Domain model](../../GLOSSARY.md)
  - [Application contract](../architecture/application-contract.md)

> **TL;DR**
>
> - Specification version: `deck-rules` **v1** (`DECK_RULES_VERSION = "v1"`).
> - Validation is **strictly non-blocking**: users can always build, save, import, print, and export
>   any deck.
> - Violations surface as advisory `"Not legal in <Format>"` warnings in the Deckbuilder, import
>   preview, and export confirmation dialog.
> - Spellbook does not run a full Magic: The Gathering rules engine.

## Non-blocking principle

Deck legality validation never blocks saving, importing, printing, or exporting a deck. Official
WotC preconstructed decks (for example, precons printed with two copies of Mossfire Valley),
house-rule Commander tables, and work-in-progress drafts must remain usable without hard errors.

When one or more warnings apply:

- The Deckbuilder displays a prominent `"Not legal in <Format> (<N>)"` badge linked to the expanded
  format checks section.
- Import previews expand format warnings without disabling deck creation or card addition.
- Export actions open a non-blocking warning dialog listing active warnings with a direct
  `"Export anyway"` download action. Non-JavaScript fallback export links remain directly usable.

## Supported formats (`v1`)

Format names are trimmed and matched case-insensitively.

| Format      | Category    | Main deck size          | Sideboard + Companion | Default copy limit  | Commander rules |
| ----------- | ----------- | ----------------------- | --------------------- | ------------------- | --------------- |
| `Standard`  | Constructed | At least 60             | At most 15            | 4                   | No              |
| `Pioneer`   | Constructed | At least 60             | At most 15            | 4                   | No              |
| `Modern`    | Constructed | At least 60             | At most 15            | 4                   | No              |
| `Legacy`    | Constructed | At least 60             | At most 15            | 4                   | No              |
| `Vintage`   | Constructed | At least 60             | At most 15            | 4 (1 if restricted) | No              |
| `Pauper`    | Constructed | At least 60             | At most 15            | 4                   | No              |
| `Commander` | Commander   | Main + Commander == 100 | Not counted in 100    | 1 (singleton)       | Yes             |

Other or custom format labels (such as `Casual`, `Draft`, or `Brawl`) skip constructed and Commander
size/copy rules, while still reporting `format_illegal` if Scryfall supplies a legality entry for
that normalized format name.

## Rules and warning codes (`v1`)

All card identity grouping uses `CardDocument.oracle_id` with fallback to lowercase `name`. Entries
with role `maybeboard` are ignored by all rules.

### Constructed size rules

- `main_under_60`: Triggered in Constructed formats when the sum of `main` quantities is below 60.
- `sideboard_over_15`: Triggered in Constructed formats when the sum of `sideboard` and `companion`
  quantities exceeds 15.

### Copy-limit rules

Checked across `main`, `sideboard`, and `companion` in Constructed formats, and across `main` and
`commander` in Commander.

Exemptions and overrides:

- **Basic lands** (`"Basic"` in `type_line` or lowercase name in `plains`, `island`, `swamp`,
  `mountain`, `forest`, `wastes`): exempt from copy limits.
- **Unlimited text** (`"deck can have any number of cards named"` in `oracle_text`,
  case-insensitive): exempt from copy limits.
- **Numbered text** (`"deck can have up to (seven|nine) cards named"` in `oracle_text`,
  case-insensitive): raises the copy limit to 7 or 9 respectively.
- **Restricted cards** (`legalities[format] == "restricted"`, e.g. Vintage): lowers the copy limit
  to 1.

Warning codes:

- `restricted_copies`: Quantity exceeds the limit for a restricted card.
- `commander_singleton`: Quantity exceeds the limit in Commander.
- `too_many_copies`: Quantity exceeds the limit in a Constructed format.

### Catalog format legality

- `format_illegal`: Triggered once per canonical card (excluding `maybeboard`) when the format name
  is non-empty and `card.legalities[format]` is present and neither `"legal"` nor `"restricted"`
  (for example `"banned"` or `"not_legal"`).

### Commander rules

Applied when the normalized format is `commander`:

- `commander_size`: Sum of `main` and `commander` quantities is not equal to 100.
- `commander_count`: Total `commander` quantity is not 1 or 2.
- `commander_ineligible`: Triggered once per canonical card in the `commander` role that is neither:
  - A Legendary Creature on its front face (portion of `type_line` before `//`),
  - A card whose `oracle_text` states `"can be your commander"` (case-insensitive), nor
  - A Legendary Background paired with a commander that has `"Choose a Background"` in a valid
    2-commander pair.
- `commander_invalid_pairing`: Triggered when total `commander` quantity is 2 and the two commanders
  are either the same canonical card or do not form a recognized 2-commander pairing:
  - **Partner**: Both commanders have generic `Partner` (excluding `"Partner with ..."` and
    `"Partner—<Variant>"` mechanics).
  - **Partner with \<Name\>**: Each commander names the other's full name or front-face name in
    `"Partner with <Name>"`.
  - **Friends forever**: Both commanders have `"Friends forever"`.
  - **Choose a Background**: One commander has `"Choose a Background"` and the other is a Legendary
    Background on its front face.
  - **Doctor's companion**: One commander has `"Doctor's companion"` and the other is a Legendary
    Time Lord Doctor creature on its front face.
- `commander_color_identity`: Triggered when at least one commander is present and a non-commander,
  non-maybeboard card has any color in `CardDocument.color_identity` outside the union of the chosen
  commanders' `color_identity` values. When no commander is chosen yet, this check is skipped so
  drafts are not flooded with color warnings.

## Known out-of-scope rules (`v1`)

`deck-rules` v1 intentionally omits full rules-engine validation, including:

- Companion deckbuilding restrictions (e.g. Lurrus, Yorion, Kaheera).
- Card-specific commander rules not expressed as `"can be your commander"` (e.g. Grist, the Hunger
  Tide).
- Variant partner keywords beyond the five pairings listed above (such as
  `"Partner—Character select"` or `"Partner—Survivors"`).
