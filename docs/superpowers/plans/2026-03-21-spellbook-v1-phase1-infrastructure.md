# Spellbook V1 Phase 1: Infrastructure & SpacetimeDB Module

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the development infrastructure (podman-compose) and build the SpacetimeDB TypeScript module with all V1 tables and reducers — the core data layer everything else depends on.

**Architecture:** SpacetimeDB v2.0 with TypeScript modules provides the app logic and real-time data layer. MeiliSearch runs alongside for card search (populated by the Python worker in Phase 2). Pangolin IAP handles auth externally.

**Tech Stack:** SpacetimeDB v2.0, TypeScript, Podman Compose, MeiliSearch

**Spec:** `docs/superpowers/specs/2026-03-21-spellbook-v1-redesign-design.md`

**Phases Overview:**
- **Phase 1 (this plan):** Infrastructure + SpacetimeDB module
- **Phase 2:** Python Worker (Scryfall ingestion + MeiliSearch indexing)
- **Phase 3:** SvelteKit Frontend
- **Phase 4:** Integration, Dockerfiles, deployment docs

---

## File Structure

**Project Location:** Code lives in the existing `spellbook/` repo. The old implementation will be removed and replaced. Docs stay in `docs/superpowers/`.

**Development Workflow:** Use `spacetime dev` during development (runs its own local SpacetimeDB instance). The podman-compose SpacetimeDB container is for deployment/integration testing only. Do NOT run both simultaneously.

**WASM Runtime Notes:** SpacetimeDB modules compile to WASM. Certain browser/Node.js globals may not be available. The plan marks these with `// WASM-CHECK` comments. During Task 3 (scaffold), examine the generated template code to confirm which APIs are available. Common concerns:
- `crypto.randomUUID()` → may need a manual UUID implementation
- `Date.now()` → SpacetimeDB may provide `ctx.timestamp` instead
- `BigInt()` → should work in WASM but verify

If any API is unavailable, adapt the code following patterns from the generated template.

```
spellbook/                           # Existing repo (cleaned up)
├── podman-compose.yml               # Service orchestration
├── .env                             # Environment configuration
├── .env.example                     # Template for .env
├── .gitignore                       # Ignore .env, node_modules, etc.
├── spacetimedb/                     # SpacetimeDB TypeScript module
│   ├── src/
│   │   ├── index.ts                 # Schema definition (tables + module export)
│   │   ├── reducers/
│   │   │   ├── identity.ts          # onConnect reducer
│   │   │   ├── collections.ts       # Collection CRUD reducers
│   │   │   └── collection-cards.ts  # CollectionCard CRUD reducers
│   │   └── lib/
│   │       └── composite-key.ts     # Composite key generation utility
│   ├── package.json
│   └── tsconfig.json
└── docs/                            # Carried over from current repo
    └── superpowers/
        ├── specs/
        └── plans/
```

---

### Task 1: Install SpacetimeDB CLI

**Files:** None (system setup)

- [ ] **Step 1: Install the SpacetimeDB CLI**

Run:
```bash
curl -sSf https://spacetimedb.com/install | bash
```

- [ ] **Step 2: Verify installation**

Run: `spacetime version`
Expected: Version output showing 2.x.x

- [ ] **Step 3: Commit nothing** — system-level install, no project files yet

---

### Task 2: Create project root and podman-compose

**Files:**
- Create: `spellbook/podman-compose.yml`
- Create: `spellbook/.env.example`
- Create: `spellbook/.env`
- Create: `spellbook/.gitignore`

- [ ] **Step 1: Clean the existing repo for fresh start**

Run:
```bash
cd /home/kyle/CodingProjects/spellbook
# Remove old implementation directories (keep docs/ and .git/)
rm -rf backend/ frontend/ mobile/ scryfall/
# The repo is already initialized with git
```

- [ ] **Step 2: Create .gitignore**

```gitignore
# Environment
.env

# Node
node_modules/
dist/

# Python
__pycache__/
*.pyc
.venv/

# SpacetimeDB
.spacetime/

# IDE
.idea/
.vscode/
*.swp

# OS
.DS_Store

# Superpowers
.superpowers/
```

- [ ] **Step 3: Create .env.example**

```env
# MeiliSearch
MEILI_MASTER_KEY=change-me-to-a-secure-key
MEILISEARCH_SEARCH_KEY=change-me-to-a-read-only-key

# Data Pipeline
AGGRESSIVE_PRELOAD=true
SYNC_INTERVAL=daily
LANGUAGES=en

# Auth (shared between SvelteKit and SpacetimeDB)
AUTH_SIGNING_SECRET=change-me-to-a-secure-secret
```

