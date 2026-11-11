# ADR-0030: Cardstation modes and physical storage are separate from Inventory Boxes

- Status: Accepted
- Date: 2026-11-11
- Owners: Kyle
- Source of Truth: Kyle's Cardstation mode and quantity decisions of 2026-11-11;
  [Cardstation ADR-0001](https://github.com/KyleDerZweite/spellbook-cardstation/blob/main/docs/adr/0001-offline-first-operating-modes.md)
- Related Docs:
  - [Product specification](../product/specification.md)
  - [Inventory group contract](../product/card-grouping.md)
  - [Sorter integration](../integrations/card-robot.md)
  - [Filter and label interface proposal](../integrations/cardstation-filter-box-interface.md)
  - [Domain glossary](../../GLOSSARY.md)

## Context

The implemented Inventory screen calls editable, overlapping groups of complete Inventory entries
"Boxes". Their memberships have no location, quantity allocation, placement evidence, or uniquely
identified physical copy. Counting one entry in two groups must not count it as two owned copies.

A physical sorter can encounter the same card again. Exact Printing recognition, identical photo
hashes, and similarity to a stored Box are not reliable proof of individual physical identity.
The current Scan API commits newly owned quantities after review, but cannot track a physical
source or destination.

## Decision

1. The Cardstation has three distinct workflows:
   - **Offline sorting** without Account login, Inventory access or persisted card-level results.
     Arbitrary mixed stacks are accepted. This is the **only current delivery target**.
   - **Inventory intake** for explicitly declared new physical cards, with authentication and
     explicit reviewed new-ownership mutations. This is deferred.
   - **Online sorting** of already owned physical cards with authentication, physical quantity
     relocation and **no increase in ownership**. Arbitrary mixed stacks are accepted. This is
     deferred.
2. Existing **Inventory groups ("Boxes") remain virtual views** with whole-entry, overlapping
   membership. No automatic conversion to a physical location and no one-to-one mapping.
3. Future **Physical boxes** have an identity independent of both Inventory group and device slot.
   The chosen storage model is **quantity allocations per physical box**, not persistent IDs for
   individual physical copies. Allocation is by an existing Inventory entry's Printing, Finish and
   Condition identity. Unallocated or location-unknown quantities must remain representable.
4. A relocation must never silently change the owner's total quantity. A movement command, a
   Recognition candidate or a QR observation alone is not placement proof. Source quantities and
   destination quantities change only under an accepted, replay-safe, authorized reconciliation.
5. If a scanned stack resembles an existing physical box by about **90%**, the device may ask
   whether the operator fed that box. The threshold is an experiment, not a verified identity rule.
   A subset of a larger box can have perfect one-way coverage. Automatic source assignment and
   automatic ownership additions are prohibited.
6. Spellbook owns durable Account, Inventory, physical Box and transfer state once implemented.
   Cardstation owns camera, local recognition, job rules, slot mapping, physical commands and
   observation. **No backend, storage or UI feature is declared implemented by this decision.**

## Consequences

- A physical Box label or QR must not be confused with the existing Inventory group name or the
  current one-time QR authentication flow.
- A local offline filter preset is **device configuration**, not an Inventory search or a physical
  inventory claim. Saved configuration does not violate the no-persisted-card-results rule.
- In a future physical allocation model, the sum of allocations for an Inventory entry cannot
  exceed the owned quantity. Location-unknown amounts require an explicit reconciliation route.
  Transfers must reject negative sources, account-crossing access, stale state and conflicting
  retries.
- An Account may have many physical Boxes and many unrelated virtual Inventory groups. If the UI
  offers optional cross-links later, they are references only and cannot synchronize overlapping
  memberships as physical counts.
- QR payload structure, printing layout, slot sensors, rule overlap precedence and the exact
  API/authorization contract remain **proposals**. The interface proposal documents them without
  claiming their acceptance.

## Follow-up

- [Cardstation #26](https://github.com/KyleDerZweite/spellbook-cardstation/issues/26):
  deliver offline sorting and a local filter/slot interface first.
- [Cardstation #27](https://github.com/KyleDerZweite/spellbook-cardstation/issues/27):
  later new-only intake, using the existing reviewed Scan semantics where applicable.
- [Cardstation #28](https://github.com/KyleDerZweite/spellbook-cardstation/issues/28):
  later physical relocation and source suggestions.
- [Spellbook #195](https://github.com/KyleDerZweite/spellbook/issues/195),
  [#196](https://github.com/KyleDerZweite/spellbook/issues/196),
  [#197](https://github.com/KyleDerZweite/spellbook/issues/197),
  [#199](https://github.com/KyleDerZweite/spellbook/issues/199),
  [#200](https://github.com/KyleDerZweite/spellbook/issues/200) and
  [#201](https://github.com/KyleDerZweite/spellbook/issues/201)
  remain the existing decision/workflow owners. No duplicate implementation epic is needed.
