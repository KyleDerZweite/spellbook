# Spellbook V1 Redesign — Design Specification

## 1. Overview

Spellbook is a self-hosted Magic: The Gathering collection management platform. This document specifies the complete redesign (V1) — scrapping the existing implementation in favor of a cleaner, more focused architecture.

### Why Redesign?

The previous implementation suffered from scope creep, architectural pain, and wrong priorities. V1 starts fresh with a clear MVP focus: **collection management with instant search**.

### Priority Stack

| Version | Scope | Description |
|---------|-------|-------------|
| **V1 (MVP)** | Collection management | Search all MTG cards instantly, pick exact printings/foils, manage collections |
| **V1.1** | Deck building | Standard & Commander decks built from your collection; multi-language support |
| **V2** | Mobile scanning | Phone camera OCR to add physical cards to collections |
| **V3** | Multiplayer | Shared card pools, real-time collaborative play |

### Out of Scope (V1)

- Price/value tracking
- Multi-game support (Pokemon, Yu-Gi-Oh)
- Social features
- Admin panel / user management UI
- Bulk CSV/text import (V1.1 candidate)

---

## 2. Architecture

### Approach: Hybrid — SpacetimeDB + Python Sidecar

```
┌─────────────────────────────────────────────────────┐
│                   Pangolin IAP                       │
│              (Auth + Reverse Proxy)                  │
└──────────────────────┬──────────────────────────────┘
                       │
         ┌─────────────┼─────────────────┐
         ▼                               ▼
┌─────────────────┐              ┌──────────────────┐
│   Frontend      │◄────────────►│  SpacetimeDB     │
│   SvelteKit     │  WebSocket   │  (TS Modules)    │
│   Svelte 5      │  real-time   │                  │
│   TypeScript    │  sync        │  Tables:         │
│                 │              │  - user_profiles │
│                 │              │  - collections   │
│                 │              │  - collection_   │
│                 │              │    cards          │
│                 │              │  - decks (v1.1)  │
│                 │              │  - deck_cards    │
│                 │              │    (v1.1)        │
└────────┬────────┘              └──────────────────┘
         │                               ▲
         │                               │ SDK
         ▼                               │
┌─────────────────┐              ┌──────────────────┐
│   MeiliSearch   │◄─────────────│  Python Worker   │
│  (Instant       │   index      │  (Data Pipeline) │
│   Search)       │   sync       │                  │
│                 │              │  - Scryfall bulk │
│  2 indexes:     │              │    ingestion     │
│  - cards_       │              │  - MeiliSearch   │
│    distinct     │              │    sync          │
│  - cards_all    │              │  - OCR/VLLM (V2) │
└─────────────────┘              └──────────────────┘
```

### Why This Approach

- **SpacetimeDB** handles app logic, real-time sync, and user data with TypeScript modules. No REST API to build — reducers ARE the API. V3 multiplayer ready from day 1.
- **MeiliSearch** handles instant card search with typo tolerance, faceted filtering, and sub-50ms response times. SpacetimeDB is not designed for full-text search.
- **Python Worker** handles heavy data pipeline work (Scryfall bulk ingestion, MeiliSearch index sync) and later OCR/VLLM for V2 scanning. SpacetimeDB's in-memory runtime should not process 2GB+ bulk imports.
- **SvelteKit + Svelte 5** provides a fast, reactive frontend with granular DOM updates — ideal for real-time SpacetimeDB subscriptions.
- **Pangolin IAP** handles all authentication externally. No auth logic inside Spellbook.

### Tech Stack Summary

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | SvelteKit + Svelte 5 + TypeScript + Tailwind CSS | UI, routing, SpacetimeDB subscriptions, MeiliSearch queries |
| App Logic & Data | SpacetimeDB v2.0 (TypeScript modules) | User data, collections, decks, real-time sync |
| Search | MeiliSearch | Instant card search, faceted filtering, typo tolerance |
| Data Pipeline | Python worker | Scryfall ingestion, MeiliSearch sync, future OCR/VLLM |
| Auth | Pangolin IAP + Zitadel OIDC | Authentication, identity injection |
| Deployment | Podman Compose | Container orchestration |

