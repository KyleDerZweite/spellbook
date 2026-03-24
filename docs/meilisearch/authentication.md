# MeiliSearch Authentication

Reference: https://www.meilisearch.com/docs/reference/api/keys

---

## Overview

MeiliSearch uses a master key + API key system:

- **Master key** — set at server launch, grants full access, used only for key management
- **API keys** — created with specific permissions (actions), scoped to specific indexes
- **Default keys** — auto-generated when master key is set

The **search-only key** is what Spellbook's frontend uses. It is intentionally exposed to the browser since it only grants read access to public card data.

---

## Setting the Master Key

```yaml
# docker-compose.yml / podman-compose.yml
meilisearch:
  image: getmeili/meilisearch:latest
  environment:
    MEILI_MASTER_KEY: ${MEILI_MASTER_KEY}
    MEILI_ENV: production
```

```bash
# CLI
./meilisearch --master-key="your-master-key-at-least-16-chars"

# Environment variable
export MEILI_MASTER_KEY="your-master-key-at-least-16-chars"
./meilisearch
```

Requirements: At least 16 bytes of valid UTF-8 characters. Generate with:

```bash
uuidgen
# or
openssl rand -base64 32
```

---

## Authentication Header

All API endpoints except `GET /health` require authentication:

```
Authorization: Bearer YOUR_API_KEY
```

The master key itself can be used as a bearer token but should only be used for key management (creating/listing/deleting keys). Never expose it to clients.

---

## Default API Keys

When a master key is set, MeiliSearch automatically creates these default keys:

| Key Name | Actions | Use For |
|----------|---------|---------|
| Default Search API Key | `search` on all indexes | Frontend search queries |
| Default Admin API Key | All except key management | Backend administrative tasks |
| Default Read-Only Admin API Key | All `*.get` actions | Read-only database access |
| Default Chat API Key | `search`, `chatCompletions` | Chat features |

---

## List All Keys

```
GET /keys
```

Requires master key authentication.

```bash
curl -X GET 'http://localhost:7700/keys' \
  -H 'Authorization: Bearer MASTER_KEY'
```

**Query parameters:** `offset` (default 0), `limit` (default 20)

**Response:**
```json
{
  "results": [
    {
      "name": "Default Search API Key",
      "description": "Use it to search from the frontend",
      "key": "0a6e572506c52ab0bd6195921575d23092b7f0c284ab4ac86d12346c33057f99",
      "uid": "74c9c733-3368-4738-bbe5-1d18a5fecb37",
      "actions": ["search"],
      "indexes": ["*"],
      "expiresAt": null,
      "createdAt": "2021-08-11T10:00:00Z",
      "updatedAt": "2021-08-11T10:00:00Z"
    }
  ],
  "offset": 0,
  "limit": 20,
  "total": 4
}
```

---

## Get a Single Key

```
GET /keys/{uid_or_key}
```

```bash
curl 'http://localhost:7700/keys/74c9c733-3368-4738-bbe5-1d18a5fecb37' \
  -H 'Authorization: Bearer MASTER_KEY'
```

---

## Create an API Key

```
POST /keys
```

```bash
curl -X POST 'http://localhost:7700/keys' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer MASTER_KEY' \
  --data-binary '{
    "name": "Spellbook Search Key",
    "description": "Read-only search access for Spellbook frontend",
    "actions": ["search"],
    "indexes": ["cards_distinct", "cards_all"],
    "expiresAt": null
  }'
```

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string \| null | No | Human-readable name |
| `description` | string \| null | No | Documentation for the key's purpose |
| `actions` | string[] | Yes | List of permitted actions (see below) |
| `indexes` | string[] | Yes | Index UIDs this key can access. `["*"]` for all indexes. Supports wildcards like `["cards_*"]`. |
| `expiresAt` | string \| null | Yes | RFC 3339 expiration timestamp, or `null` for no expiration |

