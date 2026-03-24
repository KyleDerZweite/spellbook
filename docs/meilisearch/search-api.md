# MeiliSearch Search API

Reference: https://www.meilisearch.com/docs/reference/api/search

## Endpoint

```
POST /indexes/{index_uid}/search
```

All search parameters go in the JSON request body. A `GET` variant exists but POST is preferred for complex queries.

## Authentication

All routes except `GET /health` require a bearer token:

```
Authorization: Bearer YOUR_API_KEY
```

For search, a search-only API key is sufficient and is the correct choice for frontend clients.

---

## Request Body Parameters

### Core Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `q` | string \| null | `""` | Search query. Supports prefix search and typo tolerance. Only the first 10 words are used for matching. Empty string returns all documents (placeholder search). |
| `offset` | integer | `0` | Number of documents to skip. Use with `limit` for manual pagination. |
| `limit` | integer | `20` | Maximum documents to return. Ignored when `page` or `hitsPerPage` is set. |
| `page` | integer \| null | — | Request a specific page (1-indexed). Use with `hitsPerPage`. |
| `hitsPerPage` | integer \| null | — | Documents per page. When set, response uses `totalHits`/`totalPages` instead of `estimatedTotalHits`. |

### Attribute Selection

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `attributesToRetrieve` | string[] \| null | `["*"]` | Fields to include in each returned document. `["*"]` returns all fields. |
| `attributesToSearchOn` | string[] \| null | — | Restrict this query to a subset of `searchableAttributes`. Does not change index settings. |

### Filtering and Sorting

| Parameter | Type | Description |
|-----------|------|-------------|
| `filter` | string \| array | Filter expression. All attributes used must be in `filterableAttributes`. See Filter Syntax below. |
| `sort` | string[] \| null | Sort by attributes. Format: `["attribute:asc", "attribute:desc"]`. Attributes must be in `sortableAttributes`. |
| `distinct` | string \| null | Return at most one document per distinct value of this field. Overrides the index-level `distinctAttribute` setting for this query. Requires attribute to be in `filterableAttributes`. |

### Faceting

| Parameter | Type | Description |
|-----------|------|-------------|
| `facets` | string[] \| null | Return counts per facet value for the listed attributes. Attributes must be in `filterableAttributes`. Use `["*"]` for all filterable attributes. Response includes `facetDistribution` and `facetStats`. |

### Highlighting and Cropping

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `attributesToHighlight` | string[] \| null | — | Attributes where matching query terms are wrapped in highlight tags. Result appears in `_formatted`. |
| `highlightPreTag` | string | `<em>` | Opening tag inserted before highlighted terms. |
| `highlightPostTag` | string | `</em>` | Closing tag inserted after highlighted terms. |
| `attributesToCrop` | string[] \| null | — | Attributes whose values are cropped to a short excerpt around matching terms. Result appears in `_formatted`. |
| `cropLength` | integer | `10` | Maximum number of words in a cropped value. |
| `cropMarker` | string | `"…"` | String inserted at crop boundaries. |
| `showMatchesPosition` | boolean | `false` | Include byte offsets of matched terms in `_matchesPosition`. |

### Matching Strategy

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `matchingStrategy` | enum | `"last"` | How to handle queries where not all words match. `"last"` drops words from the end. `"all"` requires all words to match. `"frequency"` prioritizes rarer terms first. |
| `rankingScoreThreshold` | number | — | Exclude documents whose ranking score (0.0–1.0) is below this value. |
| `showRankingScore` | boolean | `false` | Include `_rankingScore` (0.0–1.0) per document. |
| `showRankingScoreDetails` | boolean | `false` | Include `_rankingScoreDetails` breaking down each ranking rule's contribution. |

---

## Filter Syntax

Attributes must be added to `filterableAttributes` in index settings before they can be used in filters.

### Comparison Operators

```
name = "Lightning Bolt"          # Equality (case-insensitive for strings)
name != "Lightning Bolt"         # Inequality
collector_number > 100           # Greater than
collector_number >= 100          # Greater than or equal
collector_number < 50            # Less than
collector_number <= 50           # Less than or equal
collector_number 10 TO 50        # Range (equivalent to >= 10 AND <= 50)
```

### Membership and Pattern Operators

```
colors IN [W, U, B]              # Field contains one of these values
rarity IN [rare, mythic]
colors NOT IN [G, R]             # Field does not contain any of these values
name STARTS WITH "Llanowar"      # Prefix match (case-insensitive)
```

### Existence Checks

```
oracle_text EXISTS               # Field exists (even if empty or null)
oracle_text NOT EXISTS           # Field does not exist
image_uri IS NULL                # Field is null
image_uri IS NOT NULL            # Field is not null
image_uri IS EMPTY               # Field is "", [], or {}
image_uri IS NOT EMPTY           # Field is not empty
```

### Logical Operators

`NOT` has highest precedence, then `AND`, then `OR`. Use parentheses to override precedence.

```
# AND - both conditions must match
colors = W AND rarity = rare

# OR - either condition must match
rarity = rare OR rarity = mythic

# NOT - negate a condition
NOT colors = G

# Parentheses for grouping
(colors = W OR colors = U) AND rarity = rare

# Combining with NOT
(colors = W OR colors = U) AND NOT rarity = common
```

### Array Filter Syntax

