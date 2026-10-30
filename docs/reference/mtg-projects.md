# MTG project references

- Status: Optional external references, non-authoritative
- Last Reviewed: 2026-10-30
- Source of Truth: linked upstream descriptions for claims about those projects only
- Update Triggers: reference reassessment, upstream capability changes, accepted product direction, reference authority clarification
- Related Docs: [Reference index](./README.md), [Product specification](../product/specification.md), [Scanner platform evaluation](../integrations/scanner-platform-evaluation.md), [Card robot proposal](../integrations/card-robot.md), [Value tracking](../product/value-tracking.md)

These references were supplied by Kyle and assessed on 2026-10-30 from upstream descriptions.
These are independent external projects that may provide examples for specific questions.
They have no authority over Spellbook's product direction, priorities, architecture or acceptance criteria.
Spellbook's accepted requirements and decisions remain authoritative; external examples must be assessed against them.
Inclusion here creates no priority, planned investigation, feature commitment or integration decision.
Applications were not installed or exercised, and source implementations were not audited.
Keep this cross-topic shortlist here; record any later accepted requirements in the existing product or integration owner linked above.

## Optional references by focus

| Reference and evidence | Possible focus question | Evidence limits |
| --- | --- | --- |
| [MtgDesktopCompanion](https://github.com/nicho92/MtgDesktopCompanion#readme) describes collection management with foil, etched and condition support, deck import/export, multiple price providers and provider plugins. | Compare bulk Inventory editing, import/export and provider responsibilities with Spellbook's existing contracts. | Its Java desktop and embedded-server architecture does not establish a suitable architecture for Spellbook. |
| [Mtgdb](https://github.com/NikolayXHD/Mtgdb#readme) describes collection-scoped search, similar-card search by text or generated mana, query completion, deck interchange and configurable diagrams. | Study search scope, query assistance and the transition between search results and Deck editing. | Lucene syntax and WinForms controls are implementation choices, not adoption recommendations. |
| [CardCastle](https://cardcastle.co/) advertises smartphone scanning, multiple cards per scan, printing/condition editing, tags, import/export and collection value history. | Compare the scan-to-Inventory correction flow and mobile/web responsibilities. | Advertised capabilities do not verify recognition accuracy, local processing, offline support or API access. |
| [CardBot for Players](https://cardcastle.co/cardbot-players) advertises automated scanning and attribute-based sorting, smartphone control and upload to a CardCastle account, with access through local stores. | Compare batch setup, physical sorting criteria and account handoff with the card robot proposal. | Vendor capacity claims are not measured throughput or evidence of reproducible hardware, open protocols or a supported Spellbook integration. |
| [macaco](https://github.com/shagu/macaco#readme) describes one file per card, folder-based organization, manual set/number entry, Scryfall image downloads and Delver Lens backup import. | Inspect the import experience and portable collection representation when interoperability work is scheduled. | Delver Lens import is the relevant scanner connection; the README does not establish an independent recognition engine. Do not replace Spellbook's Inventory model with filesystem storage on this evidence. |
| [Best-MTG-Deck](https://github.com/ElLorans/Best-MTG-Deck#readme) describes a Flask app that estimates spending needed for tier decks after accounting for cards already owned. | Study the user question of which decks need the fewest additional purchases. | Missing-card purchase estimates differ from existing collection valuation; current deck feeds, prices, matching correctness and hosted-service availability were not verified. |

## Unresolved video

[YouTube reference supplied by Kyle](https://www.youtube.com/watch?v=SqBN7t81pk0) remains unclassified.
The page fetch failed and an exact video-ID search returned no results on the review date.
No title, transcript or content was verified, so this reference supports no technical or product claim yet.
Retain the original URL for a later manual viewing.

## Follow-up scope

Consult a reference only when its focus question is relevant to work already justified by Spellbook's own goals.
The order and inclusion of entries imply no ranking or delivery priority.
Any proposed change derived from an example needs its own rationale against the existing project contracts and an explicit acceptance decision before it changes direction.
Before adopting code or an integration, inspect the specific implementation, license, maintenance state and supported data contract.
No new dependency, ticket, feature commitment or architecture decision follows from this shortlist.
