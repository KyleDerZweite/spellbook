# Global search evaluation

- Status: Research and proposed direction
- Last Reviewed: 2026-10-29
- Source of Truth: repository search code and cited official PostgreSQL/extension documentation
- Update Triggers: search scope selection, relevance evaluation, extension or embedding-model selection
- Related Docs: [Integrations](./README.md), [UI direction](../product/ui-design-direction.md#proposed-global-command-menu), [Catalog](../architecture/catalog.md#search-behavior), [Postgres](../architecture/postgres.md), [Worker](../architecture/worker.md), [t3code search](../reference/t3code-search.md)

Kyle requested exploration of Autocomplete, PostgreSQL improvements, an additional search index and possible pgvector retrieval on 2026-10-29.
Autocomplete is the likely intended term, not a selected automatic query-replacement behavior.
The selected entry requirement remains shortcut-only power-user search, with a read-only keybind description in Settings.
This evaluation selects no extension, model, schema change or deployment.

## Recommendation and current implementation

Combine a small local route/action registry with improved PostgreSQL lexical retrieval.
Evaluate a pgvector semantic lane against the same judged queries when descriptive requests expose lexical gaps.
Local plus database search and lexical plus vector search are distinct combinations.
The first supports global navigation; the second is a proposed relevance improvement.
Both database paths can remain inside PostgreSQL.

The current [Catalog query](../../backend/core/src/spellbook_core/mtg/catalog_query.py) combines literal names, `plainto_tsquery('simple', ...)` and trigram word similarity.
Relevance uses fixed CASE tiers followed by name ordering, without weighted FTS or trigram-distance ordering within tiers.
The [schema](../../backend/drizzle/0006_postgres_catalog.sql) already has GIN indexes for names and the generated text vector.
The [Worker](../../backend/workers/catalog/src/worker/catalog.py) concatenates names, type, rule text, set names and localized text into an unweighted search document.
The [Deck choice query](../../backend/core/src/spellbook_core/mtg/decks/library.py) matches Deck names by substring only.
The [configured image](../../podman-compose.yml) is PostgreSQL 18; migrations declare pg_trgm but no vector extension.
Live extensions, corpus size and query plans were not inspected.

## Lexical search and Autocomplete

[PostgreSQL 18](https://www.postgresql.org/docs/18/textsearch-controls.html) provides field weights, prefix/phrase queries, `ts_rank` and proximity-aware `ts_rank_cd`.
Those ranks are not relevance probabilities or corpus-wide BM25 scores.
[GIN](https://www.postgresql.org/docs/18/textsearch-indexes.html) supports matching but does not supply a relevance-sorted top-k response; ranking cost still needs measurement.

Proposed improvements are:

- Protect exact names and explicit navigation intents, then rank names above descriptive text using measured field weights.
  Preserve canonical-card deduplication and representative-printing selection.
- Separate name completion from rule-text retrieval.
  For plain typeahead, parse completed tokens and construct a prefix for the unfinished final lexeme.
  Neither `plainto_tsquery` nor `websearch_to_tsquery` interprets prefix labels in user input.
  Build tsquery syntax from normalized, escaped lexemes and bind SQL values; binding alone does not neutralize tsquery operators.
  Test trailing spaces, punctuation, apostrophes, incomplete quotes and normalization yielding zero or multiple lexemes.
- Use bounded trigram candidates for typo recovery.
  [pg_trgm](https://www.postgresql.org/docs/18/pgtrgm.html) distinguishes whole-string, word-extent and strict word similarity.
  GiST supports distance-ordered nearest-neighbor queries; the current GIN index supports candidate filtering followed by sorting.
  Very short patterns without usable trigrams need a separate completion policy.
- Evaluate phrase/proximity ranking for rule text while preserving word boundaries and numeric constraints.
  [Dictionaries](https://www.postgresql.org/docs/18/textsearch-dictionaries.html) and [unaccent](https://www.postgresql.org/docs/18/unaccent.html) support configurable normalization, but do not establish translation or MTG rules understanding.

Reviewed aliases can connect German/English navigation terms and selected domain concepts.
Existing Oracle Tag publications are possible explicit search sources with stable IDs and versions.
This does not change [Category evaluation](../architecture/category-rules.md#bounded-rule-interface), infer assignments or select free-text classification.

## Additional search documents and pgvector

Evaluate a derived canonical-card search projection independently of vectors.
It could avoid ranking equivalent rule text across Printings and hold a normalized completion vocabulary.
Retain localized/face names and generation coherence; add the projection only if required fields or query plans justify its maintenance.
Multiple indexes do not require another database or a separate search engine.

[pgvector](https://github.com/pgvector/pgvector) provides vector storage and exact or approximate nearest-neighbor search.
Observed upstream instructions use 0.8.7 and support PostgreSQL 13+, including 18.
Embedding inference is a separate model/runtime requirement, as the [official example](https://github.com/pgvector/pgvector-python/blob/master/examples/sentence_transformers/example.py) demonstrates.
Semantic candidates may help descriptive or cross-language requests whose words differ from card text.
No measured evidence here establishes correct MTG ability retrieval, negation handling or numeric reasoning.

The proposed document uses canonical-card identity and selected textual facts, avoiding duplicate embeddings per Printing.
Record model revision, preprocessing version, content hash, dimensions and source generation.
Document/query encoders must produce compatible spaces; changing models requires a backfill and coherent activation.
An optional semantic sidecar should serve only its compatible published source.
Lexical publication and search remain usable while embeddings are unavailable; asynchronous work must not expose a partial replacement of the active Catalog.

Benchmark exact vector search first, then consider HNSW or IVFFlat if latency warrants approximate retrieval.
Filtered ANN can return too few results because filtering follows index scanning; iterative scans improve recall but remain bounded.
Compare ANN with exact vectors under identical filters.
Structured colors, legality and ownership constraints remain authoritative.

## Static targets and result assembly

Settings/pages/actions can ship as a small typed registry of IDs, labels, aliases, destinations and visibility rules.
They can return lexical suggestions immediately without embeddings.
If semantic route matching proves useful, precomputed route vectors must use the query model and carry matching model/content versions.

The backend owns database candidates, private scope, filters and semantic inference if selected.
The frontend combines bounded typed results with static targets and preserves highlighted identity as later results arrive.
A shared Catalog ranking module can serve normal Search and the power-user menu, with separately reviewed query/presentation contracts.
Existing standard Search syntax, history and result-extent guarantees require explicit reconciliation before replacement.

For lexical/vector fusion, independently retrieve candidates, deduplicate canonical identities and evaluate reciprocal rank fusion.
The [official RRF example](https://github.com/pgvector/pgvector-python/blob/master/examples/hybrid_search/rrf.py) sums `1 / (k + rank)` contributions instead of adding incompatible raw scores.
Candidate counts, k and weights need evaluation; RRF alone neither protects exact names nor ensures source diversity.
Apply exact-intent classes and account/publication filters before final limits.
An unrelated static alias must not disable useful card typo recovery across all sources.

## Other option and evaluation

[ParadeDB pg_search](https://github.com/paradedb/paradedb) adds Tantivy-backed BM25 inside PostgreSQL.
Investigate it if native lexical relevance or ranked-query cost becomes a measured limitation, independently of vectors.
Its source declares [PostgreSQL 18 support](https://github.com/paradedb/paradedb/blob/main/pg_search/Cargo.toml); target packaging, licensing and upgrade compatibility remain adoption questions.

Build owner-judged queries for exact/partial names, joined names, typos, phrases, German/English aliases, descriptive requests, Deck contents and Settings intents.
Include hard negatives for `tap`/`untap`, negation, mana/numeric distinctions and similarly worded abilities.
Compare current lexical, improved lexical and lexical/vector retrieval on the same published corpus.
Measure top-result correctness, recall, no-result rate, p50/p95 latency, index/build cost and freshness.
For ANN, measure recall against exact vectors under real filters.
Set thresholds before the trial; no relevance gain, latency or operating cost was measured here.
Model choice, target extension packaging and required multilingual scope remain open.
