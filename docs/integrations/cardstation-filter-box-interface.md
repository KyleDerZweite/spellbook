# Cardstation filter and physical Box label interface

- Status: Physical Box preview interface implemented; quantity allocation and online sorting
  proposed
- Last Reviewed: 2026-11-24
- Source of Truth: accepted Cardstation modes in
  [ADR-0030](../decisions/0030-cardstation-physical-storage.md), current Inventory group behavior,
  [OpenAPI](../../contracts/openapi.json), and the accepted preview scope in
  [Spellbook #197](https://github.com/KyleDerZweite/spellbook/issues/197)
- Update Triggers:
  - Offline filter editor and actual output-slot count
  - Physical Box registration, quantity allocation and authorization
  - Sort rule and device-slot binding, versioning and conflict handling
  - QR identity payload, printable label and camera/sensor evidence
  - Deferred UI/API implementation decisions
- Related Docs:
  - [Sorter integration](./card-robot.md)
  - [Inventory groups](../product/card-grouping.md)
  - [Product specification](../product/specification.md)
  - [Domain glossary](../../GLOSSARY.md)
  - [QR Auth](../architecture/auth.md)
  - [Cardstation ADR-0001](https://github.com/KyleDerZweite/spellbook-cardstation/blob/main/docs/adr/0001-offline-first-operating-modes.md)

Spellbook owns the account's Physical Box registry and printable labels for Cardstation preview.
Cardstation owns the local offline editor, slot confirmation and preview. Quantity allocation and
online sorting are deferred.

## Current UI and strict separation

| User-facing concept                    | Currently available                                              | Proposed later responsibility                                       |
| -------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Boxes** in Inventory                 | Virtual, overlapping groups of whole entries                     | Keep unchanged and separately named                                 |
| **Physical Boxes** / storage locations | Account-owned registry, sort conditions and SVG labels           | Quantity allocation and reconciliation                              |
| **Sort filters**                       | Inventory/Catalog search filters exist, but are query predicates | Device-executable rule snapshots with explicit slot mapping         |
| **QR sign-in**                         | Short-lived, one-use credential for authentication               | Never reuse as physical Box identification                          |
| **Scan review**                        | Authenticated upload, result and explicit new-inventory commit   | Reuse review concepts for new-only intake, not as location transfer |

The Inventory `?view=groups` query, Group IDs, multi-memberships and existing Box CRUD **must not**
change meaning. A proposed UI may eventually link a group to a physical Box for navigation, but that
link does not allocate copies or make the group's apparent count a physical count.

## Phase 1: local offline filter editor

The Cardstation's local UI starts with one deterministic, network-independent sorting workflow.
Spellbook's later filter editor must emit the **same versioned data-only JSON DSL** defined by
[the canonical Sort Rule v1](https://github.com/KyleDerZweite/spellbook/pull/352) in
`contracts/schemas/cardstation-sort-rule.v1.schema.json`. The
[Cardstation Python interpreter](https://github.com/KyleDerZweite/spellbook-cardstation/pull/31)
consumes identical fixtures and never needs Spellbook for an offline job.

1. Select **Offline sorting** without Account login.
2. Choose only fields the installed local Recognition can reliably return. `printedColor` is a
   proposed first feature, not Commander color identity.
3. Map ordered predicates to actual numbered output slots 1 through 8. Reserve an accessible
   Reject/Fallback slot among those eight; no ninth slot exists.
4. Preview first-match priority and AND conditions. Missing or unreliable observations always use
   Reject, even when some other fields are known.
5. Validate the full rule and machine capabilities, then freeze a snapshot for the run. Editing a
   preset cannot change a running machine job.
6. Save only presets and hardware configuration locally, never images, recognized cards, run history
   or Account data.

The canonical v1 example is:

```json
{
  "dsl": "spellbook.cardstation.sort",
  "version": 1,
  "name": "Printed color",
  "rules": [
    { "when": [{ "field": "printedColor", "oneOf": ["white"] }], "slot": 1 },
    { "when": [{ "field": "printedColor", "oneOf": ["blue"] }], "slot": 2 }
  ],
  "fallbackSlot": 8
}
```

The DSL also defines `rarity` and `setCode` for future compatible editors, but device capability
validation must prevent using unsupported classifier output. Unknown fields, unsupported versions
and arbitrary executable code are rejected. Neither a preview nor a JSON match proves that a
physical output occurred. This shared configuration format is **not yet** an authenticated API, an
editor UI, a physical Box assignment or an Inventory operation.

## Physical Box registry for preview

In **Settings > Physical Boxes**, an account owner can list and create Boxes, rename them, set or
clear their sort conditions, and download printable SVG labels. Spellbook assigns an immutable UUID
on creation and trims the name to 1 to 64 characters. A Box belongs to one account. Its identity is
independent of the sort condition and the Cardstation slot.

`GET /api/v1/mtg/physical-boxes/{boxId}` returns:

```json
{
  "id": "6f107d8b-8f65-4f4e-9834-70b5d4b86612",
  "name": "Blue cards",
  "condition": [{ "field": "printedColor", "oneOf": ["blue"] }]
}
```

`condition` is `null` when unset. A condition uses one to three
[Sort Rule v1 predicates](./cardstation-sort-rule-v1.md#document). Fields are unique and joined with
AND. Each predicate matches any of its `oneOf` values. The Box condition ends at the predicate list.
Cardstation resolves each label with its linked bearer session, confirms the slot with the operator
and adds an explicit Reject destination. Conflicts require explicit ordering or a revised mapping
before preview.

The lookup accepts same-account sessions, including linked device bearer sessions. Missing and
foreign UUIDs receive the same 404. An account owner's session can also list Boxes with
`GET /api/v1/mtg/physical-boxes`, create one with `POST` and `{ "name": "Blue cards" }`, and update
it with `PATCH /api/v1/mtg/physical-boxes/{boxId}`. PATCH accepts `name`, `condition`, or both. An
explicit `null` clears the condition and omitted fields retain their values. Registry responses use
`Cache-Control: private, no-store`.

### QR payload

The printable SVG encodes exactly `sbx:1:<canonical lowercase uuid>`, for example:

```text
sbx:1:6f107d8b-8f65-4f4e-9834-70b5d4b86612
```

Renaming a Box or changing its condition leaves the QR payload unchanged. The label carries the
format version and Box ID only. It grants no access and provides no evidence of physical presence,
capacity, contents or placement. Authentication uses the separate linked-device session flow.

### Future quantity allocation

Inventory entries already own Printing, Finish and Condition; allocation should reference that
identity rather than invent individual Physical Copy IDs. For each Inventory entry, the future
invariant is:

```text
owned_quantity = unallocated_quantity + sum(allocated_quantity_by_physical_box)
```

A transfer from a known source to a known destination preserves `owned_quantity`. If the source is
unknown, the system asks for clarification or uses an explicitly reconciled unallocated source; it
must not quietly subtract from an arbitrary Box. Box candidate matching around 90% is only a
**prompt** and must consider partial stacks and competing Boxes.

## Screen states and acceptance

| Screen                       | Draft / success                                                 | Uncertain / blocked behavior                                                      |
| ---------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Offline rule editor          | Dirty draft, preview, validated snapshot, running read-only     | Unknown classifier value routes to configured fallback; missing slot blocks Start |
| Physical Box directory       | Create, rename, set or clear condition, and print an SVG label  | Account mismatch denied without revealing metadata                                |
| Physical Box detail (future) | Recorded quantity and last reconciled observation               | Show stale, unknown or unresolved counts separately                               |
| Job setup (future)           | Select existing box IDs and saved preset, inspect rule snapshot | Missing/ambiguous QR or moved Box requires operator attention                     |
| Completion/review (future)   | Explicit confirmed relocation and unchanged Inventory total     | Jam, duplicate event, uncertain source or output cannot commit silently           |

The Spellbook registry has English and German UI. Cardstation preview uses its local UI for slot
confirmation and rules.

## Delivery boundary

- **Now:** Cardstation local offline rule/slot draft and physical sorting, owned by
  [Cardstation #26](https://github.com/KyleDerZweite/spellbook-cardstation/issues/26) and
  [local web issue #5](https://github.com/KyleDerZweite/spellbook-cardstation/issues/5).
- **Later:** New-card intake under
  [Cardstation #27](https://github.com/KyleDerZweite/spellbook-cardstation/issues/27).
- **Preview:** Physical Box registry, conditions, labels and account-scoped lookup under
  [Spellbook #197](https://github.com/KyleDerZweite/spellbook/issues/197). Preview does not actuate,
  allocate stock or transfer Inventory.
- **Later:** Per-Box quantities and online relocation under
  [Cardstation #28](https://github.com/KyleDerZweite/spellbook-cardstation/issues/28) and existing
  Spellbook issues [#196](https://github.com/KyleDerZweite/spellbook/issues/196),
  [#199](https://github.com/KyleDerZweite/spellbook/issues/199),
  [#200](https://github.com/KyleDerZweite/spellbook/issues/200) and
  [#201](https://github.com/KyleDerZweite/spellbook/issues/201).
