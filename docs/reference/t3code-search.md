# t3code power-user search reference

- Status: Research
- Last Reviewed: 2026-10-29
- Source of Truth: upstream source and executed pure-matcher probes
- Update Triggers: upstream search changes, power-user search design review
- Related Docs: [UI direction](../product/ui-design-direction.md#proposed-global-command-menu), [Catalog](../architecture/catalog.md#search-behavior), [Reference index](./README.md)

The inspected upstream snapshot is `pingdotgg/t3code@dd148481531a0a090780a2ade20588566db099a2`.
This note records source analysis and pure-function checks, not running server, browser or latency evidence.
Spellbook's [UI owner](../product/ui-design-direction.md#proposed-global-command-menu) distinguishes selected entry requirements from the proposed adaptation.

## Search execution

The palette combines immediate name/metadata ranking with asynchronous server search over persisted message text.
The traced search path uses deterministic matching and ranking; it calls no embedding model, vector store or LLM.
Metadata typo tolerance and indexed message retrieval are separate algorithms.

[CommandPaletteThreadItems.tsx](https://github.com/pingdotgg/t3code/blob/main/apps/web/src/components/CommandPaletteThreadItems.tsx) searches connected environments and assembles local thread candidates plus server results.
[useThreadSearch](https://github.com/pingdotgg/t3code/blob/main/apps/web/src/state/queries.ts) debounces requests by 120 ms and limits the request query to 200 UTF-16 units.
The [client search state](https://github.com/pingdotgg/t3code/blob/main/packages/client-runtime/src/state/threadSearch.ts) keys results by query, environment and scope.
The `orchestration.searchThreads` handler in [ws.ts](https://github.com/pingdotgg/t3code/blob/main/apps/server/src/ws.ts) calls `searchThreadsWithOlderSettledRows` in [ThreadSearch.ts](https://github.com/pingdotgg/t3code/blob/main/apps/server/src/orchestration-v2/ThreadSearch.ts).
That handler retrieves message matches and, when requested, missing older settled thread metadata.
It differs from the similarly named MCP `ThreadSearch.searchThreads` implementation.

## Name and metadata ranking

The implementation is [paletteSearch.ts](https://github.com/pingdotgg/t3code/blob/main/packages/shared/src/paletteSearch.ts), particularly `matchToken`, `matchSearchFields`, `scoreSearchTerms`, `scoreThreadSearch` and `rankSearchGroups`.

- Normalization folds case, many accents and apostrophe variants, then collapses query whitespace.
  It preserves source offsets for highlights rather than applying arbitrary transliteration.
  Word boundaries include punctuation, camelCase and letter/digit transitions.
- Each meaningful query token must match a field, possibly a different field for each token.
  A small explicit English filler-word list can be optional when other tokens exist.
  Whole words score 1; word-start prefixes score `0.7 + 0.2 * tokenLength / wordLength`; joined adjacent title words score 0.6; allowed internal substrings score 0.3.
  Internal substrings require at least four characters and an enabled field.
- The score averages each token's best weighted match.
  An exact primary-field match adds 0.5; a contiguous multiword primary-field match otherwise adds 0.25.
  Thread title weight is 1, branch 0.6, PR title 0.5 and project/environment context 0.25.
  Static aliases have lower weight and stricter short-query matching than the visible name.
- Typo matches score 0.45 and require at least three characters and a letter.
  Longer tokens allow one insertion, deletion, substitution or adjacent transposition against a target prefix.
  Three- and four-character tokens have stricter rules, and the first character normally must match.
  Numeric tokens receive no typo expansion.
  The ranker first runs without typos and reruns with typos only if no candidate in any group has a strong word-start match.
- Match classes constrain ordering before usage boosts apply.
  Thread usage uses a 14-day decay half-life and a multiplier capped at 2.5.
  Remembered query selections can reorder existing matches, but cannot create a match.
  These thread-specific policies are separate from lexical relevance.

The [palette assembly](https://github.com/pingdotgg/t3code/blob/main/apps/web/src/components/CommandPalette.logic.ts) normally limits thread rows to 20 and message-only rows to 10.
Other groups show only a few rows when thread matches exist.
Message results appear in a later group and omit threads already represented by name matches.
Static Settings candidates contain labels, sections and aliases; the palette does not index saved setting values.

## Content retrieval and ranking

[Migration 069](https://github.com/pingdotgg/t3code/blob/main/apps/server/src/persistence/Migrations/069_ThreadMessageSearch.ts) creates a SQLite FTS5 index with the trigram tokenizer and accent removal.
Insert, update and delete triggers maintain it.
The shared [index policy](https://github.com/pingdotgg/t3code/blob/main/apps/server/src/orchestration-v2/messageSearchIndex.ts) includes finished assistant messages and human-authored user messages, excluding streaming messages and generated user notices.
Search covers persisted message text, not arbitrary attachments, tool output or project files.

`buildMessageSearch` in [ThreadSearch.ts](https://github.com/pingdotgg/t3code/blob/main/apps/server/src/orchestration-v2/ThreadSearch.ts) turns long query tokens into quoted FTS terms combined with AND.
Tokens normally need three Unicode code points; two-character CJK/Korean tokens can use a bounded scan instead.
Short tokens narrow a query that has at least one searchable token.
A missing FTS index also selects the bounded scan.
The scan's normalization differs from the indexed path, so equivalent accent handling is not guaranteed in fallback retrieval.

The server then applies `messageMatcher` from paletteSearch.ts to admitted candidates.
It requires every token and grades whole words as 1, word prefixes as 0.8 and permitted internal substrings as 0.3.
Tokens shorter than four code points must start a word.
The lowest long-token grade determines the base message quality.
A whole-word phrase in typed order adds 0.25; otherwise nearby long tokens within a 60-unit span add 0.1.
This content matcher provides no edit-distance typo correction or joined-word matching.

The server chooses one best message per thread by quality, then user role, then timestamp.
Thread ranking considers quality, previous selections, best-quality hit count and usage.
Results include a snippet of at most 240 UTF-16 units and the message ID, allowing navigation to the matched message.

Retrieval is bounded to the newest 10,000 index hits before subsequent filters and at most 2,000 candidate messages.
Without an index, the scan uses a 20,000-rowid window.
These bounds can omit older relevant matches for common queries; the search does not guarantee exhaustive historical results.
Do not copy these thread-history limits into card search without evaluating their effect on Catalog coverage.

## Settled threads and asynchronous results

Settled is a thread lifecycle status distinct from archived or deleted.
The [shell stream](https://github.com/pingdotgg/t3code/blob/main/apps/server/src/orchestration-v2/ShellStream.ts) normally loads only the newest 25 settled shells, with exceptions for active references.
`searchOlderSettled` in ThreadSearch.ts searches older eligible metadata server-side and returns up to 15 name-match shells plus up to five additional message-match shells.
The client mounts those rows so results can navigate to threads absent from its initial state.
General search excludes archived, deleted and hidden subagent threads.

The client can show fast-environment results before slow environments respond.
Shown surviving row identities keep their positions, with up to three extra late message results.
Query-keyed state and snapshot generations guard against unrelated stale results.
Related query refinements can retain previous results while the new query is pending.
This is not evidence that every keystroke immediately cancels server SQL.

## Checked examples and adaptation limits

Root executed the upstream pure ranker with native TypeScript stripping, replacing only its git-prefix import with that module's actual constant.
Six assertions passed for joined words, typo fallback, numeric identity, word boundaries and message relevance.
`solring` and `sol rign` find `Sol Ring`; `deck 2` does not typo-match `Deck 3`.
The content query `tap` matches `Tap target creature.` and rejects `Untap target creature.`.
The content query `draw card` ranks `Draw a card.` above `Draw two cards.` because the latter uses a prefix match for `cards`.
These probes establish matcher behavior, not candidate admission by SQL or relevance on the full Catalog.

Spellbook already has indexed PostgreSQL full-text and trigram name retrieval, documented by the [Catalog owner](../architecture/catalog.md#search-behavior).
Its current full-text path requires complete tokens and does not reproduce t3code's word-prefix, phrase-proximity or weighted-field rules.
Its [Deck choice query](../../backend/core/src/spellbook_core/mtg/decks/library.py) searches names only, with a result limit after substring matching.
Reranking a small existing response cannot recover candidates those queries excluded.
Adapting the algorithm therefore requires server-side candidate and ranking contracts as well as the menu.
Keep Catalog generation coherence, canonical-card deduplication and private account scope with their existing owners.
The UI owner records the proposed scope, including the separate possibility of finding Decks through contained cards.

Framework-independent token, boundary, ranking and highlight logic can be adapted without adopting React, Effect RPC or SQLite.
If source code is copied, preserve the upstream [MIT notice](https://github.com/pingdotgg/t3code/blob/main/LICENSE).
The upstream SQL path, browser behavior and latency were not runtime-tested in this investigation.
