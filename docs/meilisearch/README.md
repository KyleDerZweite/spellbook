# MeiliSearch Documentation for Spellbook

> MeiliSearch is an open-source, fast full-text search engine used in Spellbook for instant MTG card search with typo tolerance, faceted filtering, and sub-50ms response times.

This directory contains documentation organized around what Spellbook actually uses. For the complete MeiliSearch reference see https://www.meilisearch.com/docs.

---

## Files in This Directory

| File | Contents |
|------|----------|
| [search-api.md](search-api.md) | Search endpoint, all parameters, filter syntax, facets, response format |
| [indexes-and-settings.md](indexes-and-settings.md) | Index CRUD, all settings (searchable/filterable/sortable attributes, distinct attribute, typo tolerance, faceting) |
| [documents.md](documents.md) | Adding, updating, deleting documents; batch ingestion; Python/JS SDK examples |
| [authentication.md](authentication.md) | Master key setup, creating API keys, search-only key, available actions |
| [tasks.md](tasks.md) | Async task model, polling for completion, health check, atomic sync pattern |

---

## Spellbook Architecture Summary

MeiliSearch is the sole source of truth for the MTG card catalog. SpacetimeDB stores only user data (collections, collection cards) with denormalized card snapshots.

```
Frontend (SvelteKit)
  ├── queries cards_distinct  →  one result per card name (distinctAttribute: "oracle_id")
  └── queries cards_all       →  all printings filtered by oracle_id

Python Worker
  ├── downloads Scryfall bulk data
  ├── seeds both indexes (cards sorted newest-first)
  └── periodic sync (daily/weekly)
```

### Two-Index Strategy

| Index | Distinct Attribute | Used For |
|-------|--------------------|---------|
| `cards_distinct` | `oracle_id` | Primary search — returns one result per unique card name |
| `cards_all` | _(none)_ | Printing picker — all printings of a selected card |

### Index Configuration

Both indexes share the same searchable/filterable/sortable attributes. Only `cards_distinct` has a `distinctAttribute`.

**Searchable attributes** (ranked by importance):
1. `name`
2. `type_line`
3. `oracle_text`
4. `set_name`

**Filterable attributes**: `colors`, `color_identity`, `rarity`, `set_code`, `type_line`, `mana_cost`, `is_foil_available`, `lang`, `oracle_id`

**Sortable attributes**: `name`, `rarity`, `set_code`, `collector_number`

---

## Quick Reference

### Search (Frontend TypeScript)

```typescript
import { MeiliSearch } from 'meilisearch';

const client = new MeiliSearch({
  host: MEILISEARCH_URL,
  apiKey: MEILISEARCH_SEARCH_KEY   // read-only key
});

const distinctIndex = client.index('cards_distinct');
const allIndex = client.index('cards_all');

// Search by card name (one result per unique card)
const results = await distinctIndex.search(query, { limit: 20 });

// Get all printings of a card
const printings = await allIndex.search('', {
  filter: `oracle_id = "${oracleId}"`,
  sort: ['set_code:asc'],
  limit: 100
});
```

### Add Documents (Python Worker)

```python
import meilisearch

client = meilisearch.Client(MEILISEARCH_URL, MEILI_MASTER_KEY)

task = client.index('cards_distinct').add_documents(cards_batch)
client.wait_for_task(task.task_uid)
```

### Health Check

```bash
curl http://localhost:7700/health
# → { "status": "available" }
```

### Create Search-Only Key

```bash
curl -X POST 'http://localhost:7700/keys' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer MASTER_KEY' \
  --data-binary '{
    "name": "Spellbook Search Key",
    "actions": ["search"],
    "indexes": ["cards_distinct", "cards_all"],
    "expiresAt": null
  }'
```

---

## MeiliSearch Official Docs

- Search API: https://www.meilisearch.com/docs/reference/api/search
- Settings: https://www.meilisearch.com/docs/reference/api/settings
- Documents: https://www.meilisearch.com/docs/reference/api/documents
- Tasks: https://www.meilisearch.com/docs/reference/api/tasks
- Keys: https://www.meilisearch.com/docs/reference/api/keys
- Distinct Attribute: https://www.meilisearch.com/docs/learn/relevancy/distinct_attribute
- Typo Tolerance: https://www.meilisearch.com/docs/learn/fine_tuning/typo_tolerance
- Filter Expression Reference: https://www.meilisearch.com/docs/learn/filtering_and_sorting/filter_expression_reference
- JavaScript SDK: https://github.com/meilisearch/meilisearch-js
- Python SDK: https://github.com/meilisearch/meilisearch-python
- LLM-friendly docs index: https://www.meilisearch.com/docs/llms.txt