**Response:**
```json
{
  "name": "Spellbook Search Key",
  "description": "Read-only search access for Spellbook frontend",
  "key": "d0552b41536279a0ad88bd595327b96f01176a60c2243e906c52ac02375f9bc4",
  "uid": "ac81c7b2-3f16-4400-b9a5-...",
  "actions": ["search"],
  "indexes": ["cards_distinct", "cards_all"],
  "expiresAt": null,
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

**The `key` value is only returned at creation time and cannot be retrieved again.** Store it immediately.

---

## Available Actions

| Action | Description |
|--------|-------------|
| `search` | Search documents in an index |
| `documents.add` | Add or update documents |
| `documents.get` | Retrieve documents |
| `documents.delete` | Delete documents |
| `documents.*` | All document operations |
| `indexes.create` | Create new indexes |
| `indexes.get` | Get index information |
| `indexes.update` | Update index settings |
| `indexes.delete` | Delete indexes |
| `indexes.swap` | Swap two indexes |
| `indexes.*` | All index operations |
| `tasks.get` | Retrieve task information |
| `tasks.cancel` | Cancel tasks |
| `tasks.delete` | Delete tasks |
| `tasks.*` | All task operations |
| `settings.get` | Retrieve index settings |
| `settings.update` | Update index settings |
| `settings.*` | All settings operations |
| `stats.get` | Retrieve index stats |
| `dumps.create` | Create database dumps |
| `snapshots.create` | Create snapshots |
| `keys.create` | Create API keys |
| `keys.get` | Retrieve API keys |
| `keys.update` | Update API keys |
| `keys.delete` | Delete API keys |
| `keys.*` | All key operations |
| `*` | All actions (admin) |

---

## Update a Key

```
PATCH /keys/{uid}
```

Only `name`, `description` can be updated after creation. Actions, indexes, and expiresAt cannot be changed — create a new key instead.

```bash
curl -X PATCH 'http://localhost:7700/keys/ac81c7b2-3f16-4400-b9a5-...' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer MASTER_KEY' \
  --data-binary '{
    "name": "Spellbook Frontend Search Key"
  }'
```

---

## Delete a Key

```
DELETE /keys/{uid}
```

```bash
curl -X DELETE 'http://localhost:7700/keys/ac81c7b2-3f16-4400-b9a5-...' \
  -H 'Authorization: Bearer MASTER_KEY'
```

---

## Spellbook Key Strategy

Spellbook uses two keys:

### 1. Master Key (Worker only)

Used by the Python worker to:
- Create and configure indexes
- Add/update documents during Scryfall ingestion
- Manage API keys

Never exposed outside the container network.

```python
# Python worker
import meilisearch
client = meilisearch.Client(MEILISEARCH_URL, MEILI_MASTER_KEY)
```

### 2. Search-Only Key (Frontend)

Read-only key scoped to card indexes. Exposed to the browser via SvelteKit's public env vars.

```typescript
// frontend/src/lib/search/meilisearch.ts
import { MeiliSearch } from 'meilisearch';

export const searchClient = new MeiliSearch({
  host: MEILISEARCH_URL,           // e.g., http://meilisearch:7700
  apiKey: MEILISEARCH_SEARCH_KEY   // read-only, browser-safe
});
```

```env
# .env
MEILI_MASTER_KEY=your-secret-master-key-32-chars-min
MEILISEARCH_SEARCH_KEY=the-key-value-returned-when-created
```

### Creating the Search Key at Startup

The worker should create the search key if it doesn't exist:

```python
def create_search_key_if_needed(client: meilisearch.Client) -> str:
    """Create a search-only key for the frontend. Returns the key value."""
    # Check if a key named 'Spellbook Search Key' already exists
    keys = client.get_keys()
    for key in keys.results:
        if key.name == 'Spellbook Search Key':
            # Key exists but value is not returned after creation
            # The key value must have been stored in the environment
            return None  # Already exists, value was stored at creation

    # Create new search key
    key = client.create_key({
        'name': 'Spellbook Search Key',
        'description': 'Read-only search for Spellbook frontend',
        'actions': ['search'],
        'indexes': ['cards_distinct', 'cards_all'],
        'expiresAt': None
    })
    print(f"Created search key: {key.key}")
    print("Store this value as MEILISEARCH_SEARCH_KEY in your environment")
    return key.key
```

---

## Security Notes

- The search key grants read-only access to public card catalog data. It is safe to expose to browsers.
- Never expose the master key. It is used only inside the Python worker container.
- Do not use the admin key in frontend code — it allows document modification.
- MeiliSearch does not support per-user access control. Card data is public, so one search key is shared by all users.
