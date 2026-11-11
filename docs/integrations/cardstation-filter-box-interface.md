# Cardstation filter and physical Box label interface

- Status: Proposed interface; no implemented Box registry, label generator or device API
- Last Reviewed: 2026-11-11
- Source of Truth: accepted Cardstation modes in
  [ADR-0030](../decisions/0030-cardstation-physical-storage.md), current Inventory group
  behavior, current Scan/Auth contracts and open integration issues
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

This document prepares the interface and proposed data shapes. It does **not** select a persistent
Box schema, commit an API endpoint or start online functionality. The local offline filter
interface belongs to the Cardstation repository. Spellbook's future website/Android screens own
authenticated physical Box management.

## Current UI and strict separation

| User-facing concept | Currently available | Proposed later responsibility |
| --- | --- | --- |
| **Boxes** in Inventory | Virtual, overlapping groups of whole entries | Keep unchanged and separately named |
| **Physical Boxes** / storage locations | Not implemented | Authorized Box register, quantity allocations and label printing |
| **Sort filters** | Inventory/Catalog search filters exist, but are query predicates | Device-executable rule snapshots with explicit slot mapping |
| **QR sign-in** | Short-lived, one-use credential for authentication | Never reuse as physical Box identification |
| **Scan review** | Authenticated upload, result and explicit new-inventory commit | Reuse review concepts for new-only intake, not as location transfer |

The Inventory `?view=groups` query, Group IDs, multi-memberships and existing Box CRUD **must not**
change meaning. A proposed UI may eventually link a group to a physical Box for navigation, but
that link does not allocate copies or make the group's apparent count a physical count.

## Phase 1: local offline filter editor