- [ ] **Step 4: Create .env from example**

Run:
```bash
cp .env.example .env
# Generate real secrets
sed -i "s/change-me-to-a-secure-key/$(openssl rand -hex 32)/" .env
sed -i "s/change-me-to-a-read-only-key/$(openssl rand -hex 16)/" .env
sed -i "s/change-me-to-a-secure-secret/$(openssl rand -hex 32)/" .env
```

- [ ] **Step 5: Create podman-compose.yml**

```yaml
services:
  spacetimedb:
    image: clockworklabs/spacetimedb:latest
    ports:
      - "3000:3000"
    volumes:
      - spacetimedb_data:/stdb
    restart: unless-stopped

  meilisearch:
    image: getmeili/meilisearch:latest
    ports:
      - "7700:7700"
    environment:
      MEILI_MASTER_KEY: ${MEILI_MASTER_KEY}
      MEILI_ENV: development
    volumes:
      - meilisearch_data:/meili_data
    restart: unless-stopped

volumes:
  spacetimedb_data:
  meilisearch_data:
```

Note: `frontend` and `worker` services will be added in Phases 3 and 2 respectively.

- [ ] **Step 6: Start services and verify**

Run:
```bash
podman-compose up -d
podman-compose ps
```
Expected: Both `spacetimedb` and `meilisearch` containers running.

Run:
```bash
curl -s http://localhost:7700/health
```
Expected: `{"status":"available"}`

Run:
```bash
curl -s http://localhost:3000/identity
```
Expected: A JSON response from SpacetimeDB (may vary by version).

- [ ] **Step 7: Commit**

```bash
git add .gitignore .env.example podman-compose.yml
git commit -m "feat: add project scaffolding with podman-compose

SpacetimeDB and MeiliSearch services for local development."
```

---

### Task 3: Scaffold SpacetimeDB TypeScript module

**Files:**
- Create: `spellbook/spacetimedb/` (via `spacetime dev`)
- Modify: Generated files to match our project structure

- [ ] **Step 1: Scaffold the SpacetimeDB project**

Run from project root:
```bash
cd /home/kyle/CodingProjects/spellbook
spacetime dev --template basic-ts
```

This creates the project structure and starts a local dev server. Note the generated file layout — we'll reorganize in the next steps.

- [ ] **Step 2: Examine the generated structure**

Run:
```bash
ls -la spacetimedb/src/
cat spacetimedb/src/index.ts
cat spacetimedb/package.json
```

Note the generated code patterns — we'll replace the template content with our schema.

- [ ] **Step 3: Create the reducer directory structure**

Run:
```bash
mkdir -p spacetimedb/src/reducers
mkdir -p spacetimedb/src/lib
```

- [ ] **Step 4: Commit scaffold**

```bash
git add spacetimedb/
git commit -m "feat: scaffold SpacetimeDB TypeScript module

Generated via spacetime dev --template basic-ts."
```

---

### Task 4: Define schema — tables

**Files:**
- Modify: `spellbook/spacetimedb/src/index.ts`

- [ ] **Step 1: Write the schema with all V1 tables**

Replace the contents of `spacetimedb/src/index.ts` with:

```typescript
import { schema, table, t } from 'spacetimedb/server';

// --- Tables ---

const userProfile = table(
  { name: 'user_profile', public: true },
  {
    accountId: t.string().primaryKey(),    // Pangolin Remote-Subject UUID
    username: t.string(),                   // Remote-User — synced on connect
    email: t.string(),                      // Remote-Email — synced on connect
    lastSeen: t.u64(),                      // Unix timestamp ms
  }
);

const serverConfig = table(
  { name: 'server_config', public: false },
  {
    key: t.string().primaryKey(),           // e.g. "auth_signing_secret"
    value: t.string(),
  }
);

const collection = table(
  { name: 'collection', public: true },
  {
    id: t.string().primaryKey(),            // UUID generated by reducer
    ownerId: t.string().index('btree'),     // FK to userProfile.accountId
    name: t.string(),
    description: t.string(),
    createdAt: t.u64(),                     // Unix timestamp ms
  }
);

const collectionCard = table(
  { name: 'collection_card', public: true },
  {
    // Synthetic compound key: `${collectionId}_${scryfallId}_${isFoil}_${condition}`
    compositeId: t.string().primaryKey(),
    collectionId: t.string().index('btree'), // FK to collection.id
    scryfallId: t.string(),                  // Exact printing reference
    oracleId: t.string(),                    // Groups "same card"
    name: t.string(),                        // Denormalized for display
    setCode: t.string(),                     // Denormalized for display
    imageUri: t.string(),                    // Denormalized — snapshot at add-time
    quantity: t.u32(),
    isFoil: t.boolean(),
    condition: t.string(),                   // "NM" | "LP" | "MP" | "HP" | "DMG"
    notes: t.string(),
    addedAt: t.u64(),                        // Unix timestamp ms
    updatedAt: t.u64(),                      // Unix timestamp ms
  }
);

// --- Schema export ---

const spacetimedb = schema({
  userProfile,
  serverConfig,
  collection,
  collectionCard,
});

export default spacetimedb;
```