### Language Constraints

- **Allowed:** TypeScript, Python
- **Not used:** C, C++, C#, Java, Rust (user learning but not confident enough for production)
- SpacetimeDB v2.0 TypeScript module support eliminates the need for Rust

---

## 3. Data Model

### Design Principle: MeiliSearch Owns Card Catalog, SpacetimeDB Owns User Data

SpacetimeDB is an in-memory runtime. Storing 100k+ cards with full text, images, and metadata would bloat memory. MeiliSearch is the sole source of truth for card catalog data. SpacetimeDB only stores user-scoped data with denormalized card snapshots for display.

### SpacetimeDB Tables (TypeScript Modules)

```typescript
UserProfile: {
  account_id: string (PK)     // Pangolin Remote-Subject UUID — immutable
  username: string             // Remote-User — synced on each connection
  email: string                // Remote-Email — synced on each connection
  last_seen: timestamp
  // V1.1: preferred_language: string (default "en")
}

Collection: {
  id: string (PK)
  owner_id: string             // FK to UserProfile.account_id
  name: string
  description: string
  created_at: timestamp
}

CollectionCard: {
  id: string (PK)
  collection_id: string        // FK to Collection.id
  scryfall_id: string          // exact printing reference
  oracle_id: string            // groups "same card" across collection
  name: string                 // denormalized for display
  set_code: string             // denormalized for display
  image_uri: string            // denormalized — snapshot at add-time
  quantity: number
  is_foil: boolean
  condition: string            // "NM" | "LP" | "MP" | "HP" | "DMG"
  notes: string
  added_at: timestamp
}

// === V1.1 ===

Deck: {
  id: string (PK)
  owner_id: string
  name: string
  format: string               // "standard" | "commander" | etc.
  commander_scryfall_id: string?
  created_at: timestamp
}

DeckCard: {
  id: string (PK)
  deck_id: string              // FK to Deck.id
  scryfall_id: string
  quantity: number
  is_sideboard: boolean
  zone: string                 // "main" | "sideboard" | "maybe"
}
```

### Key Design Decisions

1. **`scryfall_id` is the universal card reference.** It uniquely identifies a specific printing (set + collector number + foil). "Llanowar Elves from Dominaria, foil" = one scryfall_id.

2. **`is_foil` lives on CollectionCard.** The same scryfall_id can exist in a collection as both foil and non-foil. The MeiliSearch card data indicates whether foil/nonfoil versions are available.

3. **Denormalized card data on CollectionCard.** Name, set_code, and image_uri are copied at add-time so collection views render from SpacetimeDB alone, without hitting MeiliSearch.

4. **Deck tables defined now, exposed in V1.1.** Schema stability — no migrations needed when V1.1 ships.

---

## 4. Search Architecture

### Two-Index Strategy in MeiliSearch

```
cards_distinct
├── distinctAttribute: "oracle_id"
├── Used by: search bar (primary search)
├── Returns: one result per unique card name
└── Shows: best/most recent printing as representative

cards_all
├── No distinct attribute
├── Used by: printing picker (after user clicks a card)
├── Filter: oracle_id = "<selected>"
└── Returns: every printing, set, foil variant
```

### MeiliSearch Index Configuration

- **Searchable attributes** (ranked): `name`, `type_line`, `oracle_text`, `set_name`
- **Filterable attributes**: `colors`, `color_identity`, `rarity`, `set_code`, `type_line`, `mana_cost`, `is_foil_available`, `lang`
- **Sortable attributes**: `name`, `rarity`, `set_code`, `collector_number`
- **Typo tolerance**: enabled
- **Stored attributes**: full card payload including image URIs, oracle text — everything the frontend needs to render card details

### User Interaction Flow

