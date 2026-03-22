# Spellbook V1 Phase 3: SvelteKit Frontend - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a SvelteKit frontend for searching MTG cards via MeiliSearch and managing collections via SpacetimeDB real-time subscriptions.

**Architecture:** SvelteKit + Svelte 5 (runes only) with Tailwind CSS v4 and dark mode default. MeiliSearch is queried directly from the browser using a read-only API key (no backend round-trip). SpacetimeDB WebSocket connection provides real-time collection data. Auth identity flows from Pangolin IAP headers through SvelteKit server hooks.

**Tech Stack:** SvelteKit 2, Svelte 5, TypeScript, Tailwind CSS v4, pnpm, MeiliSearch JS client, SpacetimeDB TypeScript SDK v2.0

**Spec:** `docs/superpowers/specs/2026-03-21-spellbook-v1-redesign-design.md` (Section 6: Frontend Architecture)

**Prerequisites:**
- Phase 1 complete (SpacetimeDB module published, bindings at `src/module_bindings/`)
- Phase 2 complete (MeiliSearch seeded with 106k+ cards)
- MeiliSearch running on port 7700 with data
- SpacetimeDB running on port 3000

---

## File Structure

```
frontend/
├── src/
│   ├── lib/
│   │   ├── components/
│   │   │   ├── cards/
│   │   │   │   ├── CardGrid.svelte          # Responsive grid of card images
│   │   │   │   ├── CardDetail.svelte         # Full card view + printing picker
│   │   │   │   └── CardQuickAdd.svelte       # Add-to-collection form
│   │   │   ├── search/
│   │   │   │   ├── SearchBar.svelte          # Debounced search input
│   │   │   │   ├── SearchFilters.svelte      # Color/rarity/type filters
│   │   │   │   └── SearchResults.svelte      # Search results container
│   │   │   ├── collections/
│   │   │   │   ├── CollectionList.svelte     # List user's collections + create
│   │   │   │   ├── CollectionView.svelte     # Cards in a single collection
│   │   │   │   └── CollectionStats.svelte    # Collection statistics
│   │   │   └── layout/
│   │   │       ├── Nav.svelte                # Top navigation bar
│   │   │       └── Shell.svelte              # Main layout wrapper
│   │   ├── spacetimedb/
│   │   │   ├── client.ts                     # SpacetimeDB connection manager
│   │   │   └── state.svelte.ts               # Reactive state from subscriptions
│   │   ├── search/
│   │   │   ├── meilisearch.ts                # MeiliSearch client (read-only key)
│   │   │   ├── types.ts                      # Card document types
│   │   │   └── filters.svelte.ts             # Filter state (runes)
│   │   └── utils/
│   │       └── debounce.ts                   # Debounce utility
│   ├── routes/
│   │   ├── +layout.svelte                    # App shell, SpacetimeDB init
│   │   ├── +layout.server.ts                 # Pass auth identity to client
│   │   ├── +page.svelte                      # Dashboard / home
│   │   ├── search/
│   │   │   └── +page.svelte                  # Card search page
│   │   └── collections/
│   │       ├── +page.svelte                  # List collections
│   │       └── [id]/
│   │           └── +page.svelte              # Single collection view
│   ├── hooks.server.ts                       # Read Pangolin auth headers
│   ├── app.html                              # HTML template (dark class)
│   ├── app.css                               # Tailwind + theme
│   └── app.d.ts                              # App-level type declarations
├── tests/
│   └── unit/
│       ├── debounce.test.ts
│       └── meilisearch.test.ts
├── svelte.config.js
├── vite.config.ts
├── tsconfig.json
├── package.json
├── Dockerfile
└── .env.example
```

---

### Task 1: Scaffold SvelteKit project with pnpm + Tailwind v4

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/svelte.config.js`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/src/app.html`
- Create: `frontend/src/app.css`
- Create: `frontend/src/app.d.ts`
- Create: `frontend/src/routes/+page.svelte`
- Create: `frontend/.env.example`
- Create: `frontend/.gitignore`
- Modify: `.env` (fix MeiliSearch search key)

- [ ] **Step 1: Fix MeiliSearch search key in .env**

The current `MEILISEARCH_SEARCH_KEY` in `.env` does not match MeiliSearch's actual default search key. Update it:

```bash
cd /home/kyle/CodingProjects/spellbook
# Get the correct default search key from MeiliSearch
MASTER_KEY=$(grep MEILI_MASTER_KEY .env | cut -d= -f2)
CORRECT_KEY=$(curl -s http://localhost:7700/keys \
  -H "Authorization: Bearer ${MASTER_KEY}" \
  | python3 -c "import sys,json; keys=json.load(sys.stdin)['results']; print(next(k['key'] for k in keys if k['name']=='Default Search API Key'))")
echo "Correct search key: ${CORRECT_KEY}"
```

Update the `MEILISEARCH_SEARCH_KEY` line in `.env` with the correct key. Also add the new frontend env vars:

```
# Frontend
PUBLIC_MEILISEARCH_URL=http://localhost:7700
PUBLIC_MEILISEARCH_SEARCH_KEY=<correct key from above>
PUBLIC_SPACETIMEDB_URL=ws://localhost:3000
PUBLIC_SPACETIMEDB_MODULE=spellbook
```

- [ ] **Step 2: Create package.json**

`frontend/package.json`:
```json
{
  "name": "spellbook-frontend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview",
    "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
    "test:unit": "vitest run",
    "lint": "prettier --check . && svelte-check --tsconfig ./tsconfig.json",
    "format": "prettier --write ."
  },
  "dependencies": {
    "meilisearch": "^0.44",
    "spacetimedb": "^2.0"
  },
  "devDependencies": {
    "@sveltejs/adapter-node": "^5",
    "@sveltejs/kit": "^2",
    "@sveltejs/vite-plugin-svelte": "^4",
    "@tailwindcss/vite": "^4",
    "prettier": "^3",
    "prettier-plugin-svelte": "^4",
    "svelte": "^5",
    "svelte-check": "^4",
    "tailwindcss": "^4",
    "typescript": "^5",
    "vite": "^6",
    "vitest": "^3"
  }
}
```

- [ ] **Step 3: Install dependencies**

```bash
cd /home/kyle/CodingProjects/spellbook/frontend
pnpm install
```

Expected: lockfile created, all packages installed.

- [ ] **Step 4: Create config files**

`frontend/svelte.config.js`:
```javascript
import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    alias: {
      $bindings: '../src/module_bindings',
    },
  },
};
```

`frontend/vite.config.ts`:
```typescript
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  test: {
    include: ['tests/unit/**/*.test.ts'],
  },
});
```

`frontend/tsconfig.json`:
```json
{
  "extends": "./.svelte-kit/tsconfig.json",
  "compilerOptions": {
    "allowJs": true,
    "checkJs": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "sourceMap": true,
    "strict": true,
    "moduleResolution": "bundler"
  }
}
```

- [ ] **Step 5: Create app.html, app.css, app.d.ts**

`frontend/src/app.html`:
```html
<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="%sveltekit.assets%/favicon.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
```

`frontend/src/app.css`:
```css
@import 'tailwindcss';

@custom-variant dark (&:where(.dark, .dark *));

@theme {
  --color-surface-900: oklch(0.15 0.01 260);
  --color-surface-800: oklch(0.2 0.01 260);
  --color-surface-700: oklch(0.28 0.01 260);
  --color-surface-600: oklch(0.35 0.015 260);
  --color-accent-500: oklch(0.75 0.15 85);
  --color-accent-400: oklch(0.82 0.12 85);
}

body {
  @apply bg-surface-900 text-gray-100 antialiased;
}
```

`frontend/src/app.d.ts`:
```typescript
declare global {
  namespace App {
    interface Locals {
      user: {
        accountId: string;
        username: string;
        email: string;
      };
    }
  }
}

export {};
```

- [ ] **Step 6: Create placeholder route and .env.example**