- [ ] **Step 2: Verify the module compiles and publishes**

If `spacetime dev` is still running, it should auto-reload. Otherwise:

Run:
```bash
cd /home/kyle/CodingProjects/spellbook
spacetime dev
```

Expected: Module publishes successfully with no errors. Check the terminal output for "Published successfully" or similar.

- [ ] **Step 3: Verify tables exist via SQL**

Run:
```bash
spacetime sql "SELECT * FROM user_profile"
spacetime sql "SELECT * FROM server_config"
spacetime sql "SELECT * FROM collection"
spacetime sql "SELECT * FROM collection_card"
```

Expected: Empty result sets (no errors — tables exist).

- [ ] **Step 4: Commit**

```bash
git add spacetimedb/src/index.ts
git commit -m "feat: define V1 SpacetimeDB schema

Tables: user_profile, server_config, collection, collection_card.
Per spec Section 3."
```

---

### Task 5: Composite key utility

**Files:**
- Create: `spellbook/spacetimedb/src/lib/composite-key.ts`

- [ ] **Step 1: Write the composite key generator**

```typescript
/**
 * Generates a deterministic composite key for CollectionCard.
 * Format: "${collectionId}_${scryfallId}_${isFoil}_${condition}"
 *
 * This enforces uniqueness at the DB level since SpacetimeDB
 * does not support multi-column unique constraints.
 */
export function makeCompositeId(
  collectionId: string,
  scryfallId: string,
  isFoil: boolean,
  condition: string,
): string {
  return `${collectionId}_${scryfallId}_${isFoil}_${condition}`;
}
```

- [ ] **Step 2: Commit**

```bash
git add spacetimedb/src/lib/composite-key.ts
git commit -m "feat: add composite key utility for CollectionCard

Generates deterministic compound key for upsert logic."
```

---

### Task 6: Identity reducer (onConnect)

**Files:**
- Create: `spellbook/spacetimedb/src/reducers/identity.ts`
- Modify: `spellbook/spacetimedb/src/index.ts` (re-export)

- [ ] **Step 1: Write the onConnect reducer**

Create `spacetimedb/src/reducers/identity.ts`:

```typescript
import spacetimedb from '../index.js';
import { t } from 'spacetimedb/server';

/**
 * Called when a user connects. Upserts UserProfile with identity
 * from Pangolin IAP headers (passed via SvelteKit signed token).
 *
 * For V1 single-user deployment, identity claims are passed directly.
 * For multi-user, the signed token must be verified against ServerConfig.
 */
export const connectUser = spacetimedb.reducer(
  {
    accountId: t.string(),
    username: t.string(),
    email: t.string(),
  },
  (ctx, { accountId, username, email }) => {
    const now = BigInt(Date.now()); // WASM-CHECK: verify Date.now() availability
    const existing = ctx.db.userProfile.accountId.find(accountId);

    if (existing) {
      // Update mutable fields (username/email may change in Zitadel)
      existing.username = username;
      existing.email = email;
      existing.lastSeen = now;
      ctx.db.userProfile.accountId.update(existing);
    } else {
      ctx.db.userProfile.insert({
        accountId,
        username,
        email,
        lastSeen: now,
      });
    }
  }
);
```

- [ ] **Step 2: Re-export from index.ts**

Add to the bottom of `spacetimedb/src/index.ts`, after `export default spacetimedb;`:

```typescript
// --- Reducers ---
export { connectUser } from './reducers/identity.js';
```

- [ ] **Step 3: Verify module compiles**

Check `spacetime dev` output for successful publish. If there are type errors, adjust the reducer parameter syntax to match what works in the generated template.

- [ ] **Step 4: Test the reducer**

