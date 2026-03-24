# Spellbook V1 Phase 3: SvelteKit Frontend - Implementation Plan

**Goal:** Build the Spellbook frontend from scratch with the "Arcane Library" design, searching MTG cards via MeiliSearch and managing collections via SpacetimeDB.

**Design:** `docs/ui-design-direction.md` (Arcane Library - dark fantasy TCG aesthetic, gold/amber accents, Cinzel + Crimson Pro typography)

**Spec:** `docs/superpowers/specs/2026-03-21-spellbook-v1-redesign-design.md`

**Known Issues:** `docs/known-issues/navigation-bugs.md` (every `$effect` doing async work MUST return a cleanup function with AbortController)

**Tech Stack:** SvelteKit 2, Svelte 5 (runes only), TypeScript, Tailwind CSS v4, Bits UI v2 (headless), pnpm, MeiliSearch JS client, SpacetimeDB TypeScript SDK v2.0

**Critical Rules:**
- AGENTS.md is the primary instruction file. Follow it.
- For Bits UI usage: check `docs/bits-ui.md` first, then follow links to the component docs
- For MeiliSearch usage: check `docs/meilisearch/README.md` first, then the specific file
- SSR is globally disabled (`export const ssr = false` in root `+layout.ts`)
- NO sans-serif fonts anywhere. Cinzel for headings, Crimson Pro for body, JetBrains Mono sparingly for technical data
- Every `$effect()` that does async work MUST return a cleanup function (AbortController + clearTimeout)
- Use `adapter-node` for containerization

**Prerequisites:**
- Phase 1 complete (SpacetimeDB module published, bindings at `src/module_bindings/`)
- Phase 2 complete (MeiliSearch seeded with cards)

---

## File Structure

```
frontend/
  src/
    app.html                          # HTML shell with Google Fonts
    app.css                           # Tailwind v4 + Arcane Library tokens
    app.d.ts                          # App-level types (App.Locals)
    hooks.server.ts                   # Pangolin IAP auth headers
    lib/
      components/
        layout/
          Nav.svelte                  # Top nav bar (Cinzel logo, gold active states)
          Shell.svelte                # Main layout wrapper
          OrnamentalDivider.svelte    # Gold line + diamond glyph divider
        cards/
          CardGrid.svelte             # Responsive grid with hover lift + gold glow
          CardDetail.svelte           # Side panel / dialog with full card info
          CardQuickAdd.svelte         # Add-to-collection form
          ManaCost.svelte             # Renders mana cost as colored circles
          RarityBadge.svelte          # Colored rarity dot
        search/
          SearchBar.svelte            # Styled search input (italic placeholder, gold focus)
          SearchFilters.svelte        # Collapsible color/rarity filters
          SearchResults.svelte        # Results container
        collections/
          CollectionList.svelte       # List collections as grimoire tiles
          CollectionView.svelte       # Single collection card grid
          CollectionStats.svelte      # Total/unique/foil counts
      search/
        meilisearch.ts                # MeiliSearch client (read-only key)
        types.ts                      # CardDocument, SearchResult types
        filters.svelte.ts             # Filter state (runes)
      spacetimedb/
        client.ts                     # SpacetimeDB connection manager
        state.svelte.ts               # Reactive state from subscriptions
      utils/
        debounce.ts                   # Debounce with cancel support
    routes/
      +layout.svelte                  # App shell, SpacetimeDB init
      +layout.ts                      # SSR disabled (export const ssr = false)
      +layout.server.ts               # Pass user identity to client
      +page.svelte                    # Dashboard / home
      search/
        +page.svelte                  # Card search page
      collections/
        +page.svelte                  # List collections
        [id]/
          +page.svelte                # Single collection view
  tests/
    __mocks__/
      env.ts                          # Mock env vars for tests
    unit/
      debounce.test.ts
      meilisearch.test.ts
      filters.test.ts
  svelte.config.js
  vite.config.ts
  tsconfig.json
  package.json
  Dockerfile
  .env.example
  .gitignore
  .prettierrc
```

---

### Task 1: Scaffold project + Arcane Library design foundation

**Files:** package.json, svelte.config.js, vite.config.ts, tsconfig.json, app.html, app.css, app.d.ts, .env.example, .gitignore, .prettierrc, +layout.ts, +page.svelte