`frontend/src/routes/+page.svelte`:
```svelte
<h1 class="text-3xl font-bold p-8">Spellbook</h1>
<p class="px-8 text-gray-400">Phase 3 scaffold ready.</p>
```

`frontend/.env.example`:
```
PUBLIC_MEILISEARCH_URL=http://localhost:7700
PUBLIC_MEILISEARCH_SEARCH_KEY=change-me
PUBLIC_SPACETIMEDB_URL=ws://localhost:3000
PUBLIC_SPACETIMEDB_MODULE=spellbook
AUTH_SIGNING_SECRET=change-me
```

`frontend/.gitignore`:
```
node_modules/
.svelte-kit/
build/
.env
```

- [ ] **Step 7: Create a .env for local development**

`frontend/.env`:
```
PUBLIC_MEILISEARCH_URL=http://localhost:7700
PUBLIC_MEILISEARCH_SEARCH_KEY=<correct key from Step 1>
PUBLIC_SPACETIMEDB_URL=ws://localhost:3000
PUBLIC_SPACETIMEDB_MODULE=spellbook
AUTH_SIGNING_SECRET=<copy from root .env>
```

Copy the values from the root `.env` file.

- [ ] **Step 8: Verify dev server starts**

```bash
cd /home/kyle/CodingProjects/spellbook/frontend
pnpm dev --port 5173
```

Open `http://localhost:5173` in a browser (or curl). Expected: page renders with "Spellbook" heading on a dark background. Stop the dev server after verifying.

- [ ] **Step 9: Commit**

```bash
cd /home/kyle/CodingProjects/spellbook
git add frontend/ .env
git commit -m "feat: scaffold SvelteKit frontend with pnpm + Tailwind v4

Dark mode default, adapter-node for containerization,
SpacetimeDB bindings alias configured."
```

---

### Task 2: Layout shell and navigation

**Files:**
- Create: `frontend/src/lib/components/layout/Shell.svelte`
- Create: `frontend/src/lib/components/layout/Nav.svelte`
- Create: `frontend/src/routes/+layout.svelte`
- Create: `frontend/src/routes/search/+page.svelte`
- Create: `frontend/src/routes/collections/+page.svelte`

- [ ] **Step 1: Create Nav component**

`frontend/src/lib/components/layout/Nav.svelte`:
```svelte
<script lang="ts">
  import { page } from '$app/state';

  const links = [
    { href: '/', label: 'Home' },
    { href: '/search', label: 'Search' },
    { href: '/collections', label: 'Collections' },
  ];
</script>

<nav class="border-b border-surface-700 bg-surface-800">
  <div class="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
    <a href="/" class="text-lg font-bold text-accent-400">Spellbook</a>
    <div class="flex gap-4">
      {#each links as link}
        <a
          href={link.href}
          class="text-sm transition-colors {page.url.pathname === link.href
            ? 'text-accent-400'
            : 'text-gray-400 hover:text-gray-200'}"
        >
          {link.label}
        </a>
      {/each}
    </div>
  </div>
</nav>
```

- [ ] **Step 2: Create Shell component**

`frontend/src/lib/components/layout/Shell.svelte`:
```svelte
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Nav from './Nav.svelte';

  let { children }: { children: Snippet } = $props();
</script>

<div class="flex min-h-screen flex-col">
  <Nav />
  <main class="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
    {@render children()}
  </main>
</div>
```

- [ ] **Step 3: Create root layout**

`frontend/src/routes/+layout.svelte`:
```svelte
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Shell from '$lib/components/layout/Shell.svelte';
  import '../app.css';

  let { children }: { children: Snippet } = $props();
</script>

<Shell>
  {@render children()}
</Shell>
```

- [ ] **Step 4: Create placeholder route pages**

`frontend/src/routes/search/+page.svelte`:
```svelte
<h1 class="text-2xl font-bold">Card Search</h1>
<p class="mt-2 text-gray-400">Search will be implemented in Task 4.</p>
```

`frontend/src/routes/collections/+page.svelte`:
```svelte
<h1 class="text-2xl font-bold">Collections</h1>
<p class="mt-2 text-gray-400">Collections will be implemented in Task 7.</p>
```

- [ ] **Step 5: Update home page**

Replace `frontend/src/routes/+page.svelte`:
```svelte
<div class="space-y-6">
  <h1 class="text-3xl font-bold">Spellbook</h1>
  <p class="text-gray-400">Your Magic: The Gathering collection manager.</p>
  <div class="flex gap-4">
    <a
      href="/search"
      class="rounded-lg bg-accent-500 px-4 py-2 text-sm font-medium text-surface-900 hover:bg-accent-400"
    >
      Search Cards
    </a>
    <a
      href="/collections"
      class="rounded-lg border border-surface-600 px-4 py-2 text-sm font-medium text-gray-300 hover:border-surface-500"
    >
      My Collections
    </a>
  </div>
</div>
```

- [ ] **Step 6: Verify navigation works**

```bash
cd /home/kyle/CodingProjects/spellbook/frontend
pnpm dev --port 5173
```

Open `http://localhost:5173`. Verify:
- Dark background renders
- Nav bar shows Spellbook logo + Home/Search/Collections links
- Clicking links navigates between routes
- Active link is highlighted in gold/accent color

Stop dev server after verifying.

- [ ] **Step 7: Commit**

```bash
cd /home/kyle/CodingProjects/spellbook
git add frontend/src/
git commit -m "feat: add layout shell with navigation

Shell wrapper, Nav with active link highlighting,
placeholder route pages for search and collections."
```

---

### Task 3: MeiliSearch client and card types

**Files:**
- Create: `frontend/src/lib/search/types.ts`
- Create: `frontend/src/lib/search/meilisearch.ts`
- Create: `frontend/tests/unit/meilisearch.test.ts`

- [ ] **Step 1: Write tests for MeiliSearch client**

`frontend/tests/unit/meilisearch.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchCards, searchPrintings } from '$lib/search/meilisearch';

// Mock the meilisearch module
vi.mock('meilisearch', () => {
  const mockSearch = vi.fn();
  const mockIndex = vi.fn(() => ({ search: mockSearch }));
  return {
    MeiliSearch: vi.fn(() => ({ index: mockIndex })),
    __mockSearch: mockSearch,
    __mockIndex: mockIndex,
  };
});

describe('searchCards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array for empty query', async () => {
    const result = await searchCards('');
    expect(result.hits).toEqual([]);
  });

  it('returns empty array for single-char query', async () => {
    const result = await searchCards('a');
    expect(result.hits).toEqual([]);
  });
});

describe('searchPrintings', () => {
  it('returns empty array for empty oracle_id', async () => {
    const result = await searchPrintings('');
    expect(result.hits).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/kyle/CodingProjects/spellbook/frontend
pnpm test:unit
```

Expected: FAIL (modules not yet created).

- [ ] **Step 3: Create card types**

`frontend/src/lib/search/types.ts`:
```typescript
export interface CardDocument {
  id: string;
  oracle_id: string;
  name: string;
  lang: string;
  released_at: string;
  layout: string;
  mana_cost: string;
  cmc: number;
  type_line: string;
  oracle_text: string;
  colors: string[];
  color_identity: string[];
  keywords: string[];
  power: string;
  toughness: string;
  rarity: string;
  set_code: string;
  set_name: string;
  collector_number: string;
  image_uri: string;
  image_uri_small: string;
  is_foil_available: boolean;
  is_nonfoil_available: boolean;
  legalities: Record<string, string>;
  back_face_name?: string;
  back_face_image_uri?: string;
}

export interface SearchResult {
  hits: CardDocument[];
  query: string;
  processingTimeMs: number;
  estimatedTotalHits?: number;
}
```

- [ ] **Step 4: Create MeiliSearch client**