Run:
```bash
spacetime call connect_user '{"accountId": "test-uuid-001", "username": "kyle", "email": "kyle@test.com"}'
```

Then verify:
```bash
spacetime sql "SELECT * FROM user_profile"
```

Expected: One row with accountId=test-uuid-001, username=kyle, email=kyle@test.com.

- [ ] **Step 5: Test upsert behavior (call again with updated username)**

Run:
```bash
spacetime call connect_user '{"accountId": "test-uuid-001", "username": "kyle_updated", "email": "kyle@newmail.com"}'
spacetime sql "SELECT * FROM user_profile"
```

Expected: Still one row, but username=kyle_updated, email=kyle@newmail.com.

- [ ] **Step 6: Commit**

```bash
git add spacetimedb/src/reducers/identity.ts spacetimedb/src/index.ts
git commit -m "feat: add connectUser reducer for identity upsert

Syncs UserProfile on each connection with Pangolin identity."
```

---

### Task 7: Collection reducers

**Files:**
- Create: `spellbook/spacetimedb/src/reducers/collections.ts`
- Modify: `spellbook/spacetimedb/src/index.ts` (re-export)

- [ ] **Step 1: Write collection CRUD reducers**

Create `spacetimedb/src/reducers/collections.ts`:

```typescript
import spacetimedb from '../index.js';
import { t } from 'spacetimedb/server';

/**
 * Creates a new collection for the current user.
 * Generates a UUID for the collection ID.
 */
export const createCollection = spacetimedb.reducer(
  {
    accountId: t.string(),
    name: t.string(),
    description: t.string(),
  },
  (ctx, { accountId, name, description }) => {
    // Verify user exists
    const user = ctx.db.userProfile.accountId.find(accountId);
    if (!user) {
      throw new Error(`User not found: ${accountId}`);
    }

    // WASM-CHECK: crypto.randomUUID() may not exist in WASM sandbox.
    // Fallback: use a simple hash of accountId + timestamp + Math.random().
    // Check the generated template for SpacetimeDB's recommended ID generation.
    const id = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${accountId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const now = BigInt(Date.now()); // WASM-CHECK: verify Date.now() availability

    ctx.db.collection.insert({
      id,
      ownerId: accountId,
      name,
      description,
      createdAt: now,
    });
  }
);

/**
 * Updates a collection's name and/or description.
 * Only the owner can update.
 */
export const updateCollection = spacetimedb.reducer(
  {
    accountId: t.string(),
    collectionId: t.string(),
    name: t.string(),
    description: t.string(),
  },
  (ctx, { accountId, collectionId, name, description }) => {
    const coll = ctx.db.collection.id.find(collectionId);
    if (!coll) {
      throw new Error(`Collection not found: ${collectionId}`);
    }
    if (coll.ownerId !== accountId) {
      throw new Error('Permission denied: not the collection owner');
    }

    coll.name = name;
    coll.description = description;
    ctx.db.collection.id.update(coll);
  }
);

/**
 * Deletes a collection and ALL its cards.
 * Only the owner can delete.
 */
export const deleteCollection = spacetimedb.reducer(
  {
    accountId: t.string(),
    collectionId: t.string(),
  },
  (ctx, { accountId, collectionId }) => {
    const coll = ctx.db.collection.id.find(collectionId);
    if (!coll) {
      throw new Error(`Collection not found: ${collectionId}`);
    }
    if (coll.ownerId !== accountId) {
      throw new Error('Permission denied: not the collection owner');
    }

    // Delete all cards in this collection
    for (const card of ctx.db.collectionCard.collectionId.filter(collectionId)) {
      ctx.db.collectionCard.compositeId.delete(card.compositeId);
    }

    // Delete the collection
    ctx.db.collection.id.delete(collectionId);
  }
);
```

- [ ] **Step 2: Re-export from index.ts**

Add to `spacetimedb/src/index.ts`:

```typescript
export { createCollection, updateCollection, deleteCollection } from './reducers/collections.js';
```

- [ ] **Step 3: Verify module compiles**

Check `spacetime dev` output. Fix any type errors.

- [ ] **Step 4: Test createCollection**

Run:
```bash
spacetime call create_collection '{"accountId": "test-uuid-001", "name": "Main Collection", "description": "All my cards"}'
spacetime sql "SELECT * FROM collection"
```

Expected: One row with ownerId=test-uuid-001, name="Main Collection".

- [ ] **Step 5: Test updateCollection**