```
1. User types "Llanowar"
   → Frontend queries cards_distinct
   → MeiliSearch returns one "Llanowar Elves" (with image, oracle text, full details)

2. User clicks "Llanowar Elves"
   → Frontend queries cards_all, filter: oracle_id = "abc123"
   → MeiliSearch returns all 30+ printings with set, rarity, foil status, images

3. User picks "Dominaria, Foil, NM"
   → Frontend calls SpacetimeDB reducer: addToCollection(
       collection_id, scryfall_id, oracle_id, name, set_code, image_uri,
       is_foil, condition, quantity
     )
   → SpacetimeDB stores denormalized CollectionCard

4. Collection view renders from SpacetimeDB (real-time sync)
   → No MeiliSearch needed for collection display
```

### Frontend Queries MeiliSearch Directly

MeiliSearch has a built-in API key system. The frontend gets a search-only key (read-only, no write access). This skips a round-trip through any backend and keeps search sub-5ms.

---

## 5. Data Pipeline — Python Worker

### Startup Sequence (Progressive Loading)

```
1. Check SpacetimeDB / MeiliSearch card count
2. If below threshold → download Default Cards (504MB) from Scryfall
3. Transform & normalize (handle DFCs, split cards, adventures)
4. Seed BOTH MeiliSearch indexes (cards_distinct + cards_all) in parallel
5. App is usable ✓ (search works, collections work)
6. Background: download All Cards (2.3GB) → incremental update to both indexes
7. Background: download Rulings, Artwork metadata (if AGGRESSIVE_PRELOAD=true)
```

### Data Normalization

Scryfall bulk data contains complex card types that need normalization:

- **Double-faced cards (DFCs):** Store both faces, primary face as main searchable entry
- **Split cards (e.g., "Fire // Ice"):** Searchable by either half
- **Adventures:** Single entry, searchable by both card name and adventure name

### Scryfall Bulk Data Sources

| Dataset | Size | Purpose | When |
|---------|------|---------|------|
| Default Cards | 504 MB | English cards, quick seed | Startup (blocking) |
| All Cards | 2.31 GB | Every card, every language | Background after seed |
| Oracle Cards | 162 MB | One per oracle ID | Optional enrichment |
| Unique Artwork | 236 MB | All unique art | Optional (artwork preload) |
| Rulings | 23.8 MB | Card rulings | Optional enrichment |

Reference: https://scryfall.com/docs/api/bulk-data

### Periodic Sync

- Check Scryfall bulk data timestamps daily/weekly (configurable)
- Download if newer → incremental update to both MeiliSearch indexes
- SpacetimeDB does NOT need updating during card sync (it only stores user data)

### Atomic Sync Guarantee

- Python worker writes to `cards_distinct` and `cards_all` atomically (MeiliSearch supports task-based async updates — wait for both to complete)
- If MeiliSearch update fails → retry, log, alert — but collections still work (self-contained in SpacetimeDB with denormalized data)

### Configuration Toggles

```env
AGGRESSIVE_PRELOAD=true        # true: download All Cards + Artwork; false: Default Cards only
SYNC_INTERVAL=daily            # daily | weekly | manual
LANGUAGES=en                   # en | en,de,ja,... (V1.1: per-user override)
```

---

## 6. Frontend Architecture — SvelteKit + Svelte 5

### Svelte 5 Only (No Svelte 4 Patterns)

- `$state()` for reactive variables (no `writable()` stores)
- `$derived()` for computed values (no `$:` reactive declarations)
- `$effect()` for side effects (no `onMount` + reactive statements)
- `$props()` for component props
- `.svelte.ts` files for shared reactive state outside components

### Project Structure