`frontend/src/lib/search/meilisearch.ts`:
```typescript
import { MeiliSearch } from 'meilisearch';
import {
  PUBLIC_MEILISEARCH_URL,
  PUBLIC_MEILISEARCH_SEARCH_KEY,
} from '$env/static/public';
import type { CardDocument, SearchResult } from './types';

const client = new MeiliSearch({
  host: PUBLIC_MEILISEARCH_URL,
  apiKey: PUBLIC_MEILISEARCH_SEARCH_KEY,
});

const distinctIndex = client.index('cards_distinct');
const allIndex = client.index('cards_all');

export async function searchCards(
  query: string,
  options?: { filter?: string[]; limit?: number; offset?: number },
): Promise<SearchResult> {
  if (!query || query.length < 2) {
    return { hits: [], query, processingTimeMs: 0 };
  }
  const result = await distinctIndex.search<CardDocument>(query, {
    limit: options?.limit ?? 20,
    offset: options?.offset ?? 0,
    filter: options?.filter,
  });
  return {
    hits: result.hits,
    query: result.query,
    processingTimeMs: result.processingTimeMs,
    estimatedTotalHits: result.estimatedTotalHits,
  };
}

export async function searchPrintings(oracleId: string): Promise<SearchResult> {
  if (!oracleId) {
    return { hits: [], query: '', processingTimeMs: 0 };
  }
  const result = await allIndex.search<CardDocument>('', {
    filter: [`oracle_id = "${oracleId}"`],
    limit: 100,
    sort: ['set_code:desc'],
  });
  return {
    hits: result.hits,
    query: '',
    processingTimeMs: result.processingTimeMs,
    estimatedTotalHits: result.estimatedTotalHits,
  };
}
```

- [ ] **Step 5: Run tests**

```bash
cd /home/kyle/CodingProjects/spellbook/frontend
pnpm test:unit
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
cd /home/kyle/CodingProjects/spellbook
git add frontend/src/lib/search/ frontend/tests/
git commit -m "feat: add MeiliSearch client with card types

Direct browser queries using read-only search key.
Two-index strategy: cards_distinct for search, cards_all for printings."
```

---

### Task 4: Search page with debounced input

**Files:**
- Create: `frontend/src/lib/utils/debounce.ts`
- Create: `frontend/tests/unit/debounce.test.ts`
- Create: `frontend/src/lib/search/filters.svelte.ts`
- Create: `frontend/src/lib/components/search/SearchBar.svelte`
- Create: `frontend/src/lib/components/cards/CardGrid.svelte`
- Create: `frontend/src/lib/components/search/SearchFilters.svelte`
- Create: `frontend/src/lib/components/search/SearchResults.svelte`
- Modify: `frontend/src/routes/search/+page.svelte`

- [ ] **Step 1: Write tests for debounce**

`frontend/tests/unit/debounce.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from '$lib/utils/debounce';

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllTimers();
  });

  it('calls function after delay', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 200);
    debounced('test');
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledWith('test');
  });

  it('resets timer on rapid calls', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 200);
    debounced('a');
    vi.advanceTimersByTime(100);
    debounced('b');
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('b');
  });

  it('only fires latest call', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 200);
    debounced('a');
    debounced('b');
    debounced('c');
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('c');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/kyle/CodingProjects/spellbook/frontend
pnpm test:unit
```

Expected: FAIL (debounce not yet implemented).

- [ ] **Step 3: Implement debounce**

`frontend/src/lib/utils/debounce.ts`:
```typescript
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /home/kyle/CodingProjects/spellbook/frontend
pnpm test:unit
```

Expected: All tests PASS.

- [ ] **Step 5: Create filter state**

`frontend/src/lib/search/filters.svelte.ts`:
```typescript
const COLORS = ['W', 'U', 'B', 'R', 'G'] as const;
const RARITIES = ['common', 'uncommon', 'rare', 'mythic'] as const;

export type Color = (typeof COLORS)[number];
export type Rarity = (typeof RARITIES)[number];

class SearchFilterState {
  selectedColors = $state<Set<Color>>(new Set());
  selectedRarities = $state<Set<Rarity>>(new Set());
  typeQuery = $state('');

  get activeFilterCount(): number {
    return this.selectedColors.size + this.selectedRarities.size + (this.typeQuery ? 1 : 0);
  }

  get meiliFilters(): string[] {
    const filters: string[] = [];
    if (this.selectedColors.size > 0) {
      const colorFilters = [...this.selectedColors].map((c) => `colors = "${c}"`);
      filters.push(`(${colorFilters.join(' OR ')})`);
    }
    if (this.selectedRarities.size > 0) {
      const rarityFilters = [...this.selectedRarities].map((r) => `rarity = "${r}"`);
      filters.push(`(${rarityFilters.join(' OR ')})`);
    }
    if (this.typeQuery) {
      filters.push(`type_line = "${this.typeQuery}"`);
    }
    return filters;
  }

  toggleColor(color: Color) {
    const next = new Set(this.selectedColors);
    if (next.has(color)) {
      next.delete(color);
    } else {
      next.add(color);
    }
    this.selectedColors = next;
  }

  toggleRarity(rarity: Rarity) {
    const next = new Set(this.selectedRarities);
    if (next.has(rarity)) {
      next.delete(rarity);
    } else {
      next.add(rarity);
    }
    this.selectedRarities = next;
  }

  clear() {
    this.selectedColors = new Set();
    this.selectedRarities = new Set();
    this.typeQuery = '';
  }
}

export const filters = new SearchFilterState();
export { COLORS, RARITIES };
```

- [ ] **Step 6: Create SearchBar component**

`frontend/src/lib/components/search/SearchBar.svelte`:
```svelte
<script lang="ts">
  let { value = $bindable(''), placeholder = 'Search cards...' }: {
    value: string;
    placeholder?: string;
  } = $props();
</script>

<div class="relative">
  <input
    type="text"
    bind:value
    {placeholder}
    class="w-full rounded-lg border border-surface-600 bg-surface-800 px-4 py-3
           text-gray-100 placeholder-gray-500 outline-none
           focus:border-accent-500 focus:ring-1 focus:ring-accent-500"
  />
  {#if value}
    <button
      onclick={() => (value = '')}
      class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
    >
      &times;
    </button>
  {/if}
</div>
```

- [ ] **Step 7: Create CardGrid component**

`frontend/src/lib/components/cards/CardGrid.svelte`:
```svelte
<script lang="ts">
  import type { CardDocument } from '$lib/search/types';

  let { cards, onselect }: {
    cards: CardDocument[];
    onselect?: (card: CardDocument) => void;
  } = $props();
</script>

{#if cards.length === 0}
  <p class="py-8 text-center text-gray-500">No cards to display.</p>
{:else}
  <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
    {#each cards as card (card.id)}
      <button
        type="button"
        onclick={() => onselect?.(card)}
        class="group overflow-hidden rounded-lg transition-transform hover:scale-105"
      >
        <img
          src={card.image_uri_small || card.image_uri}
          alt={card.name}
          loading="lazy"
          class="aspect-[5/7] w-full object-cover"
        />
      </button>
    {/each}
  </div>
{/if}
```

- [ ] **Step 8: Create SearchFilters component**