Grab the `id` from the previous query, then:
```bash
spacetime call update_collection '{"accountId": "test-uuid-001", "collectionId": "<ID>", "name": "Updated Name", "description": "New description"}'
spacetime sql "SELECT * FROM collection"
```

Expected: Row updated with new name and description.

- [ ] **Step 6: Test ownership validation**

```bash
spacetime call update_collection '{"accountId": "wrong-user", "collectionId": "<ID>", "name": "Hacked", "description": "Nope"}'
```

Expected: Error — "Permission denied: not the collection owner"

- [ ] **Step 7: Test deleteCollection**

```bash
spacetime call delete_collection '{"accountId": "test-uuid-001", "collectionId": "<ID>"}'
spacetime sql "SELECT * FROM collection"
spacetime sql "SELECT * FROM collection_card"
```

Expected: Both tables empty.

- [ ] **Step 8: Commit**

```bash
git add spacetimedb/src/reducers/collections.ts spacetimedb/src/index.ts
git commit -m "feat: add collection CRUD reducers

createCollection, updateCollection, deleteCollection with ownership validation."
```

---

### Task 8: CollectionCard reducers

**Files:**
- Create: `spellbook/spacetimedb/src/reducers/collection-cards.ts`
- Modify: `spellbook/spacetimedb/src/index.ts` (re-export)

- [ ] **Step 1: Write CollectionCard reducers**

Create `spacetimedb/src/reducers/collection-cards.ts`:

```typescript
import spacetimedb from '../index.js';
import { t } from 'spacetimedb/server';
import { makeCompositeId } from '../lib/composite-key.js';

/**
 * Adds a card to a collection. If the same card (same printing, foil status,
 * condition) already exists, increments quantity instead of creating a duplicate.
 */
export const addToCollection = spacetimedb.reducer(
  {
    accountId: t.string(),
    collectionId: t.string(),
    scryfallId: t.string(),
    oracleId: t.string(),
    name: t.string(),
    setCode: t.string(),
    imageUri: t.string(),
    isFoil: t.boolean(),
    condition: t.string(),
    quantity: t.u32(),
  },
  (ctx, { accountId, collectionId, scryfallId, oracleId, name, setCode, imageUri, isFoil, condition, quantity }) => {
    // Verify collection exists and user owns it
    const coll = ctx.db.collection.id.find(collectionId);
    if (!coll) {
      throw new Error(`Collection not found: ${collectionId}`);
    }
    if (coll.ownerId !== accountId) {
      throw new Error('Permission denied: not the collection owner');
    }

    // Validate condition
    const validConditions = ['NM', 'LP', 'MP', 'HP', 'DMG'];
    if (!validConditions.includes(condition)) {
      throw new Error(`Invalid condition: ${condition}. Must be one of: ${validConditions.join(', ')}`);
    }

    if (quantity === 0) {
      throw new Error('Quantity must be greater than 0');
    }

    const compositeId = makeCompositeId(collectionId, scryfallId, isFoil, condition);
    const now = BigInt(Date.now()); // WASM-CHECK: verify Date.now() availability

    const existing = ctx.db.collectionCard.compositeId.find(compositeId);
    if (existing) {
      // Upsert: increment quantity
      existing.quantity += quantity;
      existing.updatedAt = now;
      // Also update denormalized fields in case card data has changed
      existing.name = name;
      existing.setCode = setCode;
      existing.imageUri = imageUri;
      ctx.db.collectionCard.compositeId.update(existing);
    } else {
      ctx.db.collectionCard.insert({
        compositeId,
        collectionId,
        scryfallId,
        oracleId,
        name,
        setCode,
        imageUri,
        quantity,
        isFoil,
        condition,
        notes: '',
        addedAt: now,
        updatedAt: now,
      });
    }
  }
);

/**
 * Updates a collection card's mutable fields (quantity, condition, notes).
 */
export const updateCollectionCard = spacetimedb.reducer(
  {
    accountId: t.string(),
    compositeId: t.string(),
    quantity: t.u32(),
    notes: t.string(),
  },
  (ctx, { accountId, compositeId, quantity, notes }) => {
    const card = ctx.db.collectionCard.compositeId.find(compositeId);
    if (!card) {
      throw new Error(`Card not found: ${compositeId}`);
    }

    // Verify ownership via the parent collection
    const coll = ctx.db.collection.id.find(card.collectionId);
    if (!coll || coll.ownerId !== accountId) {
      throw new Error('Permission denied: not the collection owner');
    }

    if (quantity === 0) {
      throw new Error('Quantity must be greater than 0. Use removeFromCollection to delete.');
    }

    card.quantity = quantity;
    card.notes = notes;
    card.updatedAt = BigInt(Date.now());
    ctx.db.collectionCard.compositeId.update(card);
  }
);

/**
 * Removes a card from a collection entirely.
 */
export const removeFromCollection = spacetimedb.reducer(
  {
    accountId: t.string(),
    compositeId: t.string(),
  },
  (ctx, { accountId, compositeId }) => {
    const card = ctx.db.collectionCard.compositeId.find(compositeId);
    if (!card) {
      throw new Error(`Card not found: ${compositeId}`);
    }

    // Verify ownership via the parent collection
    const coll = ctx.db.collection.id.find(card.collectionId);
    if (!coll || coll.ownerId !== accountId) {
      throw new Error('Permission denied: not the collection owner');
    }

    ctx.db.collectionCard.compositeId.delete(compositeId);
  }
);
```

