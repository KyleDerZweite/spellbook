# JEV categorization sample fixture

This directory is an isolated experiment. `samples.json` freezes evaluator expectations before inference. It contains 60 real Oracle cards and six synthetic 60-card compositions. It makes no production changes and contains no credentials, inference results or user inventory.

The source is the public local Scryfall Oracle bulk export from 2026-10-06. Exact names resolve playable English records; token, double-faced token, emblem and art-series lookalikes are excluded. Transforming cards retain their full two-face name and both faces. The fixture records its filename and compressed-file SHA-256. Card records retain English Oracle text, types, keywords, mana, colors and both faces where present. Card-specific Scryfall links identify the public source. Images, prices, account state and legality claims are excluded.

## Contract

`schema_version`, `source` and `rubric` describe the fixture. `cards` contains stable lowercase name IDs, authoritative `oracle_id`, card state, source URL and evaluator-only `expected`. `decks` contains neutral IDs, complete `{id, quantity}` compositions and evaluator-only `expected`. Every composition sums to 60. A deck reference resolves to the matching complete card state, including all faces.

For inference, explicitly allowlist card-state fields. Exclude every `expected` object, the rubric, filenames, source metadata, deck ID and scenario descriptions. Card IDs are join keys, not input hints. Never serialize this entire fixture into an inference request. A deck request contains only the expanded card states and quantities.

Card evaluation separates one primary functional category from multiple traits. Primary keys are `lands`, `ramp`, `draw`, `counterspells`, `removal`, `board_wipes`, `protection`, `recursion`, `tokens`, `sacrifice`, `creatures`, `artifacts`, `enchantments` and `other`. Counter synergy remains a trait, since it is absent from the selected primary vocabulary. `acceptable_primary` is a set of acceptable answers, not a demand to assign several primaries. `required_traits` is a minimum set of observable effects. Evaluators must normalize documented synonyms instead of silently equating unrelated labels. Lands do not become Ramp merely because they produce mana. Plain card types provide fallbacks. Several modal cards permit more than one primary because the text alone cannot establish the intended deck use.

Deck evaluation is multi-label. Deck keys are `aggro`, `burn`, `control`, `midrange`, `ramp`, `combo`, `tokens`, `counter_theme` and `infinite_counters`. The sacrifice/recursion shell tests `midrange` because sacrifice and recursion are not separate keys in this deck vocabulary. `required_categories` must all appear, `acceptable_categories` limits permitted labels and `forbidden_categories` must be absent. These labels describe whole-deck strategies, not additional card-entry categories. Do not evaluate inferred strategy quality using only the count of lands or category totals.

## Counter-loop contrast

The matched compositions `d04` and `d05` differ by four Heroic Intervention versus four Ivy Lane Denizen. Both contain Scurry Oak and counter amplification. Only `d05` contains the supported repeatable Oak/Denizen loop. Another green creature entering can make Denizen place a counter on Oak. Oak can create a green Squirrel, which triggers Denizen again. The player can repeat optional actions, adding counters and tokens. Both permanents, an initial trigger/counter and absence of disruption are prerequisites. This is not an inevitable win or a gameplay simulation. The counterpart has counter synergy without this known self-sustaining loop.