`frontend/src/lib/components/search/SearchFilters.svelte`:
```svelte
<script lang="ts">
  import { filters, COLORS, RARITIES, type Color, type Rarity } from '$lib/search/filters.svelte';

  const colorLabels: Record<Color, string> = {
    W: 'White',
    U: 'Blue',
    B: 'Black',
    R: 'Red',
    G: 'Green',
  };

  const colorClasses: Record<Color, string> = {
    W: 'bg-amber-100 text-amber-900',
    U: 'bg-blue-500 text-white',
    B: 'bg-gray-800 text-gray-200 border border-gray-600',
    R: 'bg-red-600 text-white',
    G: 'bg-green-600 text-white',
  };
</script>

<div class="space-y-4">
  <div>
    <p class="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">Colors</p>
    <div class="flex flex-wrap gap-2">
      {#each COLORS as color}
        <button
          onclick={() => filters.toggleColor(color)}
          class="rounded-full px-3 py-1 text-xs font-medium transition-opacity
                 {colorClasses[color]}
                 {filters.selectedColors.has(color) ? 'opacity-100' : 'opacity-40'}"
        >
          {colorLabels[color]}
        </button>
      {/each}
    </div>
  </div>

  <div>
    <p class="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">Rarity</p>
    <div class="flex flex-wrap gap-2">
      {#each RARITIES as rarity}
        <button
          onclick={() => filters.toggleRarity(rarity)}
          class="rounded-lg border px-3 py-1 text-xs font-medium capitalize transition-colors
                 {filters.selectedRarities.has(rarity)
                   ? 'border-accent-500 text-accent-400'
                   : 'border-surface-600 text-gray-500 hover:text-gray-300'}"
        >
          {rarity}
        </button>
      {/each}
    </div>
  </div>

  {#if filters.activeFilterCount > 0}
    <button
      onclick={() => filters.clear()}
      class="text-xs text-gray-500 hover:text-gray-300"
    >
      Clear filters
    </button>
  {/if}
</div>
```

- [ ] **Step 9: Create SearchResults component**

`frontend/src/lib/components/search/SearchResults.svelte`:
```svelte
<script lang="ts">
  import type { CardDocument } from '$lib/search/types';
  import CardGrid from '$lib/components/cards/CardGrid.svelte';

  let { hits, loading = false, query = '', onselect }: {
    hits: CardDocument[];
    loading?: boolean;
    query?: string;
    onselect?: (card: CardDocument) => void;
  } = $props();
</script>

{#if loading}
  <p class="py-8 text-center text-gray-500">Searching...</p>
{:else if query.length >= 2 && hits.length === 0}
  <p class="py-8 text-center text-gray-500">No results for "{query}"</p>
{:else}
  <CardGrid cards={hits} {onselect} />
{/if}
```

- [ ] **Step 10: Wire up search page**

Replace `frontend/src/routes/search/+page.svelte`:
```svelte
<script lang="ts">
  import { debounce } from '$lib/utils/debounce';
  import { searchCards } from '$lib/search/meilisearch';
  import { filters } from '$lib/search/filters.svelte';
  import type { CardDocument } from '$lib/search/types';
  import SearchBar from '$lib/components/search/SearchBar.svelte';
  import SearchFilters from '$lib/components/search/SearchFilters.svelte';
  import SearchResults from '$lib/components/search/SearchResults.svelte';

  let query = $state('');
  let hits = $state<CardDocument[]>([]);
  let loading = $state(false);
  let selectedCard = $state<CardDocument | null>(null);

  const doSearch = debounce(async (q: string, filterStrings: string[]) => {
    if (q.length < 2) {
      hits = [];
      loading = false;
      return;
    }
    loading = true;
    const result = await searchCards(q, { filter: filterStrings });
    hits = result.hits;
    loading = false;
  }, 250);

  $effect(() => {
    const q = query;
    const f = filters.meiliFilters;
    doSearch(q, f);
  });
</script>

<div class="space-y-6">
  <h1 class="text-2xl font-bold">Card Search</h1>

  <SearchBar bind:value={query} />

  <div class="flex flex-col gap-6 lg:flex-row">
    <aside class="w-full shrink-0 lg:w-56">
      <SearchFilters />
    </aside>

    <div class="flex-1">
      <SearchResults
        {hits}
        {loading}
        {query}
        onselect={(card) => (selectedCard = card)}
      />
    </div>
  </div>
</div>
```

Note: `selectedCard` is set up here but the CardDetail overlay will be wired in Task 5.

- [ ] **Step 11: Verify search works**

```bash
cd /home/kyle/CodingProjects/spellbook/frontend
pnpm dev --port 5173
```

Open `http://localhost:5173/search`. Type "Lightning Bolt". Expected:
- After 250ms debounce, card images appear in a responsive grid
- Clicking a color filter updates results
- Clear button on search bar resets input

Stop dev server.

- [ ] **Step 12: Commit**

```bash
cd /home/kyle/CodingProjects/spellbook
git add frontend/src/ frontend/tests/
git commit -m "feat: add search page with debounced MeiliSearch queries

SearchBar with 250ms debounce, CardGrid with responsive layout,
color and rarity filters. Queries cards_distinct index directly."
```

---

### Task 5: Card detail and printing picker

**Files:**
- Create: `frontend/src/lib/components/cards/CardDetail.svelte`
- Modify: `frontend/src/routes/search/+page.svelte` (add detail overlay)

- [ ] **Step 1: Create CardDetail component**

`frontend/src/lib/components/cards/CardDetail.svelte`:
```svelte
<script lang="ts">
  import type { CardDocument } from '$lib/search/types';
  import { searchPrintings } from '$lib/search/meilisearch';

  let { card, onclose }: {
    card: CardDocument;
    onclose: () => void;
  } = $props();

  let printings = $state<CardDocument[]>([]);
  let loadingPrintings = $state(true);
  let selectedPrinting = $state<CardDocument | null>(null);

  $effect(() => {
    loadingPrintings = true;
    searchPrintings(card.oracle_id).then((result) => {
      printings = result.hits;
      loadingPrintings = false;
    });
  });
</script>

<!-- Backdrop -->
<div
  class="fixed inset-0 z-40 bg-black/70"
  role="presentation"
  onclick={onclose}
  onkeydown={(e) => e.key === 'Escape' && onclose()}
></div>

<!-- Panel -->
<div class="fixed inset-y-0 right-0 z-50 w-full overflow-y-auto bg-surface-800 p-6 shadow-xl sm:max-w-2xl">
  <div class="mb-4 flex items-start justify-between">
    <div>
      <h2 class="text-xl font-bold">{card.name}</h2>
      <p class="text-sm text-gray-400">{card.type_line}</p>
    </div>
    <button onclick={onclose} class="text-gray-400 hover:text-gray-200">&times;</button>
  </div>

  <div class="flex flex-col gap-6 sm:flex-row">
    <!-- Main card image -->
    <div class="shrink-0">
      <img
        src={(selectedPrinting ?? card).image_uri}
        alt={(selectedPrinting ?? card).name}
        class="w-64 rounded-lg"
      />
      {#if card.back_face_image_uri}
        <img
          src={card.back_face_image_uri}
          alt={card.back_face_name ?? 'Back face'}
          class="mt-2 w-64 rounded-lg"
        />
      {/if}
    </div>

    <!-- Card info -->
    <div class="flex-1 space-y-4">
      <div>
        <p class="text-sm text-gray-400">Mana Cost</p>
        <p class="font-mono">{card.mana_cost || 'None'}</p>
      </div>
      <div>
        <p class="text-sm text-gray-400">Oracle Text</p>
        <p class="whitespace-pre-line text-sm">{card.oracle_text || 'No text.'}</p>
      </div>
      {#if card.power || card.toughness}
        <div>
          <p class="text-sm text-gray-400">P/T</p>
          <p>{card.power}/{card.toughness}</p>
        </div>
      {/if}
    </div>
  </div>

  <!-- Printings picker -->
  <div class="mt-8">
    <h3 class="mb-3 text-lg font-semibold">
      Printings
      {#if !loadingPrintings}
        <span class="text-sm font-normal text-gray-500">({printings.length})</span>
      {/if}
    </h3>

    {#if loadingPrintings}
      <p class="text-sm text-gray-500">Loading printings...</p>
    {:else}
      <div class="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {#each printings as printing (printing.id)}
          <button
            type="button"
            onclick={() => (selectedPrinting = printing)}
            class="overflow-hidden rounded-lg border-2 transition-colors
                   {selectedPrinting?.id === printing.id
                     ? 'border-accent-500'
                     : 'border-transparent hover:border-surface-600'}"
          >
            <img
              src={printing.image_uri_small || printing.image_uri}
              alt="{printing.name} ({printing.set_code})"
              loading="lazy"
              class="aspect-[5/7] w-full object-cover"
            />
            <div class="bg-surface-700 px-1.5 py-1 text-center text-xs">
              <span class="uppercase">{printing.set_code}</span>
              {#if printing.is_foil_available}
                <span class="text-accent-400"> F</span>
              {/if}
            </div>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>
```

