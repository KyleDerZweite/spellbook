# MeiliSearch Indexes and Settings

Reference:
- https://www.meilisearch.com/docs/reference/api/indexes
- https://www.meilisearch.com/docs/reference/api/settings
- https://www.meilisearch.com/docs/learn/relevancy/distinct_attribute
- https://www.meilisearch.com/docs/learn/fine_tuning/typo_tolerance

---

## Index Management

An index is a collection of documents with its own settings. Each index has a unique `uid` (e.g., `cards_distinct`, `cards_all`).

### Create an Index

```
POST /indexes
```

```bash
curl -X POST 'http://localhost:7700/indexes' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer MASTER_KEY' \
  --data-binary '{
    "uid": "cards_distinct",
    "primaryKey": "scryfall_id"
  }'
```

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `uid` | string | Yes | Unique identifier for the index. Must match `[a-zA-Z0-9_-]+`. |
| `primaryKey` | string | No | Document field used as the unique document identifier. If omitted, MeiliSearch infers it from the first document. |

**Response:** Returns a [task object](#task-response) (asynchronous operation).

### List Indexes

```
GET /indexes
```

```bash
curl -X GET 'http://localhost:7700/indexes' \
  -H 'Authorization: Bearer MASTER_KEY'
```

**Query params:** `offset` (default 0), `limit` (default 20)

**Response:**
```json
{
  "results": [
    {
      "uid": "cards_distinct",
      "primaryKey": "scryfall_id",
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z"
    }
  ],
  "offset": 0,
  "limit": 20,
  "total": 2
}
```

### Get One Index

```
GET /indexes/{index_uid}
```

```bash
curl 'http://localhost:7700/indexes/cards_distinct' \
  -H 'Authorization: Bearer MASTER_KEY'
```

### Delete an Index

```
DELETE /indexes/{index_uid}
```

Returns a task object. The index and all its documents are deleted once the task completes.

### Swap Indexes

Atomically swap the contents and settings of two indexes. Useful for zero-downtime reindexing.

```
POST /swap-indexes
```

```bash
curl -X POST 'http://localhost:7700/swap-indexes' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer MASTER_KEY' \
  --data-binary '[
    { "indexes": ["cards_distinct_new", "cards_distinct"] }
  ]'
```

---

## Task Response (Async Operations)

Index creation, deletion, and settings updates are asynchronous. They return a task summary:

```json
{
  "taskUid": 42,
  "indexUid": "cards_distinct",
  "status": "enqueued",
  "type": "indexCreation",
  "enqueuedAt": "2024-01-01T00:00:00Z"
}
```

Poll `GET /tasks/{taskUid}` to check completion. See [tasks.md](tasks.md) for details.

---

## Index Settings

Settings control how an index searches and indexes documents. All settings updates are asynchronous and return a task.

### Get All Settings

```
GET /indexes/{index_uid}/settings
```

```bash
curl 'http://localhost:7700/indexes/cards_distinct/settings' \
  -H 'Authorization: Bearer MASTER_KEY'
```

### Update All Settings (PATCH)

```
PATCH /indexes/{index_uid}/settings
```

PATCH is preferred over individual sub-endpoints when configuring multiple settings at once — it issues a single task.

```bash
curl -X PATCH 'http://localhost:7700/indexes/cards_distinct/settings' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer MASTER_KEY' \
  --data-binary '{
    "searchableAttributes": ["name", "type_line", "oracle_text", "set_name"],
    "filterableAttributes": ["colors", "color_identity", "rarity", "set_code", "type_line", "mana_cost", "is_foil_available", "lang"],
    "sortableAttributes": ["name", "rarity", "set_code", "collector_number"],
    "distinctAttribute": "oracle_id",
    "typoTolerance": {
      "enabled": true
    }
  }'
```

```python
# Python SDK
client.index('cards_distinct').update_settings({
    'searchableAttributes': ['name', 'type_line', 'oracle_text', 'set_name'],
    'filterableAttributes': ['colors', 'color_identity', 'rarity', 'set_code', 'type_line', 'mana_cost', 'is_foil_available', 'lang'],
    'sortableAttributes': ['name', 'rarity', 'set_code', 'collector_number'],
    'distinctAttribute': 'oracle_id',
    'typoTolerance': {'enabled': True}
})
```

### Reset All Settings to Defaults

```
DELETE /indexes/{index_uid}/settings
```

---

## Searchable Attributes

Controls which document fields are indexed for full-text search and their priority order. **Order matters**: fields listed earlier have higher relevancy weight.

- **Default:** `["*"]` — all fields, in order of first appearance in documents
- **Once manually set**, new fields are NOT automatically added

### Configure

```
PUT /indexes/{index_uid}/settings/searchable-attributes
```

```bash
curl -X PUT 'http://localhost:7700/indexes/cards_distinct/settings/searchable-attributes' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer MASTER_KEY' \
  --data-binary '["name", "type_line", "oracle_text", "set_name"]'
```

For Spellbook, this ranking ensures card names rank above type lines and oracle text in results.

### Reset to Default

```
DELETE /indexes/{index_uid}/settings/searchable-attributes
```

---

## Filterable Attributes

Fields that can be used in `filter` expressions and `facets` in search requests. Must be configured before filtering — adding new filterable attributes triggers re-indexing.

- **Default:** `[]` — no attributes are filterable

### Configure

```
PUT /indexes/{index_uid}/settings/filterable-attributes
```

```bash
curl -X PUT 'http://localhost:7700/indexes/cards_distinct/settings/filterable-attributes' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer MASTER_KEY' \
  --data-binary '["colors", "color_identity", "rarity", "set_code", "type_line", "mana_cost", "is_foil_available", "lang", "oracle_id"]'
```

Note: `oracle_id` must be filterable in `cards_all` to support the printing picker query: `filter: 'oracle_id = "..."'`.

---

## Sortable Attributes

Fields that can be used in the `sort` parameter of search requests.

- **Default:** `[]` — no attributes are sortable

### Configure

```
PUT /indexes/{index_uid}/settings/sortable-attributes
```

```bash
curl -X PUT 'http://localhost:7700/indexes/cards_distinct/settings/sortable-attributes' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer MASTER_KEY' \
  --data-binary '["name", "rarity", "set_code", "collector_number"]'
```

---

## Distinct Attribute

Ensures only one document per unique value of the configured field appears in search results. Used in `cards_distinct` to return one result per unique card name (deduplicated by `oracle_id`).

- **Default:** `null` — no deduplication
- Only one distinct attribute per index is allowed
- When multiple documents share the same distinct value, MeiliSearch keeps the highest-ranked result. If rankings are equal, it keeps the one with the lowest internal `id`.

### How Spellbook Uses It

The `cards_distinct` index sets `distinctAttribute: "oracle_id"`. When searching for "Llanowar Elves", MeiliSearch returns exactly one result per oracle ID (i.e., one result per unique card), not one per printing. The Python worker inserts documents ordered by release date (newest first), so the most recent printing is the representative result kept by the distinct filter.

The `cards_all` index has **no** distinct attribute — it returns every printing.

### Configure

```
PUT /indexes/{index_uid}/settings/distinct-attribute
```

```bash
curl -X PUT 'http://localhost:7700/indexes/cards_distinct/settings/distinct-attribute' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer MASTER_KEY' \
  --data-binary '"oracle_id"'
```

```python
# Python SDK
client.index('cards_distinct').update_distinct_attribute('oracle_id')
```

### Reset

```
DELETE /indexes/{index_uid}/settings/distinct-attribute
```

---

## Typo Tolerance

Controls how MeiliSearch handles typos and misspellings in queries. Enabled by default.

- **Default:** enabled, `oneTypo` at 5 characters, `twoTypos` at 9 characters

### How It Works

MeiliSearch uses Levenshtein distance. Words shorter than `minWordSizeForTypos.oneTypo` must match exactly. Words between `oneTypo` and `twoTypos` thresholds allow one edit. Words at or above `twoTypos` threshold allow two edits.

### Configuration Object

```typescript
{
  enabled: boolean;                    // Default: true
  minWordSizeForTypos: {
    oneTypo: number;                   // Default: 5 (words ≥5 chars allow 1 typo)
    twoTypos: number;                  // Default: 9 (words ≥9 chars allow 2 typos)
  };
  disableOnWords: string[];            // Specific words requiring exact match
  disableOnAttributes: string[];       // Attributes where typos are disabled
  disableOnNumbers: boolean;           // Default: false (enable to require exact number matches)
}
```

### Configure

```
PUT /indexes/{index_uid}/settings/typo-tolerance
```

```bash
# Enable with defaults (recommended for Spellbook)
curl -X PUT 'http://localhost:7700/indexes/cards_distinct/settings/typo-tolerance' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer MASTER_KEY' \
  --data-binary '{
    "enabled": true
  }'
```

```bash
# Disable typos on set codes (short strings like "DOM", "M21")
curl -X PUT 'http://localhost:7700/indexes/cards_distinct/settings/typo-tolerance' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer MASTER_KEY' \
  --data-binary '{
    "enabled": true,
    "disableOnAttributes": ["set_code"]
  }'
```

```python
# Python SDK
client.index('cards_distinct').update_typo_tolerance({
    'enabled': True,
    'disableOnAttributes': ['set_code']
})
```

### Reset

```
DELETE /indexes/{index_uid}/settings/typo-tolerance
```

---

## Faceting Settings

Controls how facets are returned in search responses.

### Configuration Object

```typescript
{
  maxValuesPerFacet: number;     // Default: 100 — max distinct values returned per facet
  sortFacetValuesBy: {
    "*": "alpha" | "count";      // Default: "alpha" — sort all facets alphabetically
    "rarity": "count";           // Override per-facet to sort by frequency
  }
}
```

### Configure

```
PUT /indexes/{index_uid}/settings/faceting
```

```bash
curl -X PUT 'http://localhost:7700/indexes/cards_distinct/settings/faceting' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer MASTER_KEY' \
  --data-binary '{
    "maxValuesPerFacet": 100,
    "sortFacetValuesBy": {
      "*": "alpha",
      "colors": "count",
      "rarity": "count"
    }
  }'
```

---

## Full Spellbook Index Setup

### cards_distinct Index

```python
# Python worker setup
client = meilisearch.Client('http://localhost:7700', MEILI_MASTER_KEY)

# Create index
task = client.create_index('cards_distinct', {'primaryKey': 'scryfall_id'})
client.wait_for_task(task.task_uid)

# Configure all settings at once
task = client.index('cards_distinct').update_settings({
    'searchableAttributes': ['name', 'type_line', 'oracle_text', 'set_name'],
    'filterableAttributes': [
        'colors', 'color_identity', 'rarity', 'set_code',
        'type_line', 'mana_cost', 'is_foil_available', 'lang', 'oracle_id'
    ],
    'sortableAttributes': ['name', 'rarity', 'set_code', 'collector_number'],
    'distinctAttribute': 'oracle_id',
    'typoTolerance': {'enabled': True},
    'faceting': {
        'maxValuesPerFacet': 100,
        'sortFacetValuesBy': {'*': 'alpha', 'colors': 'count', 'rarity': 'count'}
    }
})
client.wait_for_task(task.task_uid)
```

### cards_all Index

```python
# Create index (NO distinct attribute)
task = client.create_index('cards_all', {'primaryKey': 'scryfall_id'})
client.wait_for_task(task.task_uid)

# Configure settings — same filterable/searchable, but NO distinctAttribute
task = client.index('cards_all').update_settings({
    'searchableAttributes': ['name', 'type_line', 'oracle_text', 'set_name'],
    'filterableAttributes': [
        'colors', 'color_identity', 'rarity', 'set_code',
        'type_line', 'mana_cost', 'is_foil_available', 'lang', 'oracle_id'
    ],
    'sortableAttributes': ['name', 'rarity', 'set_code', 'collector_number'],
    'typoTolerance': {'enabled': True}
})
client.wait_for_task(task.task_uid)
```

---

## Default Settings Reference

| Setting | Default Value |
|---------|--------------|
| `searchableAttributes` | `["*"]` (all fields) |
| `filterableAttributes` | `[]` |
| `sortableAttributes` | `[]` |
| `distinctAttribute` | `null` |
| `displayedAttributes` | `["*"]` (all fields) |
| `rankingRules` | `["words", "typo", "proximity", "attribute", "sort", "exactness"]` |
| `stopWords` | `[]` |
| `synonyms` | `{}` |
| `typoTolerance.enabled` | `true` |
| `typoTolerance.minWordSizeForTypos.oneTypo` | `5` |
| `typoTolerance.minWordSizeForTypos.twoTypos` | `9` |
| `faceting.maxValuesPerFacet` | `100` |
| `faceting.sortFacetValuesBy` | `{ "*": "alpha" }` |
| `pagination.maxTotalHits` | `1000` |
