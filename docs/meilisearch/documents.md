# MeiliSearch Document Management

Reference: https://www.meilisearch.com/docs/reference/api/documents

All document write operations are **asynchronous** — they return a task summary immediately. Use `GET /tasks/{taskUid}` to check completion. See [tasks.md](tasks.md).

---

## Primary Keys

Every document must have a primary key field — a unique identifier for that document. MeiliSearch uses it for upsert behavior: adding a document with an existing primary key value updates that document rather than inserting a duplicate.

### How Primary Key is Determined

1. **Specified at index creation:** `POST /indexes` with `primaryKey` field
2. **Specified in add-documents request:** `?primaryKey=field_name` query param
3. **Auto-detected:** MeiliSearch looks for a field ending in `id` (case-insensitive) in the first document added

For Spellbook, `scryfall_id` is the primary key for both `cards_distinct` and `cards_all`. Each Scryfall card printing has a unique UUID.

---

## Add or Update Documents (Upsert)

```
POST /indexes/{index_uid}/documents
```

Adds new documents or **updates existing ones** if the primary key value already exists (partial updates are NOT supported — the full document is replaced).

```bash
curl -X POST 'http://localhost:7700/indexes/cards_distinct/documents' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer MASTER_KEY' \
  --data-binary '[
    {
      "scryfall_id": "94c3d6e2-d4ba-4b31-ac7e-4da7a4b09f38",
      "oracle_id": "73db7918-0e1d-4a1f-9902-01804e1cd27c",
      "name": "Lightning Bolt",
      "type_line": "Instant",
      "oracle_text": "Lightning Bolt deals 3 damage to any target.",
      "colors": ["R"],
      "color_identity": ["R"],
      "rarity": "common",
      "set_code": "m10",
      "set_name": "Magic 2010",
      "collector_number": "149",
      "mana_cost": "{R}",
      "is_foil_available": true,
      "lang": "en",
      "image_uris": {
        "normal": "https://cards.scryfall.io/normal/front/.../lightning-bolt.jpg"
      }
    }
  ]'
```

**Query parameters:**

| Parameter | Description |
|-----------|-------------|
| `primaryKey` | Specify the primary key field name. Only needed if not already set on the index. |

**Response:**
```json
{
  "taskUid": 1,
  "indexUid": "cards_distinct",
  "status": "enqueued",
  "type": "documentAdditionOrUpdate",
  "enqueuedAt": "2024-01-01T00:00:00Z"
}
```

### Replace All Documents

```
PUT /indexes/{index_uid}/documents
```

Same as POST but **replaces the entire index contents**. All existing documents are deleted and the new set is inserted. Same request format as POST.

---

## Batch Add Documents

Send an array of up to hundreds of thousands of documents in a single request. MeiliSearch handles batch ingestion efficiently.

```python
# Python SDK — recommended for the worker's bulk ingestion
import meilisearch

client = meilisearch.Client('http://localhost:7700', MEILI_MASTER_KEY)

# Process in chunks for large datasets (Scryfall bulk = 70k+ cards)
BATCH_SIZE = 10_000

def add_documents_in_batches(index_uid: str, documents: list):
    index = client.index(index_uid)
    tasks = []

    for i in range(0, len(documents), BATCH_SIZE):
        batch = documents[i:i + BATCH_SIZE]
        task = index.add_documents(batch)
        tasks.append(task.task_uid)
        print(f"Enqueued batch {i // BATCH_SIZE + 1}, task {task.task_uid}")

    # Wait for all tasks to complete
    for task_uid in tasks:
        client.wait_for_task(task_uid)

    print(f"All batches complete for {index_uid}")

# Seed both indexes in parallel (Python async or threads)
add_documents_in_batches('cards_distinct', cards)
add_documents_in_batches('cards_all', cards)
```

---

## Get a Single Document

```
GET /indexes/{index_uid}/documents/{document_id}
```

```bash
curl 'http://localhost:7700/indexes/cards_distinct/documents/94c3d6e2-d4ba-4b31-ac7e-4da7a4b09f38' \
  -H 'Authorization: Bearer MASTER_KEY'
```

Returns the full stored document.

---

## List Documents

```
GET /indexes/{index_uid}/documents
```

Browse documents in batches — useful for export or inspection, not for search.

**Query parameters:**

| Parameter | Default | Description |
|-----------|---------|-------------|
| `offset` | `0` | Documents to skip |
| `limit` | `20` | Max documents to return |
| `fields` | `*` | Comma-separated list of fields to return |
| `filter` | — | Filter expression (attributes must be in `filterableAttributes`) |
| `sort` | — | Sort criteria: `attribute:asc` or `attribute:desc` |
| `ids` | — | Comma-separated document IDs to retrieve specifically |

```bash
curl 'http://localhost:7700/indexes/cards_distinct/documents?limit=100&fields=scryfall_id,name,oracle_id' \
  -H 'Authorization: Bearer MASTER_KEY'
```

**Response:**
```json
{
  "results": [
    { "scryfall_id": "...", "name": "Lightning Bolt", "oracle_id": "..." }
  ],
  "offset": 0,
  "limit": 100,
  "total": 70000
}
```

---

## Delete a Single Document

```
DELETE /indexes/{index_uid}/documents/{document_id}
```

```bash
curl -X DELETE 'http://localhost:7700/indexes/cards_distinct/documents/94c3d6e2-d4ba-4b31-ac7e-4da7a4b09f38' \
  -H 'Authorization: Bearer MASTER_KEY'
```

Returns a task object.

---