- [ ] **Step 2: Wire CardDetail into search page**

Modify `frontend/src/routes/search/+page.svelte`, adding at the end of the file (before closing):

Add the import at the top of the `<script>`:
```typescript
  import CardDetail from '$lib/components/cards/CardDetail.svelte';
```

Add the overlay at the bottom of the template:
```svelte
{#if selectedCard}
  <CardDetail card={selectedCard} onclose={() => (selectedCard = null)} />
{/if}
```

- [ ] **Step 3: Verify card detail works**

```bash
cd /home/kyle/CodingProjects/spellbook/frontend
pnpm dev --port 5173
```

Open `http://localhost:5173/search`, search "Lightning Bolt", click a card. Expected:
- Detail panel slides in from right
- Card image, mana cost, oracle text, P/T displayed
- All printings loaded from cards_all index
- Clicking a printing updates the main image
- X button or backdrop click closes the panel

Stop dev server.

- [ ] **Step 4: Commit**

```bash
cd /home/kyle/CodingProjects/spellbook
git add frontend/src/
git commit -m "feat: add card detail panel with printing picker

Slide-out panel shows card info and all printings from cards_all index.
Queries by oracle_id from cards_all, sorted by set_code descending."
```

---

### Task 6: SpacetimeDB client and auth

**Files:**
- Create: `frontend/src/hooks.server.ts`
- Create: `frontend/src/routes/+layout.server.ts`
- Create: `frontend/src/lib/spacetimedb/client.ts`
- Create: `frontend/src/lib/spacetimedb/state.svelte.ts`
- Modify: `frontend/src/routes/+layout.svelte` (init SpacetimeDB)

- [ ] **Step 1: Create server hooks for Pangolin auth**

`frontend/src/hooks.server.ts`:
```typescript
import type { Handle } from '@sveltejs/kit';

/**
 * Read Pangolin IAP identity headers and make them available in locals.
 * Falls back to dev defaults when Pangolin is not in front (local dev).
 */
export const handle: Handle = async ({ event, resolve }) => {
  event.locals.user = {
    accountId: event.request.headers.get('Remote-Subject') || 'dev-user',
    username: event.request.headers.get('Remote-User') || 'Developer',
    email: event.request.headers.get('Remote-Email') || 'dev@localhost',
  };
  return resolve(event);
};
```

- [ ] **Step 2: Create layout server load**

`frontend/src/routes/+layout.server.ts`:
```typescript
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
  return { user: locals.user };
};
```

- [ ] **Step 3: Create SpacetimeDB reactive state**

`frontend/src/lib/spacetimedb/state.svelte.ts`:
```typescript
import type { Collection, CollectionCard, UserProfile } from '$bindings/types';

class SpacetimeState {
  collections = $state<Collection[]>([]);
  collectionCards = $state<CollectionCard[]>([]);
  userProfile = $state<UserProfile | null>(null);
  connected = $state(false);
  error = $state<string | null>(null);
}

export const state = new SpacetimeState();
```

- [ ] **Step 4: Create SpacetimeDB client**

`frontend/src/lib/spacetimedb/client.ts`:
```typescript
import { DbConnection, type SubscriptionHandle } from '$bindings';
import {
  PUBLIC_SPACETIMEDB_URL,
  PUBLIC_SPACETIMEDB_MODULE,
} from '$env/static/public';
import { state } from './state.svelte';

let connection: DbConnection | null = null;
let subscription: SubscriptionHandle | null = null;

export interface UserIdentity {
  accountId: string;
  username: string;
  email: string;
}

export function connect(identity: UserIdentity): void {
  if (connection) return;

  connection = DbConnection.builder()
    .withUri(PUBLIC_SPACETIMEDB_URL)
    .withModuleName(PUBLIC_SPACETIMEDB_MODULE)
    .onConnect((conn, _identity, _token) => {
      state.connected = true;
      state.error = null;

      // Register user identity
      conn.reducers.connectUser({
        accountId: identity.accountId,
        username: identity.username,
        email: identity.email,
      });

      // Subscribe to all user-visible tables
      subscription = conn
        .subscriptionBuilder()
        .subscribe([
          'SELECT * FROM user_profile',
          'SELECT * FROM collection',
          'SELECT * FROM collection_card',
        ])
        .onApplied(() => {
          // Initial data loaded, populate state from cache
          syncStateFromCache(conn);
        })
        .onError((err) => {
          state.error = `Subscription error: ${err.message}`;
        });
    })
    .onDisconnect(() => {
      state.connected = false;
      connection = null;
      subscription = null;
    })
    .onConnectError((err) => {
      state.error = `Connection failed: ${err.message}`;
      state.connected = false;
    })
    .build();

  // Set up table event handlers
  setupTableHandlers(connection);
}

function setupTableHandlers(conn: DbConnection): void {
  conn.db.collection.onInsert((_ctx, row) => {
    state.collections = [...state.collections, row];
  });
  conn.db.collection.onDelete((_ctx, row) => {
    state.collections = state.collections.filter((c) => c.id !== row.id);
  });
  conn.db.collection.onUpdate((_ctx, _oldRow, newRow) => {
    state.collections = state.collections.map((c) => (c.id === newRow.id ? newRow : c));
  });

  conn.db.collectionCard.onInsert((_ctx, row) => {
    state.collectionCards = [...state.collectionCards, row];
  });
  conn.db.collectionCard.onDelete((_ctx, row) => {
    state.collectionCards = state.collectionCards.filter(
      (cc) => cc.compositeId !== row.compositeId,
    );
  });
  conn.db.collectionCard.onUpdate((_ctx, _oldRow, newRow) => {
    state.collectionCards = state.collectionCards.map((cc) =>
      cc.compositeId === newRow.compositeId ? newRow : cc,
    );
  });

  conn.db.userProfile.onInsert((_ctx, row) => {
    state.userProfile = row;
  });
  conn.db.userProfile.onUpdate((_ctx, _oldRow, newRow) => {
    state.userProfile = newRow;
  });
}

function syncStateFromCache(conn: DbConnection): void {
  state.collections = [...conn.db.collection.iter()];
  state.collectionCards = [...conn.db.collectionCard.iter()];
  const profiles = [...conn.db.userProfile.iter()];
  state.userProfile = profiles[0] ?? null;
}

export function getConnection(): DbConnection | null {
  return connection;
}

export function disconnect(): void {
  if (subscription) {
    subscription.unsubscribe();
    subscription = null;
  }
  if (connection) {
    connection.disconnect();
    connection = null;
  }
  state.connected = false;
}
```

**Note:** The SpacetimeDB SDK v2.0 API uses `connection.reducers.reducerName({...})` for reducer calls and `connection.db.tableName.onInsert/onDelete/onUpdate(...)` for table event handlers. The `onConnect` callback receives `(conn, identity, token)` where `conn` is the `DbConnection` instance. Verify against SDK docs if the API has changed.

- [ ] **Step 5: Update layout to initialize SpacetimeDB**

Replace `frontend/src/routes/+layout.svelte`:
```svelte
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { LayoutData } from './$types';
  import Shell from '$lib/components/layout/Shell.svelte';
  import { connect, disconnect } from '$lib/spacetimedb/client';
  import { browser } from '$app/environment';
  import '../app.css';

  let { data, children }: { data: LayoutData; children: Snippet } = $props();

  $effect(() => {
    if (browser && data.user) {
      connect(data.user);
      return () => disconnect();
    }
  });
</script>

<Shell>
  {@render children()}
</Shell>
```

- [ ] **Step 6: Verify SpacetimeDB connection**

```bash
cd /home/kyle/CodingProjects/spellbook/frontend
pnpm dev --port 5173
```