The Cardstation's local UI starts with one deterministic, network-independent sorting
workflow. Spellbook's later filter editor must emit the **same versioned data-only
JSON DSL** defined by
[the canonical Sort Rule v1](https://github.com/KyleDerZweite/spellbook/pull/352)
in `contracts/schemas/cardstation-sort-rule.v1.schema.json`. The
[Cardstation Python interpreter](https://github.com/KyleDerZweite/spellbook-cardstation/pull/31)
consumes identical fixtures and never needs Spellbook for an offline job.

1. Select **Offline sorting** without Account login.
2. Choose only fields the installed local Recognition can reliably return.
   `printedColor` is a proposed first feature, not Commander color identity.
3. Map ordered predicates to actual numbered output slots 1 through 8. Reserve
   an accessible Reject/Fallback slot among those eight; no ninth slot exists.
4. Preview first-match priority and AND conditions. Missing or unreliable observations
   always use Reject, even when some other fields are known.
5. Validate the full rule and machine capabilities, then freeze a snapshot for the
   run. Editing a preset cannot change a running machine job.
6. Save only presets and hardware configuration locally, never images, recognized
   cards, run history or Account data.

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

The DSL also defines `rarity` and `setCode` for future compatible editors,
but device capability validation must prevent using unsupported classifier output.
Unknown fields, unsupported versions and arbitrary executable code are rejected.
Neither a preview nor a JSON match proves that a physical output occurred.
This shared configuration format is **not yet** an authenticated API, an editor UI,
a physical Box assignment or an Inventory operation.

## Later: authenticated physical Box management

A separate **Physical Boxes** area in Spellbook could provide:

1. Create a Box with human-readable name and optional note. Spellbook creates an immutable,
   account-scoped Box ID. Nothing is added to owned Inventory or allocated on creation.
2. View and print a label with the Box name, short human-readable identifier and QR.
3. Scan the QR from the signed-in website/phone client to open that physical Box **after** Account
   authorization. A QR must not select or reveal another Account's Box.
4. Edit the displayed name without changing the QR identity. Retire/replace a damaged label after
   authorization. Reprinting the same identity does not create another Box.
5. Show **recorded** quantities, `unallocated / location unknown`, and unresolved reconciliation.
   Never imply that a QR scan proves the Box is present, not full or contains the recorded cards.

A Box has a **stable identity**; a device slot is a **temporary placement**. A sorting rule is a
**job/preset binding**, not part of the Box identity. This avoids reprinting Box labels whenever
filters change and prevents a virtual Inventory group from becoming a location by accident.

### Proposed QR contract, not yet accepted

A candidate short text payload is `sbx:1:<lowercase-uuid>`, for example:

```text
sbx:1:6f107d8b-8f65-4f4e-9834-70b5d4b86612
```

Version and Box ID are public identifiers, **not credentials**. Do not encode Account IDs,
authentication tokens, collection contents, a filter expression or a mutable slot number. Parsing
must reject unknown versions, invalid UUIDs, unexpected fields and URL redirects. A copied QR
must not authorize a read or write. Server-side Actor checks are mandatory when Box APIs exist.

An Account-origin URL embedded in the label may be convenient, but a non-host-specific marker
supports self-hosting and a local device that cannot resolve web links. Choose the exact QR
namespace, print size, error correction and optional human-readable short code with
[Spellbook #197](https://github.com/KyleDerZweite/spellbook/issues/197).
The existing one-time QR Auth flow is a **different protocol**.

### Future wire/domain shapes for review

These are conceptual names, **not added contracts or routes**:

| Concept | Minimum fields | Invariant |
| --- | --- | --- |
| `PhysicalBox` | `id`, `owner` (from Auth), `name`, `revision` | Identity independent of Group, rule and slot |
| `BoxLabel` | `boxId`, `formatVersion` | No authorization or mutable filter in QR |
| `SortRulePreset` | `id`, `revision`, `rule: CardstationSortRuleV1` | A job freezes the validated DSL document |
| `SlotBinding` | `jobId`, `slot`, optional `boxId`, `observationVersion` | Binding is not proof that a card arrived |
| `QuantityAllocation` | `entryId`, `boxId` or unknown location, `quantity` | Sum across locations never exceeds owned quantity |
| `Relocation` | Request/event IDs, source, destination, observed quantities, outcome | One authorized, atomic and idempotent effect |

Inventory entries already own Printing, Finish and Condition; allocation should reference that
identity rather than invent individual Physical Copy IDs. For each Inventory entry, the future
invariant is:

```text
owned_quantity = unallocated_quantity + sum(allocated_quantity_by_physical_box)
```

A transfer from a known source to a known destination preserves `owned_quantity`. If the source
is unknown, the system asks for clarification or uses an explicitly reconciled unallocated source;
it must not quietly subtract from an arbitrary Box. Box candidate matching around 90% is only a
**prompt** and must consider partial stacks and competing Boxes.

## Screen states and acceptance

| Screen | Draft / success | Uncertain / blocked behavior |
| --- | --- | --- |
| Offline rule editor | Dirty draft, preview, validated snapshot, running read-only | Unknown classifier value routes to configured fallback; missing slot blocks Start |
| Physical Box directory (future) | Create, rename, print/reprint, archived label | Account mismatch denied without revealing metadata |
| Physical Box detail (future) | Recorded quantity and last reconciled observation | Show stale, unknown or unresolved counts separately |
| Job setup (future) | Select existing box IDs and saved preset, inspect rule snapshot | Missing/ambiguous QR or moved Box requires operator attention |
| Completion/review (future) | Explicit confirmed relocation and unchanged Inventory total | Jam, duplicate event, uncertain source or output cannot commit silently |

The future Box UI should use the existing site's dialog, list, action and localization patterns.
Actual implementation will require English/German strings, keyboard/focus checks, mobile layout,
and authorized API tests. The Cardstation's local web UI has its own device-state semantics.
Avoid implementing one interface that pretends to manage both the independent device and
Spellbook Account state.

## Delivery boundary

- **Now:** Cardstation local offline rule/slot draft and physical sorting, owned by
  [Cardstation #26](https://github.com/KyleDerZweite/spellbook-cardstation/issues/26) and
  [local web issue #5](https://github.com/KyleDerZweite/spellbook-cardstation/issues/5).
- **Later:** New-card intake under
  [Cardstation #27](https://github.com/KyleDerZweite/spellbook-cardstation/issues/27).
- **Later:** Authenticated physical Box management, QR labels, per-Box quantities and online
  relocation under [Cardstation #28](https://github.com/KyleDerZweite/spellbook-cardstation/issues/28)
  and existing Spellbook issues
  [#196](https://github.com/KyleDerZweite/spellbook/issues/196),
  [#197](https://github.com/KyleDerZweite/spellbook/issues/197),
  [#199](https://github.com/KyleDerZweite/spellbook/issues/199),
  [#200](https://github.com/KyleDerZweite/spellbook/issues/200) and
  [#201](https://github.com/KyleDerZweite/spellbook/issues/201).