- [ ] **Step 2: Re-export from index.ts**

Add to `spacetimedb/src/index.ts`:

```typescript
export { addToCollection, updateCollectionCard, removeFromCollection } from './reducers/collection-cards.js';
```

- [ ] **Step 3: Verify module compiles**

Check `spacetime dev` output. Fix any type errors.

- [ ] **Step 4: Set up test data**

```bash
# Create user and collection first
spacetime call connect_user '{"accountId": "test-uuid-001", "username": "kyle", "email": "kyle@test.com"}'
spacetime call create_collection '{"accountId": "test-uuid-001", "name": "Test Collection", "description": "For testing"}'
# Note the collection ID from:
spacetime sql "SELECT id FROM collection"
```

- [ ] **Step 5: Test addToCollection**

```bash
spacetime call add_to_collection '{
  "accountId": "test-uuid-001",
  "collectionId": "<COLLECTION_ID>",
  "scryfallId": "abc-123-def",
  "oracleId": "oracle-001",
  "name": "Llanowar Elves",
  "setCode": "DOM",
  "imageUri": "https://cards.scryfall.io/normal/front/a/b/abc.jpg",
  "isFoil": false,
  "condition": "NM",
  "quantity": 2
}'
spacetime sql "SELECT * FROM collection_card"
```

Expected: One row with quantity=2.

- [ ] **Step 6: Test upsert (add same card again)**

```bash
spacetime call add_to_collection '{
  "accountId": "test-uuid-001",
  "collectionId": "<COLLECTION_ID>",
  "scryfallId": "abc-123-def",
  "oracleId": "oracle-001",
  "name": "Llanowar Elves",
  "setCode": "DOM",
  "imageUri": "https://cards.scryfall.io/normal/front/a/b/abc.jpg",
  "isFoil": false,
  "condition": "NM",
  "quantity": 1
}'
spacetime sql "SELECT composite_id, quantity FROM collection_card"
```

Expected: Still one row, quantity=3 (2+1).

- [ ] **Step 7: Test foil creates separate entry**

```bash
spacetime call add_to_collection '{
  "accountId": "test-uuid-001",
  "collectionId": "<COLLECTION_ID>",
  "scryfallId": "abc-123-def",
  "oracleId": "oracle-001",
  "name": "Llanowar Elves",
  "setCode": "DOM",
  "imageUri": "https://cards.scryfall.io/normal/front/a/b/abc.jpg",
  "isFoil": true,
  "condition": "NM",
  "quantity": 1
}'
spacetime sql "SELECT composite_id, is_foil, quantity FROM collection_card"
```

Expected: Two rows — one foil (qty 1), one non-foil (qty 3).

- [ ] **Step 8: Test updateCollectionCard**

```bash
spacetime call update_collection_card '{
  "accountId": "test-uuid-001",
  "compositeId": "<COMPOSITE_ID_OF_NON_FOIL>",
  "quantity": 4,
  "notes": "Good copies"
}'
spacetime sql "SELECT composite_id, quantity, notes FROM collection_card WHERE is_foil = false"
```

Expected: quantity=4, notes="Good copies".

- [ ] **Step 9: Test removeFromCollection**

```bash
spacetime call remove_from_collection '{
  "accountId": "test-uuid-001",
  "compositeId": "<COMPOSITE_ID_OF_FOIL>"
}'
spacetime sql "SELECT * FROM collection_card"
```

Expected: Only the non-foil row remains.

- [ ] **Step 10: Test updateCollectionCard with quantity=0**