## Delete Documents in Batch

```
POST /indexes/{index_uid}/documents/delete-batch
```

Delete multiple documents by their primary key values.

```bash
curl -X POST 'http://localhost:7700/indexes/cards_distinct/documents/delete-batch' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer MASTER_KEY' \
  --data-binary '["id1", "id2", "id3"]'
```

Returns a task object.

---

## Delete Documents by Filter

```
POST /indexes/{index_uid}/documents/delete
```

Delete all documents matching a filter expression.

```bash
curl -X POST 'http://localhost:7700/indexes/cards_distinct/documents/delete' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer MASTER_KEY' \
  --data-binary '{
    "filter": "lang != \"en\""
  }'
```

Returns a task object.

---

## Delete All Documents

```
DELETE /indexes/{index_uid}/documents
```

Removes all documents from the index. Index and its settings are preserved. Returns a task object.

```bash
curl -X DELETE 'http://localhost:7700/indexes/cards_distinct/documents' \
  -H 'Authorization: Bearer MASTER_KEY'
```

---

## Python SDK Reference

```python
import meilisearch

client = meilisearch.Client('http://localhost:7700', 'MASTER_KEY')
index = client.index('cards_distinct')

# Add or update documents (upsert)
task = index.add_documents(documents_list)
client.wait_for_task(task.task_uid)

# Add documents with explicit primary key
task = index.add_documents(documents_list, primary_key='scryfall_id')
client.wait_for_task(task.task_uid)

# Get one document
doc = index.get_document('94c3d6e2-d4ba-4b31-ac7e-4da7a4b09f38')

# List documents
result = index.get_documents({'limit': 100, 'offset': 0})
print(result.results)  # list of documents
print(result.total)    # total count

# Delete one document
task = index.delete_document('94c3d6e2-d4ba-4b31-ac7e-4da7a4b09f38')

# Delete multiple documents
task = index.delete_documents(['id1', 'id2', 'id3'])

# Delete all documents
task = index.delete_all_documents()

# Wait for task with timeout
task_info = client.wait_for_task(task.task_uid, timeout_in_ms=60000)
```

---

## JavaScript SDK Reference

```typescript
import { MeiliSearch } from 'meilisearch';

const client = new MeiliSearch({ host: 'http://localhost:7700', apiKey: 'MASTER_KEY' });
const index = client.index('cards_distinct');

// Add or update documents (upsert)
const task = await index.addDocuments(documents);
await client.waitForTask(task.taskUid);

// Add with explicit primary key
const task2 = await index.addDocuments(documents, { primaryKey: 'scryfall_id' });

// Get one document
const doc = await index.getDocument('94c3d6e2-...');

// List documents
const result = await index.getDocuments({ limit: 100, offset: 0 });

// Delete one document
await index.deleteDocument('94c3d6e2-...');

// Delete multiple
await index.deleteDocuments(['id1', 'id2']);

// Delete all
await index.deleteAllDocuments();
```

---

## Spellbook Worker Ingestion Pattern

```python
import meilisearch
import json
import time

client = meilisearch.Client(MEILISEARCH_URL, MEILI_MASTER_KEY)

def ensure_indexes_exist():
    """Create indexes if they don't exist, configure settings."""
    for uid in ['cards_distinct', 'cards_all']:
        try:
            client.get_index(uid)
        except meilisearch.errors.MeilisearchApiError:
            task = client.create_index(uid, {'primaryKey': 'scryfall_id'})
            client.wait_for_task(task.task_uid)

    # Configure cards_distinct with distinct attribute
    task = client.index('cards_distinct').update_settings({
        'searchableAttributes': ['name', 'type_line', 'oracle_text', 'set_name'],
        'filterableAttributes': ['colors', 'color_identity', 'rarity', 'set_code',
                                  'type_line', 'mana_cost', 'is_foil_available', 'lang', 'oracle_id'],
        'sortableAttributes': ['name', 'rarity', 'set_code', 'collector_number'],
        'distinctAttribute': 'oracle_id',
        'typoTolerance': {'enabled': True}
    })
    client.wait_for_task(task.task_uid)

    # Configure cards_all without distinct attribute
    task = client.index('cards_all').update_settings({
        'searchableAttributes': ['name', 'type_line', 'oracle_text', 'set_name'],
        'filterableAttributes': ['colors', 'color_identity', 'rarity', 'set_code',
                                  'type_line', 'mana_cost', 'is_foil_available', 'lang', 'oracle_id'],
        'sortableAttributes': ['name', 'rarity', 'set_code', 'collector_number'],
        'typoTolerance': {'enabled': True}
    })
    client.wait_for_task(task.task_uid)


def ingest_cards(cards: list):
    """Ingest cards into both indexes in parallel batches."""
    BATCH_SIZE = 10_000

    # Sort newest-first so distinct filter keeps the most recent printing
    cards_sorted = sorted(cards, key=lambda c: c.get('released_at', ''), reverse=True)

    distinct_tasks = []
    all_tasks = []

    for i in range(0, len(cards_sorted), BATCH_SIZE):
        batch = cards_sorted[i:i + BATCH_SIZE]

        t1 = client.index('cards_distinct').add_documents(batch)
        t2 = client.index('cards_all').add_documents(batch)

        distinct_tasks.append(t1.task_uid)
        all_tasks.append(t2.task_uid)

    # Wait for all tasks
    for uid in distinct_tasks + all_tasks:
        client.wait_for_task(uid, timeout_in_ms=300_000)

    print(f"Ingested {len(cards_sorted)} cards into both indexes")
```
