# Category persistence and rules

- Status: Starter primary Deck Entry Categories and Oracle Tags publication implemented; account rules, Review/Reset, whole-deck categories and combos planned
- Last Reviewed: 2026-10-07
- Source of Truth: Kyle's Q56 acceptance of versioned definitions, rule evaluation and optional local combo import
- Update Triggers: definition versions, deck-local bundles, rule vocabulary and priority, source publications, composition jobs, Review/Reset, combo constraints and category acceptance evidence
- Related Docs: [Architecture](./README.md), [Card grouping](../product/card-grouping.md), [Domain glossary](../../GLOSSARY.md), [Classifier research](../integrations/card-categorization.md), [Application contract](./application-contract.md), [Catalog](./catalog.md), [Worker](./worker.md), [ADR-0019](../decisions/0019-versioned-categories-and-local-source-rules.md)

[Card grouping](../product/card-grouping.md) owns category behavior and manual choices. This document owns accepted storage, rule interfaces and evaluation lifecycle. Starter entry categories and Oracle Tags ingestion are implemented. Account customization, Review/Reset, whole-deck evaluation and the Commander Spellbook matcher remain later slices.

## Implemented starter entry decisions

The backend [Categories application](../../backend/src/categories/application.ts) owns trusted-actor reads, explicit idempotent initialization and Manual saves. [Category contracts](../../contracts/src/categories.ts) map only JSON-safe definitions, decisions, evidence, source status, acknowledgements and merge previews. Deck writes compose transaction-bound category helpers with their established account/request/Deck lock order. Frontend owns form adaptation, draft/focus behavior and presentation. Worker writes public facts only.

New Decks adopt all eight immutable starter definitions with local UUIDs, names, order, mapping/root semantics and policy versions. Existing Decks initialize through `initializeDeckCategories`, an actor-authorized POST. Enhanced owned Deck opening submits it once; a native form supplies the same command without JavaScript. GET, category reads, snapshots and prefetch never initialize. New Main entries and uninitialized role moves into Main initialize in their existing Deck write transaction. Quantity-only edits and additions to existing entries preserve decisions.

[The starter registry](../../backend/src/categories/rules.ts) fixes priority as Lands, Board wipes, Counterspells, Removal, Ramp, Draw, Protection, Recursion. Lands uses the existing combined-face Catalog type policy; Ramp excludes Lands. Other starters match the registry's UUID Oracle Tag roots and descendants at any recorded prominence. A higher-priority Unknown stops evaluation and stores Pending within Uncategorized. All known false predicates produce Automatic Uncategorized. A valid complete publication with a present root establishes absent membership as false only for a proven original raw Oracle UUID. Legacy projected printing-ID fallback is Unknown, never canonical authority inferred from UUID equality or inequality.

`readEntryCategoryFacts(tx, printingIds, adoptedDefinitions)` reads one Catalog generation, one Oracle publication and the requested identities/types/memberships in a single statement inside the decision transaction. Raw Oracle/type facts are independently extracted into `catalog_oracle_facts` alongside their Catalog generation, with the matching Catalog transform version. This internal provenance is absent from public CardDocument and cannot be supplied by clients. A Catalog transform version is distinct from any price extractor version. Future paired publishers must preserve this fact COPY and bind it to the final Catalog transform version.

Assignments store Automatic, Pending or Manual provenance, including Manual Uncategorized. Compact evaluated predicate/type/raw-Oracle and publication ID/time/digest/parser evidence survives public source pruning. Embedded adopted definitions do not depend on a publication foreign key. New entries use the latest valid facts with old adopted roots/policy. A missing old root remains Unknown. A public refresh never rewrites assignments. Failed refresh status is separate from usable prior-valid facts.

Non-merging printing/role changes retain entry identity and its complete decision, including hidden non-Main decisions. Merging retains the destination's entire decision and deletes the source. A conflicting merge first returns a 409 consequence preview with both decisions, resulting quantity, composition/decision revisions and source tokens. Confirmation binds that consequence, and changed revisions/quantities require renewed review. Public source changes alone do not alter immutable existing decisions or permit reassignment. Decision revisions advance independently; Deck acknowledgements retain compact affected/removed category identities and original revision on replay.

Category view groups Main entries once by adopted display order, with Pending visible inside Uncategorized. Commander, Sideboard and Companion retain sections. Inspector and native Main-entry forms show provenance and save Manual choices through the same command. Read failures remain infrastructure failures, never evaluated Unknown. No account editor, rule editor, Review/Reset button, whole-deck jobs or combo matcher is exposed by this slice.

