# Card and deck categorization

- Status: Oracle Tags publication and starter entry categories implemented; optional local Commander Spellbook adapter selected and planned
- Last Reviewed: 2026-10-08
- Source of Truth: linked primary documentation, local public Scryfall snapshots, recorded Jev HTTP experiment and read-only repository inspection
- Update Triggers: classifier access, model versions and prices, taxonomy coverage, category quality, custom criteria, deck context and selected provider
- Related Docs: [Integrations](./README.md), [Card grouping](../product/card-grouping.md), [Domain glossary](../../GLOSSARY.md), [Catalog](../architecture/catalog.md), [Worker](../architecture/worker.md), [System overview](../architecture/system-overview.md), [Category rules](../architecture/category-rules.md)

This document owns source and classifier research. [Card grouping](../product/card-grouping.md#deck-categories) owns the requested Deck entry and whole-deck category behavior. After the authenticated Jev experiment, the maintainer selected sources and explicit rules for this pass. Jev stays a prototype. Free-text meanings and stronger or hybrid semantic classification are deferred; no production inference provider is selected.

## Existing application and comparable tools

The Worker now publishes Catalog types, keywords and Oracle text plus an independent complete Oracle Tags publication. [Category rules](../architecture/category-rules.md#implemented-starter-entry-decisions) owns the implemented deterministic starter primary selection. The source facts do not establish a deck's strategy or a later account's custom category meaning. Account rules and entry Review/Reset are implemented. Whole-deck evaluation and local combos remain later work. Jev remains a recorded prototype without production inference integration.

[Archidekt's announcement](https://archidekt.com/news/4958603) describes automatic defaults derived from common user assignments within an allowlisted vocabulary. It does not publish its algorithm or dataset. Moxfield's [public repository](https://github.com/moxfield/moxfield-public) and first-party [tag feedback](https://moxfield.nolt.io/617) do not establish a public automatic strategy classifier. These sources do not establish a reproducible classifier for Spellbook.

## Scryfall Oracle Tags

[Scryfall's Tags API](https://scryfall.com/docs/api/tags) documents a public daily Oracle Tags bulk export. Tags join by `oracle_id` and have stable UUIDs, mutable names, parent/child relationships and direct card taggings. Consumers include descendant taggings for parent traits. Weights describe prominence, not confidence probabilities. Lands can use catalog card types; producing mana does not by itself establish Ramp.

A no-credential probe used the [bulk descriptor](https://api.scryfall.com/bulk-data/bd8df61e-5d0a-47a2-9086-40137a645b98) updated at `2026-10-06T09:00:32.767+00:00`. The 5,978,323-byte compressed snapshot contained 4,555 tags, 235,059 taggings and 36,042 distinct tagged Oracle IDs. Provisional root-plus-descendant mappings produced these counts:

| Candidate category | Source root      | Unique Oracle IDs |
| ------------------ | ---------------- | ----------------- |
| Ramp               | ramp             | 2,426             |
| Draw               | draw             | 4,501             |
| Counterspells      | counterspell     | 563               |
| Targeted Removal   | spot removal     | 5,592             |
| Board wipes        | sweeper          | 985               |
| Protection         | protection       | 1,374             |
| Recursion          | recursion        | 2,330             |
| Sacrifice outlets  | sacrifice outlet | 1,536             |

The union is 16,340 Oracle IDs, or 45.3% of tagged IDs. This excludes Lands and Tokens and is not whole-catalog coverage or a correctness score. Ramp and Draw overlap on 341 IDs; Draw and targeted Removal overlap on 451. Solemn Simulacrum is a concrete Ramp/Draw example. Most weights are `median`: 234,437, compared with 621 `very_strong` and one `strong`. Prominence cannot resolve most overlapping purposes.

There is no broad Lands root or single general token-creation root. A repeatable-token-generator subtree misses other token makers. The active-catalog denominator and labeled category-quality evidence remain unavailable. These mappings are measurement candidates, not accepted assignment rules.

## TypeSafe Jev

The [HTTP API](https://docs.typesafe.ai/api) accepts structured state and typed questions with a server-side Bearer API key. [Choice](https://docs.typesafe.ai/primitives/choice) selects one defined option; separate [Noul](https://docs.typesafe.ai/primitives/noul) questions can recognize multiple traits. Category definitions belong in the question criteria. The API documents shared-state parallel questions, rather than an independent-record batch endpoint. Packing several cards into shared state would require context-budget and quality checks.

On 2026-10-06, the [model documentation](https://docs.typesafe.ai/models) lists Jev 1.13 at $0.042 per million input tokens, with output tokens free. It documents no downloadable weights, self-hosting procedure, free allowance or customer-specific fine-tuning. The current limits are 64k total tokens and 32k for state plus the longest question. Illustratively, 50,000 records at 1,000 input tokens each cost $2.10. Actual catalog spend is unmeasured. A direct HTTP adapter can avoid the vendor SDK while retaining the hosted-service dependency.

The [confidence guidance](https://docs.typesafe.ai/confidence) requires target-domain evaluation. [Model limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13) include sensitivity to option order and irrelevant state. Typed answers and concentrated probabilities do not establish MTG classification quality. Pinning model, input and criteria versions would make cached results traceable; this is a candidate integration design.

## Local model alternative

[Laya's model card](https://huggingface.co/convaiinnovations/laya) publishes Apache 2.0 weights and a Jev-compatible local HTTP server. Its English model has 421M parameters and a default 512-token context. The multilingual model has a larger configurable context. Its [routing documentation](https://github.com/NandhaKishorM/laya/blob/main/docs/routing.md) includes independent-state batch prediction.

Local inference avoids provider token charges but adds model storage, an inference runtime and compute. The authors report weak base-model results on their typed-decision benchmark and recommend specialization. No cited MTG evaluation establishes suitability. Resource use, throughput, HTTP compatibility and category quality remain untested in Spellbook. No model was downloaded or installed.

## Authenticated prototype, 2026-10-06

The maintainer authorized testing with the protected TypeSafe key and up to $4 of balance. The isolated [prototype at f5aa390](https://github.com/KyleDerZweite/spellbook/tree/f5aa390/frontend/prototypes/jev-categorization) on `prototype/jev-classification-2026-10-06` captures the runner, frozen public fixture, complete request states, typed responses, usage and a standalone interactive comparison. No application code, account records or database state changed. No vendor SDK or model runtime was installed.

The fixture contains 60 hand-selected Oracle cards from the local export and six synthetic 60-card compositions. Independent expectations were written before inference. A reviewer corrected a token that shared the name Llanowar Elves before the full run; the final fixture hash is `89d3bb34b849b31c60e8975a88c2117cf919e6b432199561b40d3312f9add0f9`. Expected answers and scenario labels were excluded from model inputs. This is a diagnostic sample, not a representative benchmark or a legality check.

The baseline and follow-up requests pinned `jev-1.13.0`. All 79 returned HTTP 200, that model identifier and valid typed answer shapes. Two earlier smoke requests also succeeded. Reported usage totals 154,973 input tokens. At the documented rate, the estimated combined charge is $0.006508866. This is a calculation from response usage, not an invoice or a balance check. Successful-request median latency was 330 ms; the slowest was 2,414 ms. Provider outage, quota failure and production throughput were not exercised.

For single-card Primary Categories, 60 of 60 choices fell within the predefined acceptable sets. Eight choices had confidence below 0.8. The provisional Oracle Tags/type baseline matched 56 of 60; its fixed tie order and narrow token root are not an optimized classifier. Reversing option order changed Growth Spiral from Ramp to Draw, both acceptable. One observation per ordering cannot separate order effects from stochastic variation.

The separate Noul traits met mapped minimum expectations on 55 of 60 cards at an exploratory threshold of 0.8. This measures neither complete trait recall nor precision. Whole-deck assignments met the handwritten rubric on four of six decks at that threshold. The Midrange expectation is subjective; the matched combo contrast is more diagnostic.

### Counter-loop contrast

Both matched decks contain Scurry Oak and counter amplification. Only one also contains Ivy Lane Denizen. Denizen can put a counter on Oak; Oak can create a green Squirrel that triggers Denizen again. With both permanents and an initial trigger, optional repetition supports arbitrarily many counters and tokens. This does not guarantee a win. The counterpart lacks this repeating trigger.

| Recorded question                                          | Without Denizen | With Denizen |
| ---------------------------------------------------------- | --------------- | ------------ |
| Whole-deck Infinite Counters, baseline Noul                | 0.08            | 0.10         |
| Candidate in deck context, Noul                            | 0.17            | 0.19         |
| Original loop question with complete power/toughness state | 0.11            | 0.10         |
| Simpler loop question with complete state                  | 0.37            | 0.38         |

The candidate Choice selected Infinite Counters for both decks, including the negative case, while its independent Noul rejected both. Simplified wording and reduced context also failed to distinguish the loop. The baseline omitted top-level power/toughness; complete-state follow-ups addressed that omission without changing the frozen baseline. Follow-ups are exploratory, not replacement benchmark scores. Probabilities and confidence cannot establish combo correctness.

The local Oracle Cards snapshot contains 38,708 records. Excluding tokens, emblems, art series and Card-type artifacts leaves 35,069 candidate Oracle IDs, still including special layouts. This is not the application's active catalog or a format-legal card count. Extrapolating the measured single-card mean of 1,913.88 input tokens gives roughly $2.82 for those candidates. Text lengths, final questions, retries and import eligibility can change that estimate; no full-catalog inference was run.

## Selected direction

The prototype supports Jev as a candidate for optional generic card suggestions. It does not support dependable automatic combo detection or arbitrary custom meanings in deck context. The maintainer selected deterministic source/rule defaults and manual override for this pass on 2026-10-06. A stronger classifier or hybrid system remains later evaluation. The prototype did not establish population quality.

Optional inference should not be required to read or edit existing Inventory or Decks. The accepted [category contract](../architecture/category-rules.md) defines prior-valid-source retention, unknown/pending behavior and explicit Review/Reset for source/rule classification. No production provider was selected by this experiment.

## Curated combo alternative

[Commander Spellbook](https://backend.commanderspellbook.com/) is a separate public MTG combo project. Its [OpenAPI schema](https://backend.commanderspellbook.com/schema/) directs scheduled local reading of the published [bulk snapshot](https://json.commanderspellbook.com/variants.json.gz), rather than exporting through paginated queries. A 2026-10-06 probe returned HTTP 200 for the roughly 29 MB compressed snapshot, version `7.1.6`. Its expanded source is roughly 682 MB; a reduced Oracle-ID index remains unbuilt.

Unauthenticated queries to [Find My Combos](https://backend.commanderspellbook.com/find-my-combos/) returned [variant 2850-4186](https://commanderspellbook.com/combo/2850-4186/) as included for Scurry Oak plus Ivy Lane Denizen and almost included for Oak alone. The structured outcome includes infinite +1/+1 counters. This verifies a source-backed alternative for the failed Jev contrast, not broad combo coverage.

Variant records contain Oracle IDs, required quantities, zones/states, prerequisites and produced outcomes. A local matcher could supply a positive signal that a deck contains the requirements for a documented combo. Card presence alone does not establish every prerequisite or guarantee execution. No match means no documented variant was found in that snapshot, not proof that no combo exists. This source does not classify every card or make arbitrary natural-language category meanings reliable.

The API asks for attribution, sparse requests and handling HTTP 429. Bulk reading can avoid sending private deck composition to its remote checker. The [MIT statement](https://commanderspellbook.com/about/) covers website and backend source code; inspected materials did not state a separate dataset redistribution license. Scheduled local reading is expressly documented. Q56 on 2026-10-06 selected the optional local bulk importer and reduced matcher for this pass. The [category contract](../architecture/category-rules.md#optional-local-combo-adapter) owns supported constraints, participant/outcome rules and provenance. The local matcher and importer remain unbuilt; the probe does not establish their acceptance evidence.
