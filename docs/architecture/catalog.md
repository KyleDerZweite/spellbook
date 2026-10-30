# Catalog

- Status: Canonical
- Last Reviewed: 2026-10-30
- Source of Truth: code, reviewed versioned Demo publication and accepted continuous Lazy requirements
- Update Triggers: global power-search endpoint and independent private matching, tri-state color search and Color/Identity selection, ADR-0029 canonical-only Catalog paths, versioned MTG routes and module ownership, Python source activation and server contraction, independent API/web ownership and relocated code references, catalog source and schema, publication, versioned English Demo bundles, starter samples and display assets, search ranking and query shape, generated color-identity projection and index, filters, facets, browser anchor ranges and cache bounds, import resolution, printing selection, inventory set-name lookup, workspace ownership and compatibility adapters, internal canonical/type fact provenance, paired reference publication and recovery, continuous Lazy browsing/dialog contract and selected versus implemented read limits
- Related Docs: [Domain glossary](../../GLOSSARY.md), [Postgres](./postgres.md), [Worker](./worker.md), [Frontend](./frontend.md), [Deployment](../operations/deployment.md), [Local authentication and demo setup](../operations/local-auth.md), [ADR-0010](../decisions/0010-postgres-catalog.md), [Application contract](./application-contract.md), [Category rules](./category-rules.md), [Independent applications](./independent-applications.md)

PostgreSQL stores the public Scryfall catalog alongside account-owned application data.
The Python API provides public read-only search and printing lookup through `/api/v1/mtg/catalog/search`, `/api/v1/mtg/catalog/cards/{oracleId}/printings` and `/api/v1/mtg/catalog/printings/{printingId}`.
Canonical Catalog reads are public.
[ADR-0029](../decisions/0029-remove-replaced-interfaces.md) removes previous public/mobile Catalog paths without aliases or redirects.
Web SSR uses its remote adapter; browser API calls use the same-origin proxy.
Backend owns request validation, HTTP errors and SQL reads.
Browsers use the application API; they receive no database credential or search-service key.
The catalog contains card metadata, not ownership quantities.

## Storage and publication

Migration `0006_postgres_catalog.sql` enables `pg_trgm` and adds three tables.
`catalog_generations` records each source snapshot and transformation schema version.
`catalog_printings` stores one document per printing per generation, with indexed identity, search, and filter columns.
The singleton `catalog_state` points to the active and previous generations.

The [Python worker](./worker.md) streams a complete snapshot into a new generation using PostgreSQL COPY.
One transaction holds the publisher advisory lock, inserts printings, updates generation metadata, changes the active pointer, and deletes generations older than the previous one.
The foreign key removes their printing rows and internal raw Oracle/type facts.
A malformed or empty snapshot rolls back the transaction and preserves the last published catalog.

The repository does not contain the complete multilingual Scryfall Catalog.
It includes a versioned English Demo bundle; the Worker downloads its configured bulk snapshot at runtime.
By default, that source is `all_cards`.
Each catalog document stores card metadata and Scryfall image URLs.
Spellbook does not copy these images into PostgreSQL or proxy them through the application.