```
frontend/
├── src/
│   ├── lib/
│   │   ├── spacetimedb/
│   │   │   ├── client.ts          # SpacetimeDB connection + auth
│   │   │   └── state.svelte.ts    # Reactive state from table subscriptions
│   │   ├── search/
│   │   │   ├── meilisearch.ts     # MeiliSearch client (read-only key)
│   │   │   └── filters.svelte.ts  # Filter state (runes)
│   │   └── types/
│   │       └── index.ts           # Shared types (auto-generated + custom)
│   ├── routes/
│   │   ├── +layout.svelte         # App shell, nav, SpacetimeDB init
│   │   ├── +page.svelte           # Dashboard / home
│   │   ├── search/
│   │   │   └── +page.svelte       # Card search (MeiliSearch)
│   │   ├── collections/
│   │   │   ├── +page.svelte       # List collections
│   │   │   └── [id]/
│   │   │       └── +page.svelte   # Single collection view
│   │   └── decks/                  # V1.1
│   │       ├── +page.svelte
│   │       └── [id]/
│   │           └── +page.svelte
│   ├── components/
│   │   ├── cards/
│   │   │   ├── CardGrid.svelte
│   │   │   ├── CardDetail.svelte
│   │   │   └── CardQuickAdd.svelte
│   │   ├── search/
│   │   │   ├── SearchBar.svelte
│   │   │   ├── SearchFilters.svelte
│   │   │   └── SearchResults.svelte
│   │   ├── collections/
│   │   │   ├── CollectionList.svelte
│   │   │   ├── CollectionView.svelte
│   │   │   └── CollectionStats.svelte
│   │   └── layout/
│   │       ├── Nav.svelte
│   │       ├── Sidebar.svelte
│   │       └── Shell.svelte
│   └── app.css                    # Tailwind + global styles
├── svelte.config.js
├── tailwind.config.js
└── package.json
```

### Key Patterns

**SpacetimeDB → Svelte 5 reactive state:**
```typescript
// state.svelte.ts
let collections = $state<Collection[]>([]);

export function getCollections() { return collections; }

export function bindSubscriptions(client: SpacetimeDBClient) {
  client.db.collection.onInsert((row) => { collections.push(row); });
  client.db.collection.onDelete((row) => {
    collections = collections.filter(c => c.id !== row.id);
  });
}
```

**MeiliSearch — direct from frontend:**
```typescript
// meilisearch.ts
export const searchClient = new MeiliSearch({
  host: MEILISEARCH_URL,
  apiKey: MEILISEARCH_SEARCH_KEY  // read-only
});
export const distinctIndex = searchClient.index('cards_distinct');
export const allIndex = searchClient.index('cards_all');
```

**Search with Svelte 5 runes:**
```svelte
<script lang="ts">
  import { distinctIndex } from '$lib/search/meilisearch';
  let query = $state('');
  let results = $state([]);

  $effect(() => {
    if (query.length > 1) {
      distinctIndex.search(query, { limit: 20 }).then(r => results = r.hits);
    } else {
      results = [];
    }
  });
</script>
```

### Styling

- Tailwind CSS, dark mode default
- Responsive card image grid (auto-sizing based on viewport)
- No component library dependency

---

## 7. Authentication & Identity

### Fully Externalized Auth

No auth logic inside Spellbook. Pangolin IAP + Zitadel OIDC handle everything.

### Identity Headers (Option 2: Subject ID)

Pangolin must be configured to inject the Zitadel `sub` claim:

| Header | Source | Purpose | Mutable? |
|--------|--------|---------|----------|
| `Remote-Subject` | Zitadel `sub` claim (UUID) | `owner_id` for all user data | No — immutable |
| `Remote-User` | Zitadel `preferred_username` | Display name | Yes |
| `Remote-Email` | Zitadel `email` claim | Display email | Yes |

**DEPLOYMENT PREREQUISITE:** Pangolin must be configured to map the Zitadel `sub` claim to `Remote-Subject`. Without this, user identity is tied to a mutable username.

### Connection Flow

```
1. Pangolin authenticates user (Zitadel OIDC)
2. Pangolin injects Remote-Subject, Remote-User, Remote-Email headers
3. SvelteKit server hook (hooks.server.ts) reads headers
4. Frontend passes identity to SpacetimeDB connection as credentials
5. SpacetimeDB onConnect reducer:
   - If account_id exists → update username, email, last_seen
   - If new → insert UserProfile
6. All subsequent reducers scope data by account_id
```