- [ ] **Step 1: Create package.json**

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
    "bits-ui": "^2.16",
    "meilisearch": "^0.44",
    "spacetimedb": "^2.0"
  },
  "devDependencies": {
    "@sveltejs/adapter-node": "^5",
    "@sveltejs/kit": "^2",
    "@sveltejs/vite-plugin-svelte": "^5",
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

- [ ] **Step 2: Install dependencies with pnpm**

```bash
cd /home/kyle/CodingProjects/spellbook/frontend && pnpm install
```

- [ ] **Step 3: Create config files**

svelte.config.js: adapter-node, vitePreprocess, alias $bindings to ../src/module_bindings.
vite.config.ts: tailwindcss + sveltekit plugins, vitest config with test path aliases.
tsconfig.json: extends .svelte-kit/tsconfig.json, strict mode, bundler moduleResolution.

- [ ] **Step 4: Create app.html with Google Fonts**

```html
<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="%sveltekit.assets%/favicon.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700;900&family=Crimson+Pro:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
```

- [ ] **Step 5: Create app.css with Arcane Library design tokens**

```css
@import 'tailwindcss';

@theme {
  /* Backgrounds - warm near-black with purple cast */
  --color-void: #0d0b0f;
  --color-crypt: #141018;
  --color-stone: #1c1720;
  --color-slate: #251f2a;
  --color-mist: #332a3a;
  --color-smoke: #4a3f54;

  /* Gold/Amber accents */
  --color-gold-dim: #8a6a2a;
  --color-gold: #c4922a;
  --color-gold-bright: #e8b84b;
  --color-amber: #f5c842;
  --color-ochre: #d4830a;

  /* Mana colors */
  --color-mana-white: #f9faf0;
  --color-mana-blue: #3a6eb5;
  --color-mana-black: #4a3550;
  --color-mana-red: #c03030;
  --color-mana-green: #2a7a3a;
  --color-mana-colorless: #7a8a9a;

  /* Rarity */
  --color-rarity-common: #9aa0a6;
  --color-rarity-uncommon: #a8c4cc;
  --color-rarity-rare: #d4af37;
  --color-rarity-mythic: #d4521a;

  /* Text */
  --color-text-primary: #e8dfc8;
  --color-text-secondary: #a89878;
  --color-text-muted: #6a5a4a;
  --color-text-on-gold: #1a1208;

  /* Semantic */
  --color-success: #3a8a4a;
  --color-error: #8a2020;
  --color-warning: #8a6020;
  --color-info: #204878;

  /* Fonts */
  --font-display: 'Cinzel', serif;
  --font-body: 'Crimson Pro', serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  height: 100%;
}

body {
  background-color: var(--color-crypt);
  color: var(--color-text-primary);
  font-family: var(--font-body);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

- [ ] **Step 6: Create app.d.ts**

```typescript
declare global {
  namespace App {
    interface Locals {
      user: { accountId: string; username: string; email: string; };
    }
  }
}
export {};
```

- [ ] **Step 7: Create .env.example, .gitignore, .prettierrc, +layout.ts, placeholder +page.svelte**

.env.example with PUBLIC_MEILISEARCH_URL, PUBLIC_MEILISEARCH_SEARCH_KEY, PUBLIC_SPACETIMEDB_URL, PUBLIC_SPACETIMEDB_MODULE, AUTH_SIGNING_SECRET.

+layout.ts: `export const ssr = false;`

+page.svelte: Simple placeholder with "Spellbook" in Cinzel.

- [ ] **Step 8: Verify dev server starts** (`pnpm dev`)

---

### Task 2: Layout shell, navigation, and shared components

**Files:** Nav.svelte, Shell.svelte, OrnamentalDivider.svelte, ManaCost.svelte, RarityBadge.svelte, +layout.svelte

- [ ] **Step 1: Create OrnamentalDivider component**

The signature TCG divider: thin gold gradient line with centered diamond glyph.

- [ ] **Step 2: Create ManaCost component**

Renders a mana cost string like `{2}{W}{U}` as a row of colored circles. Each mana symbol is a small circle with the corresponding mana color background and the symbol text centered.

- [ ] **Step 3: Create RarityBadge component**

A small colored dot matching rarity: common (steel), uncommon (silver-blue), rare (gold), mythic (orange-red).

- [ ] **Step 4: Create Nav component**

56px top navigation bar per the Arcane Library design:
- Logo: Unicode sigil + "SPELLBOOK" in Cinzel, gold, with text-shadow glow
- Nav links: Search, Collections in Cinzel uppercase, gold underline on active
- Right: settings icon button, user avatar placeholder
- Background: --color-stone with 1px bottom border rgba(196, 146, 42, 0.3)
- Use `$app/state` for `page.url.pathname` to determine active link
- Links are `<a>` tags using SvelteKit client-side routing (href="/search", href="/collections")

IMPORTANT per navigation bug prevention: Nav links must be plain `<a>` tags. No onclick handlers that could swallow navigation. No programmatic goto().

- [ ] **Step 5: Create Shell component**

Wraps Nav + main content area. Full-height flex column layout.

- [ ] **Step 6: Create root +layout.svelte**

Imports app.css, renders Shell with children. Does NOT initialize SpacetimeDB yet (that's Task 5).

- [ ] **Step 7: Create placeholder search and collections route pages**

- [ ] **Step 8: Verify navigation works between routes**

---

### Task 3: MeiliSearch client, card types, and tests

**Files:** types.ts, meilisearch.ts, tests/__mocks__/env.ts, tests/unit/meilisearch.test.ts

- [ ] **Step 1: Write tests first (TDD)**

Tests for searchCards (empty query returns empty, single-char returns empty) and searchPrintings (empty oracle_id returns empty).

- [ ] **Step 2: Create CardDocument and SearchResult types**

CardDocument: id, oracle_id, name, lang, released_at, layout, mana_cost, cmc, type_line, oracle_text, colors[], color_identity[], keywords[], power?, toughness?, rarity, set_code, set_name, collector_number, image_uri, image_uri_small, is_foil_available, is_nonfoil_available, legalities, back_face_name?, back_face_image_uri?

- [ ] **Step 3: Create MeiliSearch client**

Two indexes: cards_distinct (search by name) and cards_all (printing picker by oracle_id). Uses PUBLIC_MEILISEARCH_URL and PUBLIC_MEILISEARCH_SEARCH_KEY from $env/static/public.

- [ ] **Step 4: Run tests, verify pass**

---

### Task 4: Search page with debounced input and Arcane Library styling

**Files:** debounce.ts, debounce.test.ts, filters.svelte.ts, filters.test.ts, SearchBar.svelte, SearchFilters.svelte, SearchResults.svelte, CardGrid.svelte, search/+page.svelte

- [ ] **Step 1: Write debounce tests, implement debounce with cancel support**

The debounce function MUST return an object with a `.cancel()` method so $effect cleanup can cancel pending calls.

- [ ] **Step 2: Write filter state tests, implement SearchFilterState**

Class with $state for selectedColors (Set<Color>), selectedRarities (Set<Rarity>), typeQuery. Computed meiliFilters getter.

- [ ] **Step 3: Create SearchBar component**

Styled per Arcane Library: Crimson Pro italic, gold focus ring, --color-crypt background, 1px gold border. Search icon on left. Clear button on right.

- [ ] **Step 4: Create SearchFilters component**

Collapsible sections with Cinzel uppercase headers. Mana color filter with colored circles (W/U/B/R/G/C). Rarity filter with colored dots. Uses Bits UI Collapsible for the section toggles. Clear filters button.

- [ ] **Step 5: Create CardGrid component**

Responsive grid (auto-fill, minmax 160px). Each card tile:
- Card image with aspect-[5/7], lazy loading
- Below image: card name (Cinzel xs), set code + rarity dot (Crimson Pro xs)
- Panel background: --color-stone, 1px gold border at ~22% opacity, 4px border-radius
- Hover: translateY(-4px), gold box-shadow glow, border brightens
- Selected: gold border (2px --color-gold-bright)
- Foil cards: CSS shimmer animation on hover
- Inset highlight: box-shadow inset 0 1px 0 rgba(255,255,255,0.04)

- [ ] **Step 6: Create SearchResults component**

Shows loading state, empty state, or CardGrid.

- [ ] **Step 7: Wire up search/+page.svelte**

CRITICAL - Navigation bug prevention: The search $effect MUST use AbortController and return a cleanup function:

```svelte
$effect(() => {
  const q = query;
  const f = filters.meiliFilters;
  const controller = new AbortController();
  const timer = setTimeout(async () => {
    if (q.length < 2) { hits = []; loading = false; return; }
    loading = true;
    try {
      const result = await searchCards(q, { filter: f });
      if (!controller.signal.aborted) { hits = result.hits; }
    } finally {
      if (!controller.signal.aborted) { loading = false; }
    }
  }, 250);
  return () => { clearTimeout(timer); controller.abort(); };
});
```

Layout: left filter panel (200-280px) + card results grid + card detail panel (when selected).

- [ ] **Step 8: Verify search works with MeiliSearch running**

---

### Task 5: SpacetimeDB client and auth

**Files:** hooks.server.ts, +layout.server.ts, client.ts, state.svelte.ts, update +layout.svelte

- [ ] **Step 1: Create hooks.server.ts**

Read Pangolin IAP headers (Remote-Subject, Remote-User, Remote-Email). Fallback to dev defaults.

- [ ] **Step 2: Create +layout.server.ts**

Pass locals.user to client via load function.

- [ ] **Step 3: Create SpacetimeDB reactive state (state.svelte.ts)**

SpacetimeState class with $state: collections, collectionCards, userProfile, connected, error.

- [ ] **Step 4: Create SpacetimeDB client (client.ts)**

connect(), disconnect(), getConnection(). Uses DbConnection builder with onConnect/onDisconnect/onConnectError. Sets up table handlers for collection, collectionCard, userProfile (onInsert, onDelete, onUpdate). Syncs from cache on subscription applied.

- [ ] **Step 5: Update +layout.svelte to init SpacetimeDB**

CRITICAL - Navigation bug prevention: Use proper cleanup:

```svelte
$effect(() => {
  if (browser && data.user) {
    connect(data.user);
    return () => disconnect();
  }
});
```

---

### Task 6: Card detail panel with printing picker

**Files:** CardDetail.svelte, update search/+page.svelte

- [ ] **Step 1: Create CardDetail component**

Uses Bits UI Dialog for accessibility (Dialog.Root, Dialog.Overlay, Dialog.Content). Styled per Arcane Library:
- Dialog overlay: rgba(13,11,15,0.85), backdrop blur
- Panel background: --color-stone, 1px gold border, slide-up animation
- Full card image (~65% height)
- Card name (Cinzel lg), type line (Crimson Pro italic)
- ManaCost component for mana cost display
- OrnamentalDivider between sections
- Oracle text (Crimson Pro), flavor text (italic, --text-secondary)
- P/T display for creatures
- Printing picker: queries cards_all by oracle_id, shows set code chips
- Condition selector, foil checkbox, quantity input
- "Add to Collection" primary CTA (gold gradient, Cinzel uppercase)

CRITICAL - Navigation bug prevention: The printing fetch $effect MUST use AbortController:

```svelte
$effect(() => {
  const controller = new AbortController();
  selectedPrinting = null;
  loadingPrintings = true;
  searchPrintings(card.oracle_id).then((result) => {
    if (!controller.signal.aborted) {
      printings = result.hits;
      loadingPrintings = false;
    }
  });
  return () => controller.abort();
});
```

- [ ] **Step 2: Wire into search page**

---

### Task 7: Collection management pages

**Files:** CollectionList.svelte, CollectionView.svelte, CollectionStats.svelte, CardQuickAdd.svelte, collections/+page.svelte, collections/[id]/+page.svelte

- [ ] **Step 1: Create CollectionStats**

Shows total cards, unique cards, foil count. Uses Crimson Pro.

- [ ] **Step 2: Create CollectionList**

Grimoire shelf: collections as large tiles with colored accent strip, Cinzel names, card count. Create form with gold CTA. Delete with confirmation. "+ New Collection" ghost tile.

- [ ] **Step 3: Create CollectionView**

Filter sidebar + card grid. Quantity +/- controls via hover overlay. Remove card. Uses SpacetimeDB reducers.

- [ ] **Step 4: Create CardQuickAdd**

Collection selector (Bits UI Select), condition dropdown, foil checkbox, quantity input, gold gradient "Add to Collection" button.

- [ ] **Step 5: Wire up collection routes**

---

### Task 8: Dashboard home page

**Files:** +page.svelte

- [ ] **Step 1: Build dashboard**

- Quick Search: large centered search input with subtle glow
- Recent Collections: 2-3 collection tiles
- Stats: total unique cards, total quantity, top colors
- Welcome message with username from SpacetimeDB userProfile
- Connection status display

---

### Task 9: Dockerfile and integration

**Files:** Dockerfile, update podman-compose.yml if needed

- [ ] **Step 1: Create Dockerfile**

Multi-stage: node:22-slim, pnpm, build with adapter-node, serve on port 3000. Build context at repo root to access SpacetimeDB bindings from src/module_bindings/.

- [ ] **Step 2: Verify build** (`pnpm build`)

---

### Task 10: Final verification

- [ ] **Step 1: Run all tests** (`pnpm test:unit`)
- [ ] **Step 2: Run type check** (`pnpm check`)
- [ ] **Step 3: Run lint** (`pnpm lint`)
- [ ] **Step 4: Verify dev server starts and pages render**
- [ ] **Step 5: Verify navigation between all routes works (no stuck pages)**

---

## Completion Checklist

- [ ] Arcane Library design tokens in app.css (all colors, fonts, no sans-serif)
- [ ] Cinzel + Crimson Pro typography throughout (no sans-serif anywhere)
- [ ] Gold/amber accent system, warm near-black backgrounds
- [ ] Top nav bar with Cinzel logo, gold active states
- [ ] Ornamental dividers between sections
- [ ] Card grid with hover lift + gold glow + foil shimmer
- [ ] Card detail with Bits UI Dialog, full card info, printing picker
- [ ] MeiliSearch search with proper $effect cleanup (AbortController)
- [ ] SpacetimeDB connection with proper lifecycle management
- [ ] Collection management (CRUD, card add/remove/quantity)
- [ ] All $effect() blocks return cleanup functions for async work
- [ ] No navigation bugs (test: type query, immediately click nav link)
- [ ] All unit tests pass
- [ ] svelte-check passes
- [ ] pnpm build succeeds