The primary evidence is the frozen Oracle text for [Scurry Oak](https://api.scryfall.com/cards/named?exact=Scurry%20Oak) and [Ivy Lane Denizen](https://api.scryfall.com/cards/named?exact=Ivy%20Lane%20Denizen). No third-party combo database was used. The fixture tests this specific contrast, not exhaustive absence of every possible interaction.

## Limits and verification

The decklists are coherent synthetic stress cases, not optimized or tournament-legal lists. No format or commander is specified. Sol Ring counts are not a legality assertion. Burn is secondary in the red deck; several cards create tokens or support sacrifice rather than damage players directly. Source fallback types and functional categories do not form an authoritative MTG strategy ontology.

Validation checks unique IDs and Oracle IDs, valid references, positive quantities, exactly 60 copies per composition, preserved face text and the matched loop contrast. No inference calls were made while preparing the fixture. Dataset and rubric edits after inference must be recorded as a new evaluator revision rather than retroactively changing the expected answers.

Public source documentation: [Scryfall bulk data](https://scryfall.com/docs/api/bulk-data), [card objects](https://scryfall.com/docs/api/cards). The local files avoid network requests and API rate consumption.

## Run and inspect

Open `index.html` directly in a browser. It is self-contained and makes no network requests. All model outputs are recorded; manual assignments, provider availability and Review/Reset are in-memory demonstrations. These controls do not change Spellbook.

From this directory, regenerate the comparison without credentials:

```sh
node evaluate.mjs
node build-demo.mjs
```

The dependency-free runner uses Node's built-in HTTP client. A new live run requires the protected `TYPESAFE_API_KEY` in an ignored env file:

```sh
node run.mjs --env-file /absolute/path/to/spellbook/.env \
  --tags /absolute/path/to/spellbook/data/oracle-tags-20261006090032.jsonl \
  --output results.json --budget-usd 4 --prior-estimated-usd 0.000158844
```

Existing successful records are reused. Preserve the frozen fixture and output together. The prior-spend argument includes the two recorded smoke calls. The runner reserves the documented maximum request input charge before each attempt, retains reservations for uncertain failures and stops before the configured cap. It never logs credentials or authentication headers. The estimate uses the [published input price](https://docs.typesafe.ai/models), not an invoice or account balance.

`samples.json` contains evaluator expectations. `results.json` contains actual allowlisted input, question criteria, returned typed answers, model, usage and timing. `summary.json` computes the dated comparison. `smoke-results.json` preserves the two initial endpoint checks against fixture revision 1. `index.html` embeds those public comparison inputs with shared questions hydrated back into complete request records.

## Recorded answer

Jev 1.13 supplied an allowed single-card primary for all 60 selected cards. The provisional Tagger/type mapping supplied 56. This does not establish population accuracy. Independent Noul traits met the mapped minimum on 55 cards at an exploratory 0.8 threshold. Four of six synthetic deck compositions met their handwritten multi-label rubric.

The key negative result is the Oak/Denizen contrast. Whole-deck Infinite Counters was 0.08 without Denizen and 0.10 with it. The candidate Choice selected Infinite Counters in both cases despite independent binary scores of 0.17 and 0.19. Simplified questions, reduced context and complete power/toughness follow-ups did not distinguish the loop. The original baseline omitted top-level power/toughness; follow-ups remain separately recorded and do not replace baseline scores.

Reversing option order changed Growth Spiral from Ramp to Draw. Both are allowed. A single run per order cannot attribute this solely to ordering. Eight original card choices have confidence below 0.8. Confidence and Noul scores are uncalibrated for this sample and are not correctness proofs.

All 79 main and follow-up requests plus two smoke calls succeeded with the pinned model. Combined usage is 154,973 input tokens, an estimated $0.006508866. Main-run median latency was 330 ms and maximum 2,414 ms. No full catalog was classified. Provider quota/outage behavior was not tested against the real endpoint.

The result supports optional generic suggestions as a candidate. It does not establish reliable automatic combo detection or arbitrary custom deck meanings. No production provider selection or integration follows from this prototype.

## Verification

Runner and generator syntax checks passed. An independent review checked source resolution, expectation leakage, reported model identifiers and the interpretation limits. T3 rendered the standalone page at 728 px in dark mode and 360 px in light mode with no console errors. Recorded interactive walkthroughs verified ambiguity/review, protected manual Uncategorized, simulated outage/reset, card-in-deck context and keyboard tabs. A separate rendered check verified that the d05 manual entry assignment does not leak to d04. These are prototype checks, not application or database integration evidence.

No packages, tests, application migrations or account mutations were added. Capture this directory on `prototype/jev-classification-2026-10-06`; the main branch keeps the findings in the canonical classifier research document.

## Fixture revision 2

Before full evaluation, source resolution was corrected to exclude tokens, double-faced tokens, emblems and art-series records for all samples. The previous exact-name scan had selected the Llanowar Elves token from Time Spiral Remastered. Revision 2 replaces it with the playable Foundations Llanowar Elves, mana cost `{G}`, mana value 1, Oracle ID `68954295-54e3-4303-a6bc-fc4547a4e3a3`. Every selected record and face was checked against the exclusion rule. All independent expectations and deck quantities remain unchanged. Initial smoke inference covered Plains and Island only, so the invalid Elf record produced no model result. `fixture_corrections` records the previous file hash and reason; the source-file hash remains unchanged.

The retained evaluator trait `extra_land_drop` for Growth Spiral normalizes only to permission to put a land from hand onto the battlefield. It does not mean an additional ordinary land play, a land search, or guaranteed mana acceleration. Accept `put_land_from_hand` as its precise synonym. Growth Spiral can draw without a land being put onto the battlefield.