Open browser console at `http://localhost:5173`. Expected:
- No connection errors (SpacetimeDB must be running on port 3000)
- If SpacetimeDB is not running, the error state should be set (visible in console)

Note: SpacetimeDB connection may fail if the module is not published. That is acceptable at this stage. The connection code is correct; integration testing happens in Task 11.

Stop dev server.

- [ ] **Step 7: Commit**

```bash
cd /home/kyle/CodingProjects/spellbook
git add frontend/src/
git commit -m "feat: add SpacetimeDB client with Pangolin auth integration

Server hooks read Remote-Subject/User/Email headers.
Client connects via WebSocket, subscribes to all tables,
maintains reactive state via Svelte 5 runes."
```

---

### Task 7: Collection management

**Files:**
- Create: `frontend/src/lib/components/collections/CollectionList.svelte`
- Create: `frontend/src/lib/components/collections/CollectionView.svelte`
- Create: `frontend/src/lib/components/collections/CollectionStats.svelte`
- Modify: `frontend/src/routes/collections/+page.svelte`
- Create: `frontend/src/routes/collections/[id]/+page.svelte`

- [ ] **Step 1: Create CollectionStats component**

`frontend/src/lib/components/collections/CollectionStats.svelte`:
```svelte
<script lang="ts">
  import type { CollectionCard } from '$bindings/types';

  let { cards }: { cards: CollectionCard[] } = $props();

  let totalCards = $derived(cards.reduce((sum, c) => sum + c.quantity, 0));
  let uniqueCards = $derived(cards.length);
  let foilCount = $derived(cards.filter((c) => c.isFoil).reduce((sum, c) => sum + c.quantity, 0));
</script>

<div class="flex gap-6 text-sm text-gray-400">
  <div>
    <span class="font-medium text-gray-200">{totalCards}</span> total
  </div>
  <div>
    <span class="font-medium text-gray-200">{uniqueCards}</span> unique
  </div>
  {#if foilCount > 0}
    <div>
      <span class="font-medium text-accent-400">{foilCount}</span> foil
    </div>
  {/if}
</div>
```

- [ ] **Step 2: Create CollectionList component**

`frontend/src/lib/components/collections/CollectionList.svelte`:
```svelte
<script lang="ts">
  import { state } from '$lib/spacetimedb/state.svelte';
  import { getConnection } from '$lib/spacetimedb/client';

  let showCreate = $state(false);
  let newName = $state('');
  let newDescription = $state('');

  function createCollection() {
    const conn = getConnection();
    if (!conn || !state.userProfile || !newName.trim()) return;

    conn.reducers.createCollection({
      accountId: state.userProfile.accountId,
      name: newName.trim(),
      description: newDescription.trim(),
    });

    newName = '';
    newDescription = '';
    showCreate = false;
  }

  function deleteCollection(collectionId: string) {
    const conn = getConnection();
    if (!conn || !state.userProfile) return;

    conn.reducers.deleteCollection({
      accountId: state.userProfile.accountId,
      collectionId,
    });
  }

  let ownedCollections = $derived(
    state.collections.filter((c) => c.ownerId === state.userProfile?.accountId),
  );

  function cardCount(collectionId: string): number {
    return state.collectionCards
      .filter((cc) => cc.collectionId === collectionId)
      .reduce((sum, cc) => sum + cc.quantity, 0);
  }
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h2 class="text-xl font-bold">My Collections</h2>
    <button
      onclick={() => (showCreate = !showCreate)}
      class="rounded-lg bg-accent-500 px-3 py-1.5 text-sm font-medium text-surface-900 hover:bg-accent-400"
    >
      {showCreate ? 'Cancel' : 'New Collection'}
    </button>
  </div>

  {#if showCreate}
    <form onsubmit={(e) => { e.preventDefault(); createCollection(); }} class="space-y-3 rounded-lg border border-surface-600 bg-surface-800 p-4">
      <input
        type="text"
        bind:value={newName}
        placeholder="Collection name"
        class="w-full rounded-lg border border-surface-600 bg-surface-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-accent-500"
      />
      <input
        type="text"
        bind:value={newDescription}
        placeholder="Description (optional)"
        class="w-full rounded-lg border border-surface-600 bg-surface-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-accent-500"
      />
      <button
        type="submit"
        disabled={!newName.trim()}
        class="rounded-lg bg-accent-500 px-3 py-1.5 text-sm font-medium text-surface-900 hover:bg-accent-400 disabled:opacity-50"
      >
        Create
      </button>
    </form>
  {/if}

  {#if ownedCollections.length === 0 && !showCreate}
    <p class="py-8 text-center text-gray-500">
      No collections yet. Create one to start tracking your cards.
    </p>
  {:else}
    <div class="space-y-2">
      {#each ownedCollections as coll (coll.id)}
        <a
          href="/collections/{coll.id}"
          class="flex items-center justify-between rounded-lg border border-surface-700 bg-surface-800 px-4 py-3 transition-colors hover:border-surface-600"
        >
          <div>
            <p class="font-medium">{coll.name}</p>
            {#if coll.description}
              <p class="text-sm text-gray-500">{coll.description}</p>
            {/if}
          </div>
          <div class="flex items-center gap-4">
            <span class="text-sm text-gray-400">{cardCount(coll.id)} cards</span>
            <button
              onclick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                if (confirm(`Delete "${coll.name}" and all its cards?`)) {
                  deleteCollection(coll.id);
                }
              }}
              class="text-sm text-red-400 hover:text-red-300"
            >
              Delete
            </button>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>
```

**Note:** Reducers are called via `conn.reducers.reducerName({...})` where `conn` is the `DbConnection` instance. The generated bindings export the reducer accessor map on the connection object.

- [ ] **Step 3: Create CollectionView component**

`frontend/src/lib/components/collections/CollectionView.svelte`:
```svelte
<script lang="ts">
  import type { Collection, CollectionCard } from '$bindings/types';
  import { state } from '$lib/spacetimedb/state.svelte';
  import { getConnection } from '$lib/spacetimedb/client';
  import CollectionStats from './CollectionStats.svelte';

  let { collection }: { collection: Collection } = $props();

  let cards = $derived(
    state.collectionCards.filter((cc) => cc.collectionId === collection.id),
  );

  function removeCard(compositeId: string) {
    const conn = getConnection();
    if (!conn || !state.userProfile) return;
    conn.reducers.removeFromCollection({
      accountId: state.userProfile.accountId,
      compositeId,
    });
  }

  function updateQuantity(card: CollectionCard, delta: number) {
    const conn = getConnection();
    if (!conn || !state.userProfile) return;
    const newQuantity = card.quantity + delta;
    if (newQuantity <= 0) {
      removeCard(card.compositeId);
      return;
    }
    conn.reducers.updateCollectionCard({
      accountId: state.userProfile.accountId,
      compositeId: card.compositeId,
      quantity: newQuantity,
      notes: card.notes,
    });
  }
</script>

<div class="space-y-4">
  <div>
    <h2 class="text-xl font-bold">{collection.name}</h2>
    {#if collection.description}
      <p class="text-sm text-gray-400">{collection.description}</p>
    {/if}
  </div>

  <CollectionStats {cards} />

  {#if cards.length === 0}
    <p class="py-8 text-center text-gray-500">
      No cards in this collection yet.
      <a href="/search" class="text-accent-400 hover:underline">Search cards</a> to add some.
    </p>
  {:else}
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {#each cards as card (card.compositeId)}
        <div class="group relative overflow-hidden rounded-lg">
          <img
            src={card.imageUri}
            alt={card.name}
            loading="lazy"
            class="aspect-[5/7] w-full object-cover"
          />
          <!-- Overlay on hover -->
          <div class="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/80 to-transparent opacity-0 transition-opacity group-hover:opacity-100">
            <div class="space-y-1 p-2">
              <p class="text-xs font-medium">{card.name}</p>
              <p class="text-xs text-gray-400">
                {card.setCode.toUpperCase()}
                {card.isFoil ? ' Foil' : ''}
                {card.condition}
              </p>
              <div class="flex items-center gap-2">
                <button
                  onclick={() => updateQuantity(card, -1)}
                  class="rounded bg-surface-700 px-2 py-0.5 text-xs hover:bg-surface-600"
                >-</button>
                <span class="text-xs font-medium">{card.quantity}</span>
                <button
                  onclick={() => updateQuantity(card, 1)}
                  class="rounded bg-surface-700 px-2 py-0.5 text-xs hover:bg-surface-600"
                >+</button>
              </div>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
```