Alternative to string expressions using nested arrays. Outer array elements use AND; inner array elements use OR. Maximum two levels of nesting.

```json
[["colors = W", "colors = U"], "rarity = rare"]
// Equivalent to: (colors = W OR colors = U) AND rarity = rare
```

---

## Response Format

### Standard Pagination (using `offset`/`limit`)

```json
{
  "hits": [ /* array of documents */ ],
  "query": "lightning bolt",
  "processingTimeMs": 3,
  "offset": 0,
  "limit": 20,
  "estimatedTotalHits": 42
}
```

### Page-Based Pagination (using `page`/`hitsPerPage`)

```json
{
  "hits": [ /* array of documents */ ],
  "query": "lightning bolt",
  "processingTimeMs": 3,
  "page": 1,
  "hitsPerPage": 20,
  "totalHits": 42,
  "totalPages": 3
}
```

### Document Hit Object

Each hit is the full document plus any requested metadata fields:

```json
{
  "id": "abc123",
  "name": "Lightning Bolt",
  "type_line": "Instant",
  "oracle_text": "...",

  "_formatted": {
    "name": "<em>Lightning</em> Bolt",
    "oracle_text": "…deals <em>3</em> damage…"
  },

  "_matchesPosition": {
    "name": [{ "start": 0, "length": 9, "indices": null }]
  },

  "_rankingScore": 0.987,

  "_rankingScoreDetails": {
    "words": { "order": 0, "matchingWords": 1, "maxMatchingWords": 1, "score": 1.0 },
    "typo": { "order": 1, "typoCount": 0, "maxTypoCount": 1, "score": 1.0 }
  }
}
```

### Facet Response

When `facets` is specified in the request:

```json
{
  "hits": [ /* ... */ ],
  "facetDistribution": {
    "colors": { "W": 120, "U": 95, "B": 88, "R": 102, "G": 110 },
    "rarity": { "common": 340, "uncommon": 180, "rare": 95, "mythic": 22 }
  },
  "facetStats": {
    "collector_number": { "min": 1, "max": 400 }
  }
}
```

---

## Examples

### Basic Card Search

```bash
curl -X POST 'http://localhost:7700/indexes/cards_distinct/search' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer SEARCH_KEY' \
  --data-binary '{
    "q": "Llanowar",
    "limit": 20
  }'
```

```typescript
// TypeScript (meilisearch JS SDK)
const results = await distinctIndex.search('Llanowar', { limit: 20 });
console.log(results.hits);
```

### Search with Facets and Filters

```bash
curl -X POST 'http://localhost:7700/indexes/cards_distinct/search' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer SEARCH_KEY' \
  --data-binary '{
    "q": "elf",
    "filter": "colors IN [G] AND rarity IN [common, uncommon]",
    "facets": ["colors", "rarity", "type_line"],
    "limit": 40
  }'
```

### Get All Printings for a Specific Card

```bash
curl -X POST 'http://localhost:7700/indexes/cards_all/search' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer SEARCH_KEY' \
  --data-binary '{
    "q": "",
    "filter": "oracle_id = \"abc123-oracle-id\"",
    "sort": ["set_code:asc"],
    "limit": 100
  }'
```

```typescript
// TypeScript
const printings = await allIndex.search('', {
  filter: `oracle_id = "${oracleId}"`,
  sort: ['set_code:asc'],
  limit: 100
});
```

### Spellbook Two-Index Pattern

```typescript
import { MeiliSearch } from 'meilisearch';

const client = new MeiliSearch({
  host: MEILISEARCH_URL,
  apiKey: MEILISEARCH_SEARCH_KEY  // read-only key
});

// Index for primary card search (one result per unique card name)
export const distinctIndex = client.index('cards_distinct');

// Index for printing picker (all printings of a specific card)
export const allIndex = client.index('cards_all');

// Step 1: Search for cards by name
const cardResults = await distinctIndex.search(query, {
  limit: 20,
  attributesToSearchOn: ['name', 'type_line', 'oracle_text', 'set_name']
});

// Step 2: Get all printings when user clicks a card
const printings = await allIndex.search('', {
  filter: `oracle_id = "${selectedCard.oracle_id}"`,
  sort: ['set_code:asc'],
  limit: 100
});
```

---

## Multi-Search

Run multiple search queries in a single request:

```bash
curl -X POST 'http://localhost:7700/multi-search' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer SEARCH_KEY' \
  --data-binary '{
    "queries": [
      { "indexUid": "cards_distinct", "q": "lightning bolt" },
      { "indexUid": "cards_all", "q": "", "filter": "oracle_id = \"abc123\"" }
    ]
  }'
```

Response includes a `results` array with one response per query, in order.

---

## Error Responses

### 401 Unauthorized
```json
{
  "message": "The Authorization header is missing...",
  "code": "missing_authorization_header",
  "type": "auth",
  "link": "https://docs.meilisearch.com/errors#missing_authorization_header"
}
```

### 404 Index Not Found
```json
{
  "message": "Index `cards_distinct` not found.",
  "code": "index_not_found",
  "type": "invalid_request",
  "link": "https://docs.meilisearch.com/errors#index_not_found"
}
```

### 400 Invalid Filter
```json
{
  "message": "Attribute `colors` is not filterable...",
  "code": "invalid_search_filter",
  "type": "invalid_request",
  "link": "..."
}
```