The versioned Demo Catalog bundle `catalog-default-en-20261007.jsonl.gz` contains 109,393 searchable English Printings and 34,948 Oracle IDs, including all 70 starter Printing IDs.
Its native builder uses the existing Worker transform and exclusions against the local default bulk export.
The Demo publisher streams 500-record batches and writes native printing and Oracle-fact projections under the existing Catalog publisher advisory transaction lock.
It activates only a completely validated generation, retains existing generations and leaves all Price state unchanged.
The deterministic generation identity binds bundle format, native transform version and payload digest.
Publication records `demo-bundle` and the explicit bundle version; `providerUpdatedAt` is null.
Neither that version nor the source filename establishes fresh Scryfall or Price evidence.
[Manual bundle updates](../operations/deployment.md#manual-demo-catalog-update) owns operator steps.

The versioned [Upgrades Unleashed fixture](../../backend/scripts/demo/upgrades-unleashed.json) seeds the current private Demo Deck and Inventory separately from public Catalog publication.
[Demo setup](../operations/local-auth.md#demo-mode) owns its official composition, extra owned Commander, printing assumptions and guarded replacement of the previous starter.
The retained [legacy fixture](../../backend/scripts/demo/cards.json) verifies that old Inventory is unchanged before replacement.
Ordinary Demo seed refreshes the public bundle before returning for an existing account and preserves private edits.
Repeating an already-active complete bundle leaves its pointer and timestamp unchanged.
Explicit `--reset-users` remains the separate destructive private reset path.
Images retain remote Scryfall URLs.
The guarded local Demo import and private-state preservation are recorded with [slice 19](https://github.com/KyleDerZweite/spellbook/issues/192); this establishes neither provider freshness nor deployment.

Tracked image files under `frontend/static/showcase/` support the public landing page.
The [MTG manifest](../../frontend/src/lib/showcase/cards.json) lists 12 cards, the [other TCG manifest](../../frontend/src/lib/showcase/other-tcg-cards.json) lists eight cards, and the [pack manifest](../../frontend/src/lib/showcase/packs.json) lists four packs.
The [Commander preview manifest](../../frontend/src/lib/showcase/commander-deck.json) uses eight local card images from that directory.
These are display assets, not catalog records.
The directory also contains `sol-ring-art.webp`, a separate landing asset.
The Scryfall image URLs recorded in the manifests are provenance references; the landing page loads the tracked local WebP files.
Other catalog cards still use their remote image URLs.

The separate `frontend/static/profile/` assets provide card frames and profile artwork.
They are not Scryfall catalog images.
Scan uploads also use separate storage: PostgreSQL records artifact metadata, while local storage or S3 holds the uploaded bytes.
See [scan storage](../operations/deployment.md#storage-and-upgrades).

Search hits, totals, facets, and `generationId` represent one publication snapshot.
Hits, totals and generation are selected by one SQL statement; unfiltered facet reuse follows the immutable-generation coherence rules below.
Readers keep seeing a complete committed generation during publication.
Separate paginated requests may observe different generations; the API does not pin a browsing session to an old snapshot.
Browser search resets its logical anchor range when the generation changes, and card details reject printing pages from mixed generations.
Before the first successful publication, search returns an empty result with `generationId: null`.

The [schema](../../backend/drizzle/), [migration](../../backend/drizzle/0006_postgres_catalog.sql), and [document contract](../../contracts/src/catalog.ts) own field definitions.
Backend explicitly maps the known printing DTO fields before returning results; unknown fields in stored catalog documents do not escape this application interface.
Frontend search types and server handlers retain compatibility exports through the remote adapter.
Catalog refreshes do not rewrite inventory or deck entries.
A Scryfall catalog refresh updates shared reference data; a deck text import resolves user-submitted lines against that data and changes a deck only after review and commit.
Inventory changes use their own account-scoped operations.
Neither user import process downloads or updates the shared catalog.

## Search behavior

[`search.ts`](../../backend/core/src/spellbook_core/mtg/catalog.py) combines literal name substring matching, PostgreSQL full-text search with the `simple` configuration, and trigram name matching.
Fuzzy matching applies to queries with at least three characters and a Latin letter.
Exact English or printed names rank first, followed by name prefixes, full-text matches, substrings, and fuzzy matches.
This is a defined fallback policy, not a claim of equal relevance across languages.
Name matching includes printed and face names and supports CJK substrings.
Oracle, type, and localized non-name text use complete tokens in the `simple` full-text configuration; arbitrary partial CJK matches and language-aware segmentation are not implemented.

Search returns one representative printing per `oracle_id`.
Matching relevance wins first, then English language, descending release date, and printing ID.
A name sort changes the order of canonical cards.
It does not change the representative-printing policy.
Without a query, cards sort by name.
Representative selection compares relevance and English preference using narrow printing columns before reading release dates for page candidates.
If preferred printings of one canonical identity have different names, their date and ID tie order is resolved before pagination so ordering still follows the chosen printing.
The reader materializes those mixed-name identities before joining their printings, so underestimated broad filter selectivity cannot repeatedly scan every canonical name.
Exact totals and facets remain independent of the page.

Filter categories combine with AND.
Rarity, type, legality, and set values combine with OR within their category.
The compatibility filter `colors` includes nonempty card-color subsets of the selected colors.
`C` also includes colorless cards.
It uses the card's printed colors.

The optional `colorIdentity` filter accepts every color-identity subset of its selected palette, including empty identities.
`C` alone accepts only empty identities; adding `C` to a colored palette does not change the matches.
An omitted filter or empty array applies no restriction.
Both color filters combine with AND when supplied together.
Browser Search uses a separate structured `colorMatch` filter with `field: color | identity`, `any` and `all` color arrays.
A color cycles Off, OR, AND, then Off.
The OR colors form one optional disjunction; every AND color must also match.
An empty OR group adds no restriction, and empty OR/AND arrays leave colors unfiltered.
For example, OR White/Blue and AND Black means `(White OR Blue) AND Black`.
Matching requires the selected colors to be present and permits additional colors.
`color` examines printed colors, while `identity` examines the stored color identity.
Colorless means an empty color set; colorless AND a colored requirement correctly has no matches.
Each array accepts at most six known colors, and a color cannot occur in both groups.
Identity matching enumerates the at most 32 valid masks for the existing indexed projection.
This new filter combines with the other supplied Catalog filters using AND.
Existing `colors` and `colorIdentity` API palette contracts remain available to their other consumers.

Browser URLs store OR selections in repeated `color` parameters, AND selections in `colorAnd`, and the selected field in `colorMode`.
The default field is Color.
Mode and selections survive browser history, reload, Search overlay navigation and the bounded result-cache context.
Switching fields preserves the selected colors and resets the result range like other filter changes.
Native Search exposes equivalent labelled OR/AND controls.
The deck editor's separate catalog search does not apply this browser palette.

Migration `0019_catalog_color_identity.sql` derives a stored nullable five-bit `color_identity_mask` from the already-ingested document and indexes generation plus mask.
Search enumerates the selected palette's at most 32 subset masks for an indexed equality predicate, avoiding full-document identity extraction during each read.
PostgreSQL derives the projection for existing and newly inserted printings; source ingestion and publication writers remain unchanged, and no Catalog rebuild is required.
Unknown or missing identities remain excluded by every valid palette.
Duplicate colors and existing known scalar identities retain the prior JSONB predicate's inclusion behavior.
This index does not precompute canonical totals or facets; broad palettes still aggregate their exact matching Canonical cards.

Color facets retain printed-color buckets even when a color-identity palette is active.
Optional color, rarity, and set facets count distinct oracle IDs in each bucket over the matching printings.
The reader deduplicates narrow Oracle/bucket pairs before counting.
Color expansion first deduplicates Oracle/color-array pairs, while representative candidates retain only their selection fields.
Each Catalog process retains one private copied facet response for a nonempty immutable generation, only for empty-query reads without active filters.
A warm read skips facet aggregation but accepts that metadata only when the same statement supplying hits and total returns its exact generation.
A mismatch discards the fast result and reruns the complete facet statement.
Null or empty generations are never memoized, and returned DTOs cannot mutate the retained metadata.
Filtered and query-scoped facets still use the full statement.
A canonical card may occur in more than one bucket, so facet counts need not sum to the result total.
`estimatedTotalHits` contains the exact distinct-card count for the request, despite its compatibility name.
Search starts unfiltered.
The first page supplies facets for the current query and filters; later pages do not replace them.

Public `GET /api/v1/mtg/catalog/search` supports the existing query and pagination contract.
`POST` on that route accepts structured filters and optional facets and name sorting.
[OpenAPI](../../backend/api/src/spellbook_api/http/application.py) owns exact field names, accepted values, defaults, and limits.
Raw search-engine expressions are not accepted.

## Global power-user search

`GET /api/v1/mtg/power-search?query=TEXT` is a separate no-store read owned by `spellbook_core.mtg.power_search`.
It accepts at most 300 UTF-16 query units and rejects NUL.
Empty queries return empty sources with current account and generation context.
The HTTP adapter selects the optional session; invalid explicit Bearer credentials return 401.
Core revalidates issued Actor authority before account-owned queries in its read-only repeatable-read transaction.
Client-supplied account identifiers never select private scope.

The reader matches the complete active Catalog and independently matches all of the account's MTG Inventory and Deck records before limiting each source.
It returns five canonical Catalog hits, five canonical Inventory aggregates, five Deck-name hits and five Deck-content aggregates by Deck and canonical identity.
Inventory variants and Deck roles contribute to their respective quantities.
Owned stored names remain searchable without a current Catalog record.
Active Catalog aliases and rules can also match owned canonical identities without depending on the public top five.
Deck joins constrain both account and game.
The public query admits candidates through existing GIN full-text/trigram indexes before evaluating name relevance.
Ranking uses case-insensitive name, word-prefix, joined-name, literal substring, trigram and rules matches, with similarity/proximity quality followed by deterministic name and identity ties.
An exact card name focuses public results on that name; typo recovery does not fill existing literal/name-completion matches with unrelated cards.
Only extracted alphanumeric tokens enter generated tsquery expressions; numeric tokens remain complete and disable fuzzy recovery.
This is literal matching, not numeric or MTG rules reasoning.
No ingestion, publication, schema or ordinary Catalog search behavior changes.
Web owns destinations and local navigation aliases under the [selected implementation contract](../product/ui-design-direction.md#global-power-user-search-implementation-contract).

## Browser result window

Search's selected browser policy is continuous bounded Lazy loading in 200-result transport ranges, with at most 200 mounted card slots.
The API maximum remains 500 and its omitted-limit default remains 20.
The full route measures the native window; SearchOverlay measures its single whole-modal viewport.
Enhanced Search has no pagination controls or page-size selector.
Native no-JavaScript use alone exposes 200-result Previous/Next links.
Result-window foundations and shared Card actions are implemented; uniform browser-policy/caller integration is implemented.
Local composed rendered/scale evidence is recorded with [slice 19](https://github.com/KyleDerZweite/spellbook/issues/192) under the [Frontend contract](./frontend.md#selected-hybrid-browsing-contract); physical touch, true 200% zoom and deployment remain unverified.

[CatalogWindow](../../frontend/src/lib/search/catalogWindow.ts) owns result pages and generation coherence.
Its global hard bounds are four contexts, 20 pages, 1,000 result records and three physical requests.
Abort invalidates logical work but retains its physical permit through fetch and body decoding settlement.
Continuous Lazy prioritizes visible 200-result ranges and adjacent ranges that fit the record budget.
Serialized cards and retained context metadata use an 8 MiB admission target.
A required current page or retained native seed may exceed that target; metrics report the overflow, without claiming a browser heap cap.
Kit's current server-rendered hits array is one pinned resident page counted in those limits, not a small dialog snapshot.
A matching page shares its array with the cache.
Every Kit replacement changes the retained pin, including a page whose query differs from current shallow Search; that page consumes the same record and context budgets without replacing the active query.
Kit data replacement or route-owner destruction releases the previous pin.
Adjacent pages cannot repeatedly refetch an unadmittable range.

Context identity includes game, query, filters, request options and the fixed 200-result Lazy range policy.
Native server loading and client revalidation address the selected anchor directly, without fetching every preceding page.
A matching native seed supplies the initial page, total, facets and generation without a duplicate initial fetch.
Hidden resume revalidates the current anchor.
A changed `generationId` clears mixed pages, resets to page 1 and replaces the URL while retaining query and filters.
Failed reads retain scoped retry; a successful zero-match read alone shows the empty state.
Card printing-page defaults and limits remain unchanged.

This cache stores DTO pages, not image files.
The PWA service worker does not cache Catalog responses or card images.
[Frontend](./frontend.md#catalog-presentation) owns presentation, history and image warming; [verification](../operations/github-automation.md#browser-verification-and-evidence) owns current-head rendered and scale evidence.

## Printing and import identity

`GET /api/v1/mtg/catalog/cards/{oracleId}/printings` returns every matching printing in the active generation, ordered by set, collector number, language, and printing ID.
It does not group by oracle ID.
Card details paginate this route and display up to 1,000 printings.

The [Inventory reader](../../backend/core/src/spellbook_core/mtg/inventory.py) resolves complete owned set choices against the active catalog generation, selecting the first nonblank set name by printing UUID and falling back to the uppercase code.
Its first-name lookup uses a scalar active-generation predicate and the generation/set/UUID index added by migration 0018, so each owned code selects its first UUID without scanning unrelated printings.
The indexed existence check also bounds absent codes.
The separate nonblank fallback retains set-restricted lookup.
Owned codes use `COLLATE "C"` for distinct normalized identifiers.
Catalog equality explicitly uses `COLLATE "default"` to match the catalog set-code index; preserve that equality collation when changing the owned-code query.
Inventory display ordering uses `inventory_root`.
These are separate concerns from Catalog search ordering and the legacy `getCatalogSetNames` helper.

Import resolution accepts exact normalized canonical names and individual canonical face names.
It also accepts exact case-insensitive printed names and localized face names, splitting face aliases on `//` surrounded by spaces.
Whole names remain supported; prefix and fuzzy matches do not resolve imports.
Set and collector-number hints narrow printing candidates.
Name-only resolution groups candidates by oracle ID; hinted resolution keeps printing identities distinct.
The import workflow retains ambiguous and unresolved lines for review.
Scan candidate enrichment resolves authoritative metadata by printing ID through the same catalog.

The [domain glossary](../../GLOSSARY.md) owns the distinction between canonical cards, printings, inventory entries, and deck entries.
[Deployment](../operations/deployment.md#catalog-migration-and-recovery) owns catalog migration and recovery.

## Internal category facts

Catalog publication stores original validated `oracle_id`, printing UUID, available combined-face types and the Catalog transform version in `catalog_oracle_facts` within the same generation transaction.
These rows prove internal source provenance for category evaluation.
They add no authority flag to public CardDocument.
Compatibility printing-ID fallback and old generations without proven extraction cannot establish a false Oracle Tag predicate.
[Category rules](./category-rules.md#implemented-starter-entry-decisions) owns the batched fact reader and missing-fact policy.
Oracle Tags has an independent current/previous publication lifecycle and no disposable Catalog foreign key.

## Baseline price correspondence

Scryfall refresh now publishes Catalog metadata and its reference-price view atomically.
The recorded pair supports coherent operator recovery.
Independent immutable price publications do not cascade with disposable Catalog generations.
Catalog DTOs stay explicit; callers obtain prices/product links from the bounded [Valuation contract](./valuation.md#implemented-market-references).
Demo Catalog publication alone establishes no price view.

Catalog transform version 3 adds nullable raw keyword facts to the same generation publication as raw Oracle identity and types.
Missing keyword arrays remain Unknown; an explicit empty array is known empty.
Existing version 2 generations cannot establish keyword predicates.
The paired price publication and price extractor version remain independent.
[Category rules](./category-rules.md) owns rule evaluation.