- [ ] **Step 4: Wire up collection routes**

Replace `frontend/src/routes/collections/+page.svelte`:
```svelte
<script lang="ts">
  import CollectionList from '$lib/components/collections/CollectionList.svelte';
</script>

<CollectionList />
```

Create `frontend/src/routes/collections/[id]/+page.svelte`:
```svelte
<script lang="ts">
  import { page } from '$app/state';
  import { state } from '$lib/spacetimedb/state.svelte';
  import CollectionView from '$lib/components/collections/CollectionView.svelte';

  let collection = $derived(state.collections.find((c) => c.id === page.params.id));
</script>

{#if collection}
  <CollectionView {collection} />
{:else}
  <div class="py-8 text-center">
    <p class="text-gray-500">Collection not found.</p>
    <a href="/collections" class="mt-2 text-sm text-accent-400 hover:underline">
      Back to collections
    </a>
  </div>
{/if}
```

- [ ] **Step 5: Commit**

```bash
cd /home/kyle/CodingProjects/spellbook
git add frontend/src/
git commit -m "feat: add collection management pages

CollectionList with create/delete, CollectionView with card grid,
quantity controls, CollectionStats. Real-time via SpacetimeDB."
```

---

### Task 8: Add card to collection (CardQuickAdd)

**Files:**
- Create: `frontend/src/lib/components/cards/CardQuickAdd.svelte`
- Modify: `frontend/src/lib/components/cards/CardDetail.svelte` (add "Add to collection" section)

- [ ] **Step 1: Create CardQuickAdd component**

`frontend/src/lib/components/cards/CardQuickAdd.svelte`:
```svelte
<script lang="ts">
  import type { CardDocument } from '$lib/search/types';
  import { state } from '$lib/spacetimedb/state.svelte';
  import { getConnection } from '$lib/spacetimedb/client';

  let { card }: { card: CardDocument } = $props();

  let selectedCollectionId = $state('');
  let isFoil = $state(false);
  let condition = $state('NM');
  let quantity = $state(1);
  let feedback = $state<{ type: 'success' | 'error'; message: string } | null>(null);

  const conditions = ['NM', 'LP', 'MP', 'HP', 'DMG'] as const;

  let ownedCollections = $derived(
    state.collections.filter((c) => c.ownerId === state.userProfile?.accountId),
  );

  $effect(() => {
    if (ownedCollections.length > 0 && !selectedCollectionId) {
      selectedCollectionId = ownedCollections[0].id;
    }
  });

  function addToCollection() {
    const conn = getConnection();
    if (!conn || !state.userProfile || !selectedCollectionId) return;

    try {
      conn.reducers.addToCollection({
        accountId: state.userProfile.accountId,
        collectionId: selectedCollectionId,
        scryfallId: card.id,
        oracleId: card.oracle_id,
        name: card.name,
        setCode: card.set_code,
        imageUri: card.image_uri,
        isFoil,
        condition,
        quantity,
      });
      feedback = { type: 'success', message: `Added ${quantity}x ${card.name} to collection` };
      setTimeout(() => (feedback = null), 3000);
    } catch (err) {
      feedback = { type: 'error', message: `Failed to add card: ${err}` };
    }
  }
</script>

<div class="rounded-lg border border-surface-600 bg-surface-900 p-4">
  <h4 class="mb-3 text-sm font-semibold">Add to Collection</h4>

  {#if ownedCollections.length === 0}
    <p class="text-sm text-gray-500">
      No collections.
      <a href="/collections" class="text-accent-400 hover:underline">Create one first.</a>
    </p>
  {:else}
    <div class="space-y-3">
      <select
        bind:value={selectedCollectionId}
        class="w-full rounded-lg border border-surface-600 bg-surface-800 px-3 py-2 text-sm text-gray-100"
      >
        {#each ownedCollections as coll (coll.id)}
          <option value={coll.id}>{coll.name}</option>
        {/each}
      </select>

      <div class="flex gap-3">
        <select
          bind:value={condition}
          class="rounded-lg border border-surface-600 bg-surface-800 px-3 py-2 text-sm text-gray-100"
        >
          {#each conditions as cond}
            <option value={cond}>{cond}</option>
          {/each}
        </select>

        <label class="flex items-center gap-2 text-sm text-gray-300">
          <input type="checkbox" bind:checked={isFoil} disabled={!card.is_foil_available} />
          Foil
        </label>

        <input
          type="number"
          bind:value={quantity}
          min="1"
          max="99"
          class="w-16 rounded-lg border border-surface-600 bg-surface-800 px-2 py-2 text-center text-sm text-gray-100"
        />
      </div>

      <button
        onclick={addToCollection}
        disabled={!selectedCollectionId || !state.connected}
        class="w-full rounded-lg bg-accent-500 py-2 text-sm font-medium text-surface-900 hover:bg-accent-400 disabled:opacity-50"
      >
        Add to Collection
      </button>

      {#if feedback}
        <p class="text-sm {feedback.type === 'success' ? 'text-green-400' : 'text-red-400'}">
          {feedback.message}
        </p>
      {/if}
    </div>
  {/if}
</div>
```

- [ ] **Step 2: Add CardQuickAdd to CardDetail**

Modify `frontend/src/lib/components/cards/CardDetail.svelte`. Add import at the top of `<script>`:
```typescript
  import CardQuickAdd from './CardQuickAdd.svelte';
```

Add after the printings picker section (before the closing `</div>` of the panel):
```svelte
  <!-- Add to collection -->
  <div class="mt-6">
    <CardQuickAdd card={selectedPrinting ?? card} />
  </div>
```

- [ ] **Step 3: Verify add-to-collection flow**

```bash
cd /home/kyle/CodingProjects/spellbook/frontend
pnpm dev --port 5173
```

Open `http://localhost:5173/search`. Search for a card, click it, verify:
- CardQuickAdd form appears in the detail panel
- Collection dropdown shows user's collections (if SpacetimeDB is connected)
- Foil checkbox disabled when card has no foil printing
- Condition and quantity selectable
- "Add to Collection" button works (requires SpacetimeDB running)

Note: Full integration testing is in Task 11. At this stage, the UI should render correctly even if SpacetimeDB is not connected.

Stop dev server.

- [ ] **Step 4: Commit**

```bash
cd /home/kyle/CodingProjects/spellbook
git add frontend/src/
git commit -m "feat: add CardQuickAdd for adding cards to collections

Select collection, condition, foil status, quantity.
Calls addToCollection reducer via SpacetimeDB.
Success/error feedback with auto-dismiss."
```

---

### Task 9: Dashboard home page

**Files:**
- Modify: `frontend/src/routes/+page.svelte`

- [ ] **Step 1: Build dashboard page**