### Multi-User Readiness

Every table with user data has an `owner_id` field referencing `UserProfile.account_id`. Reducers always filter by the connected user's identity. Adding users later requires zero code changes.

### MeiliSearch Auth

MeiliSearch does not need user identity — card search is the same for everyone. A read-only API key is sufficient.

---

## 8. Deployment

### Podman Compose

4 containers, 2 persistent volumes:

```yaml
services:
  spacetimedb:
    image: clockworklabs/spacetimedb:latest
    ports: ["3000:3000"]
    volumes: [spacetimedb_data:/stdb]

  meilisearch:
    image: getmeili/meilisearch:latest
    ports: ["7700:7700"]
    environment:
      MEILI_MASTER_KEY: ${MEILI_MASTER_KEY}
      MEILI_ENV: production
    volumes: [meilisearch_data:/meili_data]

  frontend:
    build: { context: ./frontend }
    ports: ["3001:3000"]
    environment:
      SPACETIMEDB_URL: ws://spacetimedb:3000
      MEILISEARCH_URL: http://meilisearch:7700
      MEILISEARCH_SEARCH_KEY: ${MEILISEARCH_SEARCH_KEY}
    depends_on: [spacetimedb, meilisearch]

  worker:
    build: { context: ./worker }
    environment:
      SPACETIMEDB_URL: ws://spacetimedb:3000
      MEILISEARCH_URL: http://meilisearch:7700
      MEILI_MASTER_KEY: ${MEILI_MASTER_KEY}
      AGGRESSIVE_PRELOAD: ${AGGRESSIVE_PRELOAD:-true}
      SYNC_INTERVAL: ${SYNC_INTERVAL:-daily}
      LANGUAGES: ${LANGUAGES:-en}
    depends_on: [spacetimedb, meilisearch]

volumes:
  spacetimedb_data:
  meilisearch_data:
```

### Infrastructure Notes

- **Pangolin** sits in front of this stack (part of existing infrastructure, not in compose file)
- **No Redis, no PostgreSQL, no Celery** — dramatically simpler than the previous implementation
- **Storage:** 10-40GB depending on AGGRESSIVE_PRELOAD setting (card data + search index)

### Environment Configuration

```env
# MeiliSearch
MEILI_MASTER_KEY=<secret>              # Admin key for worker
MEILISEARCH_SEARCH_KEY=<read-only>     # Search-only key for frontend

# Data Pipeline
AGGRESSIVE_PRELOAD=true                # false = Default Cards only
SYNC_INTERVAL=daily                    # daily | weekly | manual
LANGUAGES=en                           # en | en,de,ja,...
```

---

## 9. V1.1 Notes (Deck Building + Language Support)

### Deck Building

- Standard and Commander format support
- Decks built from owned collection (CollectionCard references)
- Commander deck requires a commander_scryfall_id
- Zones: main, sideboard, maybe
- Tables already defined in V1 schema

### Per-User Language

- Add `preferred_language` field to `UserProfile` table
- Worker downloads additional languages: `LANGUAGES=en,de`
- MeiliSearch filter: `lang = <preferred_language>`
- Frontend i18n with Paraglide JS for static UI text

---

## 10. V2 Notes (Mobile Scanning)

- Python Worker gains OCR/VLLM capabilities
- Mobile companion app (Flutter or mobile web view)
- Scan → OCR → match against MeiliSearch → confirm → SpacetimeDB reducer
- No architectural changes needed — Python Worker is already in the stack

---

## 11. V3 Notes (Multiplayer)

- SpacetimeDB's real-time sync enables shared card pools and live play
- Drag-and-drop card interaction (svelte-dnd-action or native HTML5 DnD)
- SpacetimeDB subscriptions allow multiple users to see the same game state
- No database migration — SpacetimeDB is already the foundation