```bash
spacetime call update_collection_card '{
  "accountId": "test-uuid-001",
  "compositeId": "<COMPOSITE_ID_OF_NON_FOIL>",
  "quantity": 0,
  "notes": "Should fail"
}'
```

Expected: Error — "Quantity must be greater than 0"

- [ ] **Step 11: Test removeFromCollection with wrong owner**

```bash
spacetime call remove_from_collection '{
  "accountId": "wrong-user",
  "compositeId": "<COMPOSITE_ID_OF_NON_FOIL>"
}'
```

Expected: Error — "Permission denied: not the collection owner"

- [ ] **Step 12: Test invalid condition**

```bash
spacetime call add_to_collection '{
  "accountId": "test-uuid-001",
  "collectionId": "<COLLECTION_ID>",
  "scryfallId": "xyz-456",
  "oracleId": "oracle-002",
  "name": "Lightning Bolt",
  "setCode": "M10",
  "imageUri": "https://example.com/bolt.jpg",
  "isFoil": false,
  "condition": "INVALID",
  "quantity": 1
}'
```

Expected: Error — "Invalid condition: INVALID"

- [ ] **Step 13: Test addToCollection ownership validation**

```bash
spacetime call add_to_collection '{
  "accountId": "wrong-user",
  "collectionId": "<COLLECTION_ID>",
  "scryfallId": "xyz-456",
  "oracleId": "oracle-002",
  "name": "Lightning Bolt",
  "setCode": "M10",
  "imageUri": "https://example.com/bolt.jpg",
  "isFoil": false,
  "condition": "NM",
  "quantity": 1
}'
```

Expected: Error — "Permission denied: not the collection owner"

- [ ] **Step 14: Commit**

```bash
git add spacetimedb/src/reducers/collection-cards.ts spacetimedb/src/index.ts
git commit -m "feat: add CollectionCard reducers with composite key upsert

addToCollection (with upsert), updateCollectionCard, removeFromCollection.
All with ownership validation and condition checking."
```

---

### Task 9: Generate client bindings

**Files:**
- Generated: `spellbook/src/module_bindings/` (auto-generated)

- [ ] **Step 1: Generate TypeScript client bindings**

Run:
```bash
cd /home/kyle/CodingProjects/spellbook
spacetime generate
```

- [ ] **Step 2: Examine generated types**

Run:
```bash
ls -la src/module_bindings/
```

These auto-generated types will be used by the SvelteKit frontend in Phase 3. They provide type-safe reducer call signatures and table row types.

- [ ] **Step 3: Commit bindings**

```bash
git add src/module_bindings/
git commit -m "feat: generate SpacetimeDB TypeScript client bindings

Auto-generated types for frontend integration (Phase 3)."
```

---

### Task 10: Seed ServerConfig for auth

**Files:** None (runtime configuration)

- [ ] **Step 1: Document the deployment step**

Create `spellbook/scripts/seed-config.sh`:

```bash
#!/usr/bin/env bash
# Seed SpacetimeDB ServerConfig with auth signing secret.
# Run this ONCE after deploying the module.
#
# Usage: ./scripts/seed-config.sh <AUTH_SIGNING_SECRET>

set -euo pipefail

SECRET="${1:?Usage: $0 <AUTH_SIGNING_SECRET>}"

spacetime call set_server_config "{\"key\": \"auth_signing_secret\", \"value\": \"${SECRET}\"}"

echo "ServerConfig seeded successfully."
```

- [ ] **Step 2: Add the setServerConfig reducer (admin-only)**

Create `spacetimedb/src/reducers/admin.ts`:

```typescript
import spacetimedb from '../index.js';
import { t } from 'spacetimedb/server';

/**
 * Sets a server configuration value. Used during deployment to inject
 * secrets that WASM modules cannot read from environment variables.
 *
 * WARNING: No access control — any connected client can call this.
 * Acceptable for V1 single-user behind Pangolin, but MUST be
 * restricted before multi-user deployment. Options:
 * - Check caller identity against an admin list
 * - Remove the reducer entirely and use spacetime sql for config
 */
export const setServerConfig = spacetimedb.reducer(
  {
    key: t.string(),
    value: t.string(),
  },
  (ctx, { key, value }) => {
    const existing = ctx.db.serverConfig.key.find(key);
    if (existing) {
      existing.value = value;
      ctx.db.serverConfig.key.update(existing);
    } else {
      ctx.db.serverConfig.insert({ key, value });
    }
  }
);
```

- [ ] **Step 3: Re-export from index.ts**

Add to `spacetimedb/src/index.ts`:

```typescript
export { setServerConfig } from './reducers/admin.js';
```

- [ ] **Step 4: Test**

```bash
spacetime call set_server_config '{"key": "auth_signing_secret", "value": "test-secret-123"}'
spacetime sql "SELECT * FROM server_config"
```

Expected: One row with key=auth_signing_secret.

- [ ] **Step 5: Make script executable and commit**

```bash
mkdir -p scripts
chmod +x scripts/seed-config.sh
git add spacetimedb/src/reducers/admin.ts spacetimedb/src/index.ts scripts/seed-config.sh
git commit -m "feat: add ServerConfig seeding for deployment

setServerConfig reducer + seed script for injecting auth secrets into WASM runtime."
```

---

### Task 11: Clean up test data and final verification

**Files:** None

- [ ] **Step 1: Reset the database for a clean state**

Run:
```bash
spacetime sql "DELETE FROM collection_card"
spacetime sql "DELETE FROM collection"
spacetime sql "DELETE FROM user_profile"
spacetime sql "DELETE FROM server_config"
```

Note: If SpacetimeDB doesn't support DELETE via SQL, re-publish the module to reset:
```bash
spacetime dev
```

- [ ] **Step 2: Run full integration test sequence**

```bash
# 1. Seed config
spacetime call set_server_config '{"key": "auth_signing_secret", "value": "integration-test-secret"}'

# 2. Connect user
spacetime call connect_user '{"accountId": "user-001", "username": "kyle", "email": "kyle@spellbook.local"}'

# 3. Create collection
spacetime call create_collection '{"accountId": "user-001", "name": "Main Binder", "description": "Primary card collection"}'

# 4. Get collection ID
spacetime sql "SELECT id FROM collection"
# Use the returned ID in the next commands as <CID>

# 5. Add cards
spacetime call add_to_collection '{"accountId": "user-001", "collectionId": "<CID>", "scryfallId": "card-001", "oracleId": "oracle-001", "name": "Lightning Bolt", "setCode": "M10", "imageUri": "https://example.com/bolt.jpg", "isFoil": false, "condition": "NM", "quantity": 4}'

spacetime call add_to_collection '{"accountId": "user-001", "collectionId": "<CID>", "scryfallId": "card-002", "oracleId": "oracle-002", "name": "Llanowar Elves", "setCode": "DOM", "imageUri": "https://example.com/elves.jpg", "isFoil": true, "condition": "LP", "quantity": 1}'

# 6. Verify state
spacetime sql "SELECT * FROM user_profile"
spacetime sql "SELECT * FROM collection"
spacetime sql "SELECT composite_id, name, quantity, is_foil, condition FROM collection_card"

# 7. Update a card
spacetime call update_collection_card '{"accountId": "user-001", "compositeId": "<CID>_card-001_false_NM", "quantity": 3, "notes": "Traded one away"}'

# 8. Verify update
spacetime sql "SELECT composite_id, quantity, notes, updated_at FROM collection_card WHERE composite_id LIKE '%card-001%'"
```

Expected: All operations succeed. Final state shows 1 user, 1 collection, 2 cards.

- [ ] **Step 3: Verify table counts**

```bash
spacetime sql "SELECT COUNT(*) FROM user_profile"
spacetime sql "SELECT COUNT(*) FROM collection"
spacetime sql "SELECT COUNT(*) FROM collection_card"
spacetime sql "SELECT COUNT(*) FROM server_config"
```

Expected: 1, 1, 2, 1 respectively.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: Phase 1 complete — infrastructure and SpacetimeDB module

All V1 tables and reducers implemented and manually tested.
Ready for Phase 2 (Python Worker) and Phase 3 (SvelteKit Frontend)."
```

---

## Phase 1 Completion Checklist

- [ ] SpacetimeDB and MeiliSearch running via podman-compose
- [ ] All 4 tables defined: user_profile, server_config, collection, collection_card
- [ ] Identity reducer: connectUser (upsert)
- [ ] Collection reducers: createCollection, updateCollection, deleteCollection
- [ ] CollectionCard reducers: addToCollection (with upsert), updateCollectionCard, removeFromCollection
- [ ] Admin reducer: setServerConfig
- [ ] Composite key utility for CollectionCard uniqueness
- [ ] Client bindings generated for frontend
- [ ] All reducers manually tested via spacetime call/sql
- [ ] Ownership validation on all user-data reducers

## Next Phase

Proceed to **Phase 2: Python Worker** — Scryfall bulk data ingestion and MeiliSearch indexing.
