# Global search evaluation

- Status: Executed local evaluation and implemented global palette
- Last Reviewed: 2026-10-30
- Source of Truth: repository search code and cited official PostgreSQL/extension documentation
- Update Triggers: search scope selection, relevance evaluation, extension or embedding-model selection
- Related Docs: [Integrations](./README.md), [UI direction](../product/ui-design-direction.md#proposed-global-command-menu), [Catalog](../architecture/catalog.md#search-behavior), [Postgres](../architecture/postgres.md), [Worker](../architecture/worker.md), [t3code search](../reference/t3code-search.md)

Kyle requested exploration of Autocomplete, PostgreSQL improvements, an additional search index and possible pgvector retrieval on 2026-10-29.
Autocomplete is the likely intended term, not a selected automatic query-replacement behavior.
The selected entry requirement remains shortcut-only power-user search, with a read-only keybind description in Settings.
The lab uses disposable schemas, extensions and a local model for comparison.
It selects no production adoption or deployment.

## Execution contract

On 2026-10-30, Kyle authorized executed comparisons, an owned Dev server and Full-Stop delivery of an evaluation PR.
The experiment compares current production SQL, exhaustive and indexed weighted lexical retrieval, configured BM25, exact vectors, HNSW and lexical/vector fusion.
Root owns the corpus, frozen judgments, runtime, UI tests and integration; the isolated SQL implementation received an independent Sol contribution.
The measurement experiment changes no production search endpoint or default shortcut behavior.
Kyle subsequently selected the separate [global menu implementation contract](../product/ui-design-direction.md#global-power-user-search-implementation-contract); its production UI/API work and acceptance are distinct from the captured algorithm benchmark.

Use the existing English Demo snapshot with all 109,393 Printings and 34,948 Canonical Cards in a disposable PostgreSQL 18 database.
Keep all model inference local, record the actual model digest, and complete every document embedding before measuring semantic retrieval.
The 51 evaluation cases and three development probes in `scripts/search-evaluation/cases.json` distinguish name lookup, completion, joined names, typos, rules, descriptive queries, navigation, synthetic Deck scope and no-answer cases.
Known-answer judgments precede benchmark execution and are incomplete relevance labels, not human acceptance.
Use the same corpus and queries, interleave repeated warm measurements, and report query inference and UI debounce separately.
Browser checks cover real keyboard input, focus, navigation, narrow/wide geometry, provider failure and stale responses.
No human usability study, production load or multilingual Catalog coverage follows from these tests.
The executed results and operational commands follow below.

## Executed comparison

On 2026-10-30, eight real implementations ran against the same 34,948 Canonical Cards, representing 109,393 English Demo Printings.
The [captured report](./search-evaluation-results.json) contains per-case results, measurement metadata, browser observations and ANN checks.
The [frozen cases](../../scripts/search-evaluation/cases.json) contain 51 test cases and three separate development probes.
Each variant received one warm-up per case and five interleaved measured trials, totaling 2,040 measured requests.
The warm backend p95 below covers the 40 positive card cases and excludes query embedding inference, HTTP, UI debounce and rendering.
This is a single-user local comparison, not a concurrency or production capacity test.

<!-- search-evaluation-table -->

| Variant                    | Names found in top five, out of 26 | Directly relevant content slots, out of 70 | Warm backend p95 |
| -------------------------- | ---------------------------------: | -----------------------------------------: | ---------------: |
| Current SQL                |                                 21 |                                         21 |            21 ms |
| Indexed lexical            |                                 26 |                                         27 |            16 ms |
| Exhaustive lexical control |                                 26 |                                         27 |           693 ms |
| Configured BM25            |                                 20 |                                         22 |            44 ms |
| Exact vector               |                                 20 |                                         35 |           276 ms |
| Lexical + exact vector     |                                 26 |                                         41 |           283 ms |
| HNSW vector                |                                 18 |                                         35 |            22 ms |
| Lexical + HNSW             |                                 26 |                                         41 |            27 ms |

<!-- /search-evaluation-table -->

Name success uses the known acceptable Canonical Card among the first five results.
Quality uses the first measured repetition; latency uses all five repetitions.
Content counts grade-2 results among five positions for each of 14 rules/description cases, padding missing results with zero.
An independent Sol agent graded a blinded, deduplicated pool of 160 candidate/query pairs against actual rule text.
The [judgments](../../scripts/search-evaluation/judgments.json) distinguish direct matches, partial matches and incorrect results.
This is an agent evaluation, not human acceptance or exhaustive recall.
The pool and metrics must be extended if a changed retriever returns previously unjudged candidates.
Static navigation and synthetic Deck cases use the same providers across variants, so they are excluded from these relevance columns.

The indexed lexical variant protects exact names, supports individual name-word prefixes and joined names, and limits trigram recovery when stronger name matches exist.
Its weighted FTS lane ranks rules candidates separately from name completion.
The exhaustive control demonstrates the cost of scoring the complete corpus before limiting.
BM25 used pg_search 0.26.4 with configured field weights, phrase prefixes and one-edit name recovery.
It did not beat the indexed lexical configuration on this fixture; that does not establish a limit of BM25 or a tuned BM25 system.
BM25 ran in a separate PostgreSQL 18.6 image and opens an additional connection per request, while other variants reuse the benchmark connection.
Its measured time includes that extra setup; the images also differ in Debian packaging.

All semantic variants used local multilingual bge-m3, 1,024 dimensions and the complete document embedding set.
Exact vector retrieval deliberately materializes a narrow distance scan, while HNSW uses the actual ANN index.
Fusion uses reciprocal rank fusion with 100 candidates per lane and k=60, protecting exact names.
New query inference took about 284 ms median and 309 ms p95 with a loaded model.
A separate controlled unload/reload probe took 3.23 seconds for its cold request, including 3.11 seconds of model loading.
The first uncached semantic browser query also took seconds; cached later queries are not comparable to that cold request.
Raw timings and cache flags remain in the report.

### Quality and operational limits

- Indexed lexical found all 26 known name answers, including completion, joined names and typo cases.
  Lexical retrieval cannot translate the English-only corpus for German descriptive queries without explicit aliases or another retrieval method.
- Fusion returned 41 directly relevant content slots versus 27 for indexed lexical.
  Vector and hybrid variants found at least one directly relevant result in 11 of 14 content cases, versus six for lexical and BM25.
  They still confused attack prevention with damage prevention, omitted type constraints and mishandled numeric mana conditions.
  The query for a land producing two colorless mana produced no directly relevant top-five result in the graded pool.
- All four semantic variants returned unrelated results for both deliberately unanswerable cases.
  Lexical and BM25 returned no results for both.
  Similarity and RRF scores are not calibrated confidence; semantic adoption needs an evaluated abstention policy.
- HNSW at ef_search=100 averaged 81.2% recall@10 against exact vectors over 42 queries, with a worst case of 40%.
  A separate single-pass probe reached 100% on these queries at ef_search=400, at higher retrieval cost.
  This probe is exploratory, has order/cache effects, and does not establish general recall or a comparable five-repeat latency estimate.
- A filtered Artifact probe returned zero of ten expected neighbors with default ANN settings, and ten of ten with iterative scanning.
  A sparse-ID probe used a sequential plan, so it establishes filtered correctness rather than ANN performance.
  Color, legality, ownership and other structured constraints must remain explicit filters.

Embedding the remaining 34,916 documents took about 950 seconds after a 32-document preflight.
The HNSW index took about 40 seconds and occupies 286 MB; the configured BM25 index took about 0.38 seconds and occupies 10.4 MB.
These indexes provide different capabilities and exclude the model and other relations.
The lexical alias relation occupies about 9.7 MB, in addition to the canonical projection.
The HNSW build initially exceeded the container's shared-memory allowance; disabling parallel maintenance allowed the build to complete.
The report records the model digest, corpus generation, extension versions and build measurements.
Incremental freshness, atomic generation activation, model upgrades, production resource contention and localized Catalog coverage were not exercised.

### Keyboard and navigation evaluation

The opt-in lab uses the existing Shell, Bits UI Dialog and Command components, with a 150-ms database debounce and immediate local navigation aliases.
There is no launch button or Account-menu entry.
The ordinary application shortcut remains unchanged outside the lab.
Settings keybind discovery is still a proposed production requirement, not an implemented entry in this experiment.

Real Chromium checks passed for Ctrl/Cmd+K, focus, arrow/Enter activation, Escape, Back/query restoration, delayed responses, stale-response rejection, provider failure and a simulated composing Enter.
The same dialog fit 390px and 1280px widths, and all eight variants rendered both completion and German description responses.
A Deck-content result opened a real API-created Demo Deck after login and preserved its return destination.
A German Settings alias opened the real authenticated password page without changing a password.
The isolated owner/other/guest Deck predicate tests passed; this is not acceptance of production private-search authorization or a real second-account journey.
Fixture Deck ownership is intentionally synthetic in the lab and never reads private production Decks.

The final browser run observed an immediate static suggestion in about 9 ms and lexical completion in about 209 ms including debounce, HTTP and rendering.
These are single journey observations, not UI latency distributions.
No human task-completion study, screen-reader session, physical Mac key test or mobile touch study ran.
Keyboard operation and recovery are technically verified; user-friendliness remains an owner judgment.

### Proposed next step

Use the indexed lexical approach as the candidate foundation and retain the immediate static route registry.
Keep semantic retrieval as an optional content lane for a further evaluation of abstention, structured filters and ANN recall.
Do not route every name-completion keystroke through model inference.
These are proposals rather than selected production contracts, and adaptive routing was not benchmarked as another variant.
No production search endpoint, Catalog publication or database migration changes in this evaluation.

## Reproduce and inspect

Use the pinned repository Node/Python setup in [verification](../operations/github-automation.md#local-checks).
The lab adds no application dependencies.
Optional evaluation tools are local Ollama with bge-m3, pgvector 0.8.7 on PostgreSQL 18, a separate pg_search 0.26.4 PostgreSQL 18 instance for BM25, and Playwright 1.64.1 for browser checks.
These tools enable real semantic, index and rendered comparisons without adding providers to the production API.

Assign a fresh local database named `spellbook_search_eval_<run>` and configure its protected credentials in the ignored `.env` as both `DATABASE_URL` and `SEARCH_EVALUATION_DATABASE_URL`.
Set `DEV_DATABASE_CONTAINER` to its pgvector-capable PostgreSQL container, then start `./dev.sh --demo` to migrate and load the bundled Demo Catalog.
The prefix/loopback guard is an accident-prevention check, not a substitute for choosing a disposable database.
`prepare` and `names` are one-time operations per fresh database; never reset an existing database to rerun them.
Assign a second disposable loopback database through `SEARCH_EVALUATION_BM25_URL` for the BM25 copy.
Keep all credentials in the existing protected environment store.
Set `SEARCH_EVALUATION_URL=http://127.0.0.1:5198` before starting the dev launcher.
The CLI reads root `.env`; the built web server always returns 404 for lab routes even if the flag is present.

```sh
pnpm search:evaluate prepare
pnpm search:evaluate names
ollama pull bge-m3
pnpm search:evaluate embed
pnpm search:evaluate index
pnpm search:evaluate bm25
pnpm test:search-evaluation
pnpm search:evaluate benchmark --repeats 5
backend/core/.venv/bin/python scripts/search-evaluation/verify.py
backend/core/.venv/bin/python scripts/search-evaluation/model_probe.py
backend/core/.venv/bin/python scripts/search-evaluation/app_fixtures.py
pnpm search:evaluate serve
```

With the dev server and evaluation service running, open `/__search-evaluation`, select a variant and press Ctrl+K or Cmd+K.
There is no additional launch control.
Run the following in another terminal after installing the Playwright Chromium binary with `uvx --from playwright==1.64.1 playwright install chromium`:

```sh
uvx --from playwright==1.64.1 python scripts/search-evaluation/browser.py
backend/core/.venv/bin/python scripts/search-evaluation/report.py
```

`app_fixtures.py` requires the owned Demo API at port 3001 and checks its account against the assigned database before creating Decks.
It revokes its fixture session afterward.
The browser runner uses `http://localhost:5173` and the evaluation service binds only `127.0.0.1:5198`.
Stop the model-probe and benchmark work before timing browser journeys.
The model probe unloads only the task's bge-m3 model, so run it when that local model is assigned to the experiment.
Raw observations, query vectors, screenshots and resume metadata remain under ignored `.local/search-evaluation`.
`report.py` validates the fixture and judgment coverage before updating the checked-in compact results and chart.
Preserve the model manifest with an existing experiment database; the embed command rejects missing or mismatched model metadata.
A new model or corpus requires a fresh experiment and independent relevance judgments.

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
The experiment inspected its disposable databases, complete Demo corpus and representative query plans.
Production extensions, load and plans remain unverified.

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
The executed semantic variants improve the judged content results but still violate MTG ability, type and numeric constraints.

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
The executed trial below measures relevance, latency and index/build cost.
It is exploratory and had no preselected production acceptance thresholds.
Production model choice, extension packaging and multilingual Catalog scope remain open.

## Implemented global palette and native acceptance

Kyle selected the supplied T3 Code visual reference and real source-specific results on 2026-10-30.
The [selected contract](../product/ui-design-direction.md#global-power-user-search-implementation-contract) and [frontend owner](../architecture/frontend.md#global-power-user-search) own the delivered palette.
The [Catalog owner](../architecture/catalog.md#global-power-user-search) owns the dedicated native query.
This implementation uses existing published PostgreSQL indexes and account-owned records, without adopting the experiment's projection, embedding model or BM25 extension.
It does not replace ordinary Catalog search.
The earlier benchmark table remains a comparison of experiment variants, not performance evidence for this new endpoint.

The same real Sol Ring has separate Card Search, Inventory and named Deck rows, with context icons, quantities and independent destinations.
Public exact-name matching avoids unrelated typo/rules filler, and private queries remain independent of the public top five.
Local Settings aliases support prefixes, accent folding and one-edit typo recovery.
The palette follows the supplied dark reference with compact sans-serif rows, neutral icons/selection, a thin border and bottom keyboard legend; light/narrow layouts use the same controls.
Settings exposes only a read-only keybind; ordinary Search links keep their existing overlay and history.

The captured report's `global_implementation` records actual guest/two-account HTTP isolation and browser checks separately from the algorithm trial.
The native HTTP runner uses a disposable second profile/session fixture and real API-created Inventory/Deck records, not mocked authorization.
It revokes its fixture sessions and removes its temporary second account afterward; it does not test second-account signup.
Browser acceptance covers all three real destinations, Settings/login return, Deck-name completion, other-dialog draft protection, return to ordinary Search, failure/stale-response recovery, dark/light layouts and actual session revocation.
The tests remain technical evidence, not human usability acceptance or production load evidence.

The initial native public query scored all 109,393 Printings before limiting.
An actual Sol Ring plan changed from a sequential scan to existing GIN bitmap scans after indexed candidate admission.
The final report records five warm HTTP repetitions for eight queries as a guest and as the Demo owner.
These measurements include loopback API HTTP; the 150-ms debounce, Web proxy and rendering are additional.
Very short or broad rules requests remain slower than selective names.
The source-specific query and benchmark remain available for further tuning without introducing a new index into this delivery.

After the prerequisites and assigned Demo runtime above, run:

```sh
backend/core/.venv/bin/python scripts/search-evaluation/power_http.py
uvx --from playwright==1.64.1 python scripts/search-evaluation/power_browser.py
backend/core/.venv/bin/python scripts/search-evaluation/report.py
```

The HTTP runner checks the assigned Demo account/database before creating its fixtures.
It adds three Sol Ring copies once through an idempotent Demo Inventory request and creates a separate private verification Deck for its other fixture account.
Existing Demo records are retained.
The browser runner defaults to the owned dev server at port 5173; `POWER_SEARCH_BROWSER_ORIGIN` can select the owned built server for the same journeys.
The opt-in algorithm lab retains its own shortcut while mounted on its development-only route.

Cold-browser startup, built-route guards and the targeted native EXPLAIN capture are optional additional probes in this recorded run.
The report accepts the documented fresh runner outputs without those optional captures and records a missing native plan as null.