## Later account definitions and whole-deck ownership

Account Category Definitions have separate entry and whole-deck scopes with immutable versions. Deck creation adopts the entire ordered bundle, including definitions that do not yet match. Deck-local instances retain the adopted version, name and order. New decks use current account definitions. Existing decks retain their bundle until explicit Review/Reset.

Local rename changes a label. Editing reusable meaning changes explicit rules and creates a new version. Starter meanings remain independent of custom replacements. Archive reusable definitions for future decks while preserving referenced old versions. Removing a local entry category atomically chooses a replacement or Uncategorized and suppresses recreation of that origin in the deck.

Persist manual versus automatic entry decisions and manual whole-deck inclusions/exclusions. Quantity/import additions preserve assignments. Role/printing replacement preserves source assignments unless merging into an existing destination, whose assignment wins after preview. Stable decision revisions protect these choices independently of composition revisions.

## Later bounded rule interface

Rules support all/any/not, catalog type, keyword, stable Oracle Tag with descendants, mapped trait and explicit canonical-card selections. Whole-deck predicates add minimum copies or distinct canonical cards, integer percentage thresholds with an explicit all-cards/nonland denominator, and optional documented-combo outcomes. Rules record participating roles. Templates use Main for trait thresholds and Main plus Commander for combo ingredients. Empty denominators do not match.

Rules neither execute user code nor infer semantics from names. The editor shows supported criteria and provenance. Import Oracle Tag hierarchy and local mappings as versioned publications; mutable names are not source IDs. Do not call Jev in production or expand the pass to arbitrary free-text meanings.

Predicates evaluate true, false or unknown. Missing/failed source input stays unknown under negation. Retain the last valid source publication after import failure. A first-time unknown higher-priority result leaves classification pending with visible source status. Persist exact source/version provenance for each evaluation.

Entry classification uses first-match custom priority before starter fallback, independently of display-group order. Starter order is Lands, Board wipes, Counterspells, Removal, Ramp, Draw, Protection, Recursion. Lands uses type; Ramp excludes Lands. Other starters use reviewed Oracle Tag roots/descendants. No broad Token-makers starter is supported by the incomplete narrow subtree. This priority describes inspectable rules, not confidence or strongest-purpose detection. Main entries receive one primary category; all false results yield Uncategorized. Manual choices, including Uncategorized, always win.

## Later reevaluation and Review/Reset commits

Whole-deck classification permits multiple categories through account rules and explained threshold templates. Do not invent a universal Control/Midrange heuristic. Saved composition changes enqueue durable coalesced reevaluation with the adopted definition versions. Use the latest valid source facts and record exact provenance. Source refresh alone never queues reassignment. Entry decisions remain fixed; automatic whole-deck outcomes can change after composition edits using newer facts.

Reject stale jobs against composition and category-decision revisions. Unknown reevaluation keeps a prior valid whole-deck result visibly pending/stale. Manual inclusions/exclusions survive. This lifecycle avoids retaining every complete classifier snapshot indefinitely while allowing new cards to use current facts.

Review previews current definitions/sources while preserving manual decisions. Reset explicitly releases manual choices only within selected scope. Neither restores suppressed categories without explicit selection. Both show entry moves and changed labels before commit. Commit checks composition/decision revisions, rejecting stale previews instead of reorganizing a newer deck.

## Optional local combo adapter

Q56 selected Commander Spellbook bulk as an optional local adapter for documented ingredients/outcomes. Stream its bulk publication into a reduced local index. Match Oracle IDs, required quantities and supported requirements. Retain prerequisites and source provenance. Unsupported templates or structural constraints cannot produce a positive automatic result.

Whole-deck rules may match a supported produced outcome. Entry rules may select a participant of that same matched variant in the current deck, rather than treat participation as a universal card trait. The UI states that documented ingredients are present and preserves prerequisites; it does not guarantee execution. No match establishes only that the snapshot had no supported match. Do not upload private deck composition to a remote matcher. Operator configuration remains optional; missing source evidence follows the unknown/pending policy.

## Acceptance evidence

Use fixed public examples for multipurpose cards, Lands/Ramp, missing traits, custom overlaps, manual Uncategorized, adopted bundles, local rename/new meaning, archive/suppression, stale jobs/previews and destination merges. With the optional adapter enabled, Oak/Denizen and near-miss cases must use its actual local imported source. Typed Jev output is not category-quality evidence. Library filters/counts must preserve unique deck totals across overlapping categories. Run real authorized use-case and browser journeys as each slice lands; record unavailable source evidence and its consequence.