Replace `frontend/src/routes/+page.svelte`:
```svelte
<script lang="ts">
  import { state } from '$lib/spacetimedb/state.svelte';
  import CollectionStats from '$lib/components/collections/CollectionStats.svelte';

  let ownedCollections = $derived(
    state.collections.filter((c) => c.ownerId === state.userProfile?.accountId),
  );

  let totalCards = $derived(
    state.collectionCards.reduce((sum, c) => sum + c.quantity, 0),
  );
</script>

<div class="space-y-8">
  <div>
    <h1 class="text-3xl font-bold">
      {#if state.userProfile}
        Welcome, {state.userProfile.username}
      {:else}
        Spellbook
      {/if}
    </h1>
    <p class="mt-1 text-gray-400">Your Magic: The Gathering collection manager.</p>
  </div>

  <!-- Quick actions -->
  <div class="flex gap-4">
    <a
      href="/search"
      class="rounded-lg bg-accent-500 px-4 py-2 text-sm font-medium text-surface-900 hover:bg-accent-400"
    >
      Search Cards
    </a>
    <a
      href="/collections"
      class="rounded-lg border border-surface-600 px-4 py-2 text-sm font-medium text-gray-300 hover:border-surface-500"
    >
      My Collections ({ownedCollections.length})
    </a>
  </div>

  <!-- Overview -->
  {#if ownedCollections.length > 0}
    <div class="space-y-3">
      <h2 class="text-lg font-semibold">Your Collections</h2>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {#each ownedCollections as coll (coll.id)}
          {@const cards = state.collectionCards.filter((cc) => cc.collectionId === coll.id)}
          <a
            href="/collections/{coll.id}"
            class="rounded-lg border border-surface-700 bg-surface-800 p-4 transition-colors hover:border-surface-600"
          >
            <p class="font-medium">{coll.name}</p>
            <div class="mt-2">
              <CollectionStats {cards} />
            </div>
          </a>
        {/each}
      </div>
    </div>
  {:else if state.connected}
    <div class="rounded-lg border border-surface-700 bg-surface-800 p-8 text-center">
      <p class="text-gray-400">No collections yet.</p>
      <a href="/collections" class="mt-2 inline-block text-sm text-accent-400 hover:underline">
        Create your first collection
      </a>
    </div>
  {/if}

  {#if !state.connected}
    <p class="text-sm text-gray-500">
      Connecting to server...
      {#if state.error}
        <span class="text-red-400">{state.error}</span>
      {/if}
    </p>
  {/if}
</div>
```

- [ ] **Step 2: Commit**

```bash
cd /home/kyle/CodingProjects/spellbook
git add frontend/src/routes/+page.svelte
git commit -m "feat: add dashboard with collection overview

Shows welcome message, quick actions, collection cards
with stats. Displays connection status and errors."
```

---

### Task 10: Dockerfile and podman-compose integration

**Files:**
- Create: `frontend/Dockerfile`
- Modify: `podman-compose.yml`

- [ ] **Step 1: Create Dockerfile**

`frontend/Dockerfile`:
```dockerfile
FROM node:22-slim AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
# SpacetimeDB bindings are at ../src/module_bindings/ but we need them at build time.
# Copy them into the expected alias path.
COPY ../src/module_bindings/ ./module_bindings/

RUN pnpm build

FROM node:22-slim

WORKDIR /app

COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "build"]
```

**Important note:** The Dockerfile references `../src/module_bindings/` which is outside the build context. To handle this, either:
- (a) Set the build context to the repo root and adjust paths, or
- (b) Copy bindings into `frontend/` before building

For option (b), update `podman-compose.yml` to use the repo root as build context:

- [ ] **Step 2: Create a simpler Dockerfile that works with repo-root context**

Replace `frontend/Dockerfile`:
```dockerfile
FROM node:22-slim AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy bindings first (from repo root)
COPY src/module_bindings/ ./module_bindings/

# Copy frontend source
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY frontend/ .

# Override the bindings alias to point to local copy
RUN sed -i "s|'../src/module_bindings'|'./module_bindings'|" svelte.config.js

RUN pnpm build

FROM node:22-slim

WORKDIR /app

COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "build"]
```

- [ ] **Step 3: Add frontend service to podman-compose.yml**

Add the `frontend` service before the `volumes:` section in `/home/kyle/CodingProjects/spellbook/podman-compose.yml`:

```yaml
  frontend:
    build:
      context: .
      dockerfile: frontend/Dockerfile
    ports:
      - "5173:3000"
    environment:
      PUBLIC_MEILISEARCH_URL: http://meilisearch:7700
      PUBLIC_MEILISEARCH_SEARCH_KEY: ${MEILISEARCH_SEARCH_KEY}
      PUBLIC_SPACETIMEDB_URL: ws://spacetimedb:3000
      PUBLIC_SPACETIMEDB_MODULE: spellbook
      AUTH_SIGNING_SECRET: ${AUTH_SIGNING_SECRET}
    depends_on:
      - spacetimedb
      - meilisearch
    restart: unless-stopped
```

- [ ] **Step 4: Verify build**

```bash
cd /home/kyle/CodingProjects/spellbook
podman build -t spellbook-frontend -f frontend/Dockerfile .
```

Expected: Build completes successfully.

Note: If the build fails due to the bindings alias, adjust the `svelte.config.js` alias or the COPY paths. The key requirement is that the generated SpacetimeDB bindings are accessible at build time.

- [ ] **Step 5: Commit**

```bash
cd /home/kyle/CodingProjects/spellbook
git add frontend/Dockerfile podman-compose.yml
git commit -m "feat: add frontend Dockerfile and podman-compose service

Multi-stage build with pnpm, adapter-node output.
Build context at repo root to access SpacetimeDB bindings."
```

---

### Task 11: Integration smoke test

**Files:** None (runtime verification)

- [ ] **Step 1: Ensure all services are running**

```bash
cd /home/kyle/CodingProjects/spellbook
podman-compose up -d spacetimedb meilisearch
```

Wait a few seconds, then verify:

```bash
curl -s http://localhost:7700/health
# Expected: {"status":"available"}
```

- [ ] **Step 2: Run the frontend in dev mode**

```bash
cd /home/kyle/CodingProjects/spellbook/frontend
pnpm dev --port 5173
```

- [ ] **Step 3: Verify search works**

Open `http://localhost:5173/search`. Type "Lightning Bolt". Expected:
- Card images appear in responsive grid after debounce
- Clicking a card opens the detail panel
- Detail panel shows card info and printings from cards_all
- Color and rarity filters work

- [ ] **Step 4: Verify collection management (requires SpacetimeDB)**

If SpacetimeDB module is published and running:
1. Navigate to `/collections`
2. Create a new collection
3. Navigate to `/search`, find a card
4. Click the card, select a printing
5. Use CardQuickAdd to add it to the collection
6. Navigate to the collection, verify the card appears
7. Use +/- buttons to adjust quantity
8. Delete a card from the collection

If SpacetimeDB is not running, verify:
- The search page works independently (MeiliSearch only)
- The dashboard shows "Connecting to server..." message
- The collections page shows graceful empty state

- [ ] **Step 5: Run linting and type checks**

```bash
cd /home/kyle/CodingProjects/spellbook/frontend
pnpm check
pnpm lint
pnpm test:unit
```

Expected: All checks pass. Fix any issues.

- [ ] **Step 6: Final commit if any changes**

```bash
cd /home/kyle/CodingProjects/spellbook
git status
```

If there are uncommitted changes from fixes:
```bash
git add -A
git commit -m "chore: Phase 3 complete, SvelteKit frontend with search and collections

Card search via MeiliSearch, collection management via SpacetimeDB,
dark mode UI with Tailwind CSS v4. Ready for integration testing."
```

---

## Phase 3 Completion Checklist

- [ ] Frontend scaffolded with SvelteKit + Svelte 5 + pnpm + Tailwind v4
- [ ] Dark mode default (class-based on `<html>`)
- [ ] Layout shell with Nav and route navigation
- [ ] MeiliSearch search with 250ms debounce on cards_distinct index
- [ ] SearchFilters for color and rarity
- [ ] CardDetail panel with printing picker (queries cards_all by oracle_id)
- [ ] SpacetimeDB WebSocket connection with reactive state
- [ ] Pangolin auth headers read in hooks.server.ts
- [ ] Collection CRUD (create, list, view, delete)
- [ ] CardQuickAdd (add card to collection with foil/condition/quantity)
- [ ] Dashboard with collection overview and connection status
- [ ] Dockerfile with pnpm + adapter-node
- [ ] podman-compose service for frontend
- [ ] All unit tests pass
- [ ] svelte-check passes
