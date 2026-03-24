# Spellbook UI Design Direction

**Date:** 2026-03-24
**Status:** Design Direction (pre-implementation)
**Scope:** V1 MVP — Search, Collection View, Card Detail

---

## 1. Design Philosophy: The Arcane Library

Spellbook should feel like a **private arcane library** — a wizard's vault of rare artifacts, catalogued with obsessive precision. Not a storefront. Not a dashboard. Not a SaaS app with a slightly dark background.

The guiding metaphor: you are browsing a collection of physical objects that carry weight, history, and power. Cards are artifacts, not rows. Collections are grimoires, not tables. Navigation is discovery, not tabs.

### What This Means Concretely

- **Cards are the heroes.** Every layout decision serves the card art. Cards should feel physical — they have depth, shadow, slight hover lift. They are never just thumbnails.
- **Dark is default, but warm.** Not the cold dead-black of a terminal. A dark that feels like candlelight on stone — warm shadow tones, amber glows, deep slate.
- **Ornament earns its place.** Decorative elements (borders, dividers, glows) exist to evoke the TCG world, not as decoration for decoration's sake. Each one should feel like it belongs on a card frame.
- **Data density with elegance.** MTG players are comfortable with dense information. Don't hide data behind excessive whitespace. But present it with visual hierarchy, not a spreadsheet.

### The Aesthetic Differentiation

The five mockup directions already explored (terminal, brutalist, cartographic, minimal, tactical HUD) all failed to commit to the TCG identity. The new direction is different from all of them:

- NOT terminal (no monospace type, no green-on-black)
- NOT brutalist (no raw borders, no aggressive edges)
- NOT generic dark SaaS (no cool gray #1a1a2e with blue accents)
- NOT parchment nostalgia (no warm sepia, no aged paper backgrounds)
- NOT minimalist (cards deserve ornamentation, visual richness)

The target: **MTG Arena's collection screen, translated to a web app** — dark, warm, ornamented, with gold/amber as the primary accent and card art as the dominant visual element.

---

## 2. Color Palette

### Primary Background Palette

These are not cool grays. They are warm, near-black tones that evoke dark stone, aged wood, and deep shadow.

```css
/* CSS Custom Properties */
--color-void:      #0d0b0f;   /* True near-black — fullscreen backdrops, modals */
--color-crypt:     #141018;   /* Primary page background */
--color-stone:     #1c1720;   /* Panel/card backgrounds */
--color-slate:     #251f2a;   /* Elevated panels, sidebar sections */
--color-mist:      #332a3a;   /* Hover states, subtle separators */
--color-smoke:     #4a3f54;   /* Disabled states, placeholder text backgrounds */
```

**Warm undertone principle:** Every "gray" in this palette has a slight purple-brown cast — never pure neutral. This prevents the sterile cold-gray look of generic dark apps and reads as "arcane" rather than "tech".

### Accent Palette — Gold/Amber Primary

MTG's most iconic aesthetic signal is gold. Rare cards have gold borders. Multicolor cards are gold. The game rewards excellence with gold. Amber/gold is the primary accent.

```css
--color-gold-dim:    #8a6a2a;   /* Subdued gold — inactive nav items, subtle borders */
--color-gold:        #c4922a;   /* Primary gold — links, active states, icons */
--color-gold-bright: #e8b84b;   /* Bright gold — hover, focus rings, highlights */
--color-amber:       #f5c842;   /* Maximum saturation — CTAs, selection indicators */
--color-ochre:       #d4830a;   /* Warm orange-gold — mythic rarity, special accents */
```

### Secondary Accents — Mana Colors

Used sparingly for mana pip indicators, color filter buttons, card frame accents. Not backgrounds — only small UI signals:

```css
--mana-white:   #f9faf0;   /* Barely off-white, slightly warm */
--mana-blue:    #3a6eb5;   /* Deep arcane blue */
--mana-black:   #4a3550;   /* Dark purple-black */
--mana-red:     #c03030;   /* Blood red */
--mana-green:   #2a7a3a;   /* Forest green */
--mana-colorless: #7a8a9a; /* Steel gray */
```

### Rarity Colors

Used on card borders, rarity badge indicators, and set symbol accents:

```css
--rarity-common:    #9aa0a6;   /* Muted steel — readable but understated */
--rarity-uncommon:  #a8c4cc;   /* Light steel blue-silver */
--rarity-rare:      #d4af37;   /* True gold */
--rarity-mythic:    #d4521a;   /* Red-orange bronze — distinct from gold */
```

### Text Palette

```css
--text-primary:    #e8dfc8;   /* Off-white with warm tint — primary body text */
--text-secondary:  #a89878;   /* Muted gold-tan — secondary labels */
--text-muted:      #6a5a4a;   /* Barely readable — timestamps, helper text */
--text-on-gold:    #1a1208;   /* Near-black for text on gold backgrounds */
--text-inverse:    #0d0b0f;   /* On light backgrounds */
```

### Semantic Colors

```css
--color-success:  #3a8a4a;   /* Forest green — "added to collection" */
--color-error:    #8a2020;   /* Dark red — errors */
--color-warning:  #8a6020;   /* Dark amber — warnings */
--color-info:     #204878;   /* Dark blue — informational */
```

---

## 3. Typography

### The MTG Typography Precedent

Magic: The Gathering uses:
- **Beleren** (bespoke, commissioned from Delve Fonts) — card names, display headings, packaging. It resembles Matrix Bold: a semi-condensed serif with asymmetric serifs, one side curved and one angular. Authoritative without being ornate.
- **MPlantin** (a Plantin variant) — rules text, body copy. A practical, tight serif optimized for small sizes.
- **Goudy Medieval** (historical) — early card names. Too illegible at small sizes, replaced.

### Recommended Font Stack

#### Display / Headings — `Cinzel`

**Cinzel** (Google Fonts, free) is the closest freely available font to Beleren in character. Inspired by first-century Roman inscriptions, it has classical proportions, all-caps majuscule letterforms, and a commanding presence. It evokes ancient power without being silly "fantasy" typeface. Used for: page titles, collection names, section headers, card names in detail view.

```css
font-family: 'Cinzel', serif;
/* Weights: 400 (Regular), 600 (SemiBold), 700 (Bold), 900 (Black) */
/* All-caps. Never use lowercase Cinzel — it lacks lowercase. */
```

**Alternative for sub-headers:** `Cinzel Decorative` (same family, more ornate — use only for major section titles, logo-level treatment, not running text).

#### Body / UI — `Crimson Pro`

**Crimson Pro** (Google Fonts, free) is an old-style serif with excellent screen legibility at 14-16px. Inspired by classical book typography (Tschichold, Slimbach), it has the right historical weight without feeling like a modern web app. Used for: card oracle text, filter labels, collection stats, helper text, most UI copy.

```css
font-family: 'Crimson Pro', serif;
/* Weights: 300, 400 (regular), 500, 600 (semi-bold), 700 */
/* Has italic variants — use for flavor text on cards */
```

**Why not Inter, Space Grotesk, or Geist?** These are modern sans-serifs that immediately read as "startup SaaS app." They destroy the TCG atmosphere. Every card game that has stood the test of time — Magic, Hearthstone, Gwent — uses serif or semi-serif typography because serifs evoke physical print, tradition, and weight.

#### Monospace / Technical (Limited Use) — `JetBrains Mono`

For: card collector numbers, set codes, quantity inputs, data that benefits from fixed-width alignment. Use sparingly — this is not a terminal app. Maximum use: inline code-like snippets (`DOM`, `DMG`, `NM`), never for running text.

### Type Scale

```css
/* Major heading — page titles, collection names */
--text-2xl: clamp(1.75rem, 3vw, 2.5rem);   /* Cinzel, weight 700 */

/* Section titles, card names in detail view */
--text-xl: clamp(1.25rem, 2vw, 1.75rem);    /* Cinzel, weight 600 */

/* Panel headers, filter group labels */
--text-lg: 1.125rem;                          /* Cinzel, weight 400 */

/* Primary body, card oracle text */
--text-base: 1rem;                            /* Crimson Pro, weight 400 */

/* Secondary labels, metadata */
--text-sm: 0.875rem;                          /* Crimson Pro, weight 400 */

/* Tertiary — timestamps, helper, captions */
--text-xs: 0.75rem;                           /* Crimson Pro, weight 300 */
```

### Typography Rules

1. **Cinzel is always sentence case or title case, never all-lowercase** — it has no lowercase glyphs.
2. **Flavor text is italic Crimson Pro** at `--text-sm`, `--text-secondary` color, with no quotes. It should look like card flavor text.
3. **Card name on card thumbnail:** Use Cinzel at `--text-xs` if overlaid, or `--text-sm` if in a caption row below.
4. **Number/quantity badges:** JetBrains Mono, small, monospaced, in a pill shape. Never Cinzel for numbers.
5. **Never mix Cinzel with a sans-serif** in close proximity — the contrast is jarring. Cinzel + Crimson Pro is the only permitted pairing.

---

## 4. Layout Patterns

### Overall Shell

```
┌─────────────────────────────────────────────────┐
│  NAV BAR (top, full-width, ~56px)               │
│  [Logo] [Search] [Collections] [Settings] [User] │
├───────────────────────────────────────────────┬─┤
│                                               │ │
│  MAIN CONTENT AREA                            │ │
│  (full-height scrollable, takes remaining     │ │
│   viewport height)                            │ │
│                                               │ │
└───────────────────────────────────────────────┴─┘
```

**No sidebar navigation.** A persistent left sidebar is a corporate pattern — it looks like Slack or GitHub. Instead:
- Top navigation bar with minimal links
- Context-specific left filter panels on search/collection pages (collapsible)
- Navigation should feel like the hub of a magical tome, not a CRM

### Page: Search (`/search`)

The search page is where users spend most of their time. It needs to handle a lot of information density without feeling overwhelming.

```
┌────────────────────────────────────────────────────────────────┐
│ NAV BAR                                                         │
├──────────────────────┬─────────────────────────────────────────┤
│ FILTER PANEL (280px) │ SEARCH RESULTS + CARD DETAIL (flex)     │
│                      │                                         │
│ [Search input]       │ ┌───────────────────┐ ┌─────────────┐  │
│ ─────────────────    │ │  RESULTS GRID     │ │ CARD DETAIL  │  │
│ Colors               │ │  4-5 cols auto    │ │ (when card   │  │
│ ○ W  ○ U  ○ B       │ │  responsive       │ │  selected)   │  │
│ ○ R  ○ G  ○ C       │ │                   │ │              │  │
│ ─────────────────    │ │  [card][card]...  │ │  [big art]   │  │
│ Rarity               │ │  [card][card]...  │ │  name        │  │
│ ○ Common             │ │                   │ │  type        │  │
│ ○ Uncommon           │ │                   │ │  oracle text │  │
│ ○ Rare               │ │                   │ │  printings   │  │
│ ○ Mythic             │ │                   │ │  [Add btn]   │  │
│ ─────────────────    │ └───────────────────┘ └─────────────┘  │
│ Type                 │                                         │
│ ─────────────────    │                                         │
│ Set                  │                                         │
└──────────────────────┴─────────────────────────────────────────┘
```

**Card detail panel:** Opens to the right when a card is clicked. Does not navigate away. The card art dominates — at least 60% of the panel height. Below it: name (Cinzel), type line, mana cost with colored pips, oracle text (Crimson Pro italic for flavor), then the printing selector and Add-to-Collection action.

**Mobile:** Filter panel slides up from bottom as a sheet. Card detail becomes a modal.

### Page: Collections (`/collections`)

The collections list page uses a **grimoire shelf** metaphor: collections are displayed as large cards/tomes, not a table.

```
┌─────────────────────────────────────────────────────────┐
│ My Collections                          [+ New]         │
│ ─────────────────────────────────────────────────────── │
│                                                         │
│  ┌───────────────┐  ┌───────────────┐  ┌─────────────┐ │
│  │ [art mosaic]  │  │ [art mosaic]  │  │    + New     │ │
│  │               │  │               │  │  Collection  │ │
│  │ Commander     │  │ Legacy Cube   │  │              │ │
│  │ 2,847 cards   │  │ 540 cards     │  │              │ │
│  │ Updated 2d ago│  │ Updated 1w ago│  │              │ │
│  └───────────────┘  └───────────────┘  └─────────────┘ │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

Collection cards use a **4-card art mosaic** as the background — the top 4 cards in the collection rendered as a 2x2 grid background, blurred/darkened slightly, with the collection name and stats overlaid. This immediately communicates "this is card-centric content" without loading all cards.

### Page: Collection Detail (`/collections/[id]`)

```
┌──────────────────────────────────────────────────────────────┐
│ Commander Staples                    [Edit] [Export] [+ Add] │
│ 2,847 cards across 312 unique cards                          │
├──────────────────────┬───────────────────────────────────────┤
│ FILTER/SORT (260px)  │ COLLECTION GRID                       │
│                      │                                       │
│ [search collection]  │  ──── Sorted by: Name ────            │
│ ─────────────────    │                                       │
│ Sort by:             │  [card][card][card][card][card][card] │
│ ○ Name               │  [card][card][card][card][card][card] │
│ ○ Color              │  ...                                  │
│ ○ CMC                │                                       │
│ ○ Rarity             │  (quantity badges on each card)       │
│ ○ Date Added         │  (foil shimmer on foil cards)         │
│ ─────────────────    │                                       │
│ View:                │                                       │
│ [Grid] [List]        │                                       │
└──────────────────────┴───────────────────────────────────────┘
```

**List view** (for serious collectors): Tabular but with card art thumbnails, styled with the same dark palette. Think "Moxfield's list view but with character." Each row has a left-aligned small card image thumbnail, then name, type, set, foil/condition badges, quantity control.

### Dashboard / Home (`/`)

Minimal — this is not a homepage for new users; this is the landing after login. Shows:
- **Quick Search** — large, centered, with a subtle arcane particle or glow behind it
- **Recent Collections** — 2-3 collection cards
- **Stats at a glance** — total unique cards, total quantity, top colors in collection

---

## 5. Navigation Style

### What NOT to Do

- No persistent left sidebar (reads as corporate app)
- No breadcrumb trails (reads as e-commerce or documentation site)
- No floating action buttons (reads as mobile Material Design)
- No mega-menus (reads as marketing site)

### The Approach: Minimal Arcane Top Bar

A slim (~56px) top navigation bar with:

```
[⚡ SPELLBOOK]          [Search]  [Collections]              [⚙] [Avatar]
```

- **Logo:** Small lightning/rune icon + "SPELLBOOK" in Cinzel. The logo should evoke a sigil — not literal card art.
- **Nav links:** 2-3 maximum. Rendered as text with a bottom-border underline on active, never tabs or pills. Active state: `--color-gold-bright` with a subtle glow.
- **Right zone:** Settings gear, user avatar (circular, with a faint gold ring).

The nav bar itself: `background: --color-stone`, with a very subtle bottom border using `--color-gold-dim` at 30% opacity. No drop shadow — the transition between nav and content should feel seamless, like one continuous dark surface.

### Context Actions

Instead of a sidebar with contextual actions, use **inline action bars** within each page. On the collection detail page, a slim action bar sits above the card grid: "Add Cards | Edit Collection | Export". These should look like carved stone buttons — slightly embossed, with an inset shadow.

### Mobile Navigation

Hamburger menu that slides in from the right as a full-height panel. The panel background is `--color-void` with a vertical column of links in Cinzel. A faint ornamental divider (thin horizontal line with a diamond glyph at center) separates sections.

---

## 6. Card Display Patterns

Cards are the core UI element. Every other design decision radiates outward from how cards are displayed.

### Card Thumbnail (Grid View)

The standard Scryfall image format is 488×680px (portrait). Cards in grids should preserve this 0.718 aspect ratio.

```
Grid column widths:
- Default:  ~160px wide  (comfortable browsing, shows 5-7 per row on 1280px)
- Dense:    ~120px wide  (show more, less detail — power user option)
- Comfort:  ~200px wide  (fewer cards, larger art)
```

**Card thumbnail anatomy:**
```
┌─────────────────┐
│                 │
│  [CARD IMAGE]   │  ← Full Scryfall art, no cropping
│                 │
│  ─────────────  │  ← Barely-visible separator
│  Card Name      │  ← Cinzel xs, --text-primary
│  Set · Rarity ● │  ← Crimson Pro xs, --text-secondary + rarity color dot
└─────────────────┘
```

**Hover state:** Card lifts (+4px translateY), gains a subtle gold outer glow (box-shadow with `--color-gold-dim` at 40% opacity, 8px spread). The shadow on the bottom deepens, selling the physical lift. This is the single most important interaction — cards must feel physical when hovered.

**Selected state:** Gold border (2px `--color-gold-bright`), glow intensifies.

**In-collection indicator (on search page):** A small badge in the top-right corner — a dark circle with a checkmark or quantity number. Never covers the card art substantially.

**Foil treatment:** A CSS `background: linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.15) 50%, transparent 60%)` animated shimmer overlay, activated on hover or as a subtle idle animation. Not overdone — just enough to communicate "foil" at a glance.

### Card in List View

For collection detail list view, each row:
```
┌──────────────────────────────────────────────────────────────────┐
│ [art thumbnail 40x56px] Name              Set  Foil  NM  × 2    │
│                          Type line        Code  ○     ●  [−][+] │
└──────────────────────────────────────────────────────────────────┘
```

Rows alternate between `--color-stone` and `--color-crypt` backgrounds (very subtle). Hover: row background goes to `--color-mist`.

### Card Detail Panel / Modal

This is where the card truly shines. Full card art takes up ~65% of the panel height. Below it, a contained information panel styled as a **card frame**:

```
┌────────────────────────────────┐
│                                │
│     [FULL CARD ART - 65%]      │
│                                │
├────────────────────────────────┤
│  Llanowar Elves          {G}   │  ← Name (Cinzel lg) + Mana cost
│  Creature — Elf Druid          │  ← Type (Crimson Pro, italic)
│  ─────────────────────────     │  ← Ornamental divider
│  {T}: Add {G}.                 │  ← Oracle text (Crimson Pro)
│                                │
│  "They channel the Llanowar..." │  ← Flavor (italic, --text-secondary)
│  ─────────────────────────     │
│  Power: 1 / Toughness: 1       │
│                                │
│  ══ PRINTINGS ══               │  ← Section header (Cinzel xs)
│  [DOM 2018] [M19] [CMR] ...    │  ← Printing chips, scrollable
│                                │
│  Condition: [NM ▾]  Foil: [☐]  │
│  Qty: [1]                      │
│  [Add to Collection]           │  ← Primary CTA button
└────────────────────────────────┘
```

The panel background is `--color-stone` with a thin `--color-gold-dim` border. The name/type section has a very subtle top-border ornamental divider. The CTA button is the boldest element on the page.

---

## 7. Visual Elements That Evoke TCG Feel

### Ornamental Dividers

Between sections — not just `<hr>` tags. A thin horizontal line (`--color-gold-dim` at 30%) with a small centered diamond glyph:

```css
.ornamental-divider {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: var(--color-gold-dim);
}
.ornamental-divider::before,
.ornamental-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: linear-gradient(
    to right,
    transparent,
    var(--color-gold-dim) 50%,
    transparent
  );
}
/* Middle element: ◆ or ✦ character */
```

Use for: separating filter sections in the sidebar, between oracle text and flavor text on card details, between collection stats and card grid.

### Glow Effects

Used **extremely sparingly** — only where they add meaning:

1. **Active nav item:** Small gold text-shadow glow
2. **Hovered card:** Outer box-shadow with gold, ~8px blur
3. **Selected card:** More intense version of hover glow
4. **CTA button on hover:** Inner + outer glow
5. **Mana pip symbols:** Very faint color-matched glow (a blue pip glows slightly blue)

**Rule:** If removing the glow makes something look the same, the glow adds nothing. Only use it where the absence would feel flat.

### Border Treatments

Panels use very thin borders — 1px, never 2px except for selected states. The color is `--color-gold-dim` at 20-40% opacity — barely visible but present. This gives panels a "framed artifact" quality rather than the "box on a screen" quality of typical web apps.

```css
.panel {
  border: 1px solid rgba(196, 146, 42, 0.25);  /* --color-gold at 25% */
  border-radius: 4px;  /* slight rounding — not a hard square, not a pill */
}
```

**Inner border technique:** Many panels should have a slightly lighter inset — one pixel of `--color-stone` creating the illusion of physical depth. Achieved with:
```css
box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
```

### Mana Symbols

Use the **Mana** font by Andrew Gioia (free, open-source: `mana.andrewgioia.com`). This is the standard for web MTG apps and covers every mana symbol, card type icon, rarity symbol, guild emblem, and more.

```html
<!-- Include via CDN or self-host -->
<i class="ms ms-cost ms-g"></i>  <!-- Green mana pip -->
<i class="ms ms-r"></i>          <!-- Red mana pip -->
<i class="ms ms-2"></i>          <!-- Generic 2 mana -->
<i class="ms ms-tap"></i>        <!-- Tap symbol -->
```

Each mana pip should be displayed with `color: var(--mana-green)` etc., with a very subtle CSS text-shadow glow matching the mana color. This is the most recognizable TCG signal in the entire UI.

### Background Texture

The page background (`--color-crypt`) should have an extremely subtle **noise texture** overlay — a 4×4 repeating semi-transparent noise pattern at ~2% opacity. This prevents the background from looking like a flat digital screen and gives it the slight grain of real material.

```css
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background-image: url('/noise.png');  /* 4x4 semi-transparent noise */
  opacity: 0.015;
  pointer-events: none;
  z-index: 0;
}
```

### Rarity Indicators

Every card in every grid/list view displays its rarity as a small colored dot or symbol:
- Common: `--rarity-common` (steel gray dot)
- Uncommon: `--rarity-uncommon` (silver-blue dot)
- Rare: `--rarity-rare` (gold dot, with subtle pulse animation on hover)
- Mythic: `--rarity-mythic` (orange-red dot, with a brief ember glow animation on hover)

---

## 8. Component Styling Direction for Bits UI Primitives

Bits UI provides the accessible behavior; custom styles provide the character. Here is direction for each key primitive:

### Dialog (Bits UI `Dialog.Root`, `Dialog.Content`)

Used for: Card detail view on mobile, collection editing, confirm dialogs.

```
Dialog.Overlay:
  background: rgba(13, 11, 15, 0.85)  /* --color-void at 85% */
  backdrop-filter: blur(4px)

Dialog.Content:
  background: --color-stone
  border: 1px solid rgba(196, 146, 42, 0.3)
  border-radius: 6px
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.04) inset,  /* inner highlight */
    0 8px 40px rgba(13, 11, 15, 0.8)          /* deep shadow */

  Animation: slide-up + fade-in, 200ms ease-out
  Not a flat fade — the card should physically emerge from below
```

### Select (Bits UI `Select.Root`, `Select.Content`)

Used for: Condition selector (NM/LP/MP/HP/DMG), sort-by, set filter.

```
Select.Trigger:
  background: --color-crypt
  border: 1px solid rgba(196, 146, 42, 0.3)
  color: --text-primary
  padding: 0.375rem 0.75rem
  font-family: 'Crimson Pro'

  Focus state: border color to --color-gold, + glow

Select.Content:
  background: --color-slate
  border: 1px solid rgba(196, 146, 42, 0.4)
  box-shadow: 0 4px 24px rgba(13, 11, 15, 0.8)

Select.Item:
  padding: 0.5rem 0.75rem
  font-family: 'Crimson Pro'

  Highlighted: background --color-mist, color --color-amber
  Selected: color --color-gold-bright, small checkmark in gold
```

### Collapsible (Bits UI `Collapsible.Root`)

Used for: Filter sections in the left panel.

```
Collapsible.Trigger:
  font-family: 'Cinzel'
  font-size: --text-sm
  color: --text-secondary
  text-transform: uppercase
  letter-spacing: 0.1em

  Icon: chevron that rotates 180° on open (CSS transform, 200ms ease)
  Hover: color to --text-primary

Collapsible.Content:
  Animation: height 0 → auto with overflow: hidden
  200ms ease-out
```

### Popover (Bits UI `Popover.Root`, `Popover.Content`)

Used for: Printing selector when picking which edition of a card to add.

```
Popover.Content:
  background: --color-stone
  border: 1px solid rgba(196, 146, 42, 0.35)
  border-radius: 4px
  box-shadow: 0 8px 32px rgba(13, 11, 15, 0.7)
  max-width: 360px

  Animation: fade + scale (0.95 → 1.0) from anchor point
```

### Tooltip (Bits UI `Tooltip.Root`)

Used for: Mana symbol explanations, condition definitions (what is NM?), set codes.

```
Tooltip.Content:
  background: --color-void
  border: 1px solid rgba(196, 146, 42, 0.3)
  border-radius: 3px
  font-family: 'Crimson Pro'
  font-size: --text-xs
  color: --text-primary
  padding: 0.375rem 0.625rem
  max-width: 200px
```

### Buttons (Custom — Bits UI has no Button primitive)

**Primary CTA (Add to Collection):**
```css
background: linear-gradient(135deg, var(--color-gold-dim), var(--color-gold));
color: var(--text-on-gold);
font-family: 'Cinzel', serif;
font-size: 0.875rem;
font-weight: 700;
letter-spacing: 0.08em;
text-transform: uppercase;
border: 1px solid var(--color-gold-bright);
border-radius: 3px;
padding: 0.625rem 1.5rem;

/* Hover: */
box-shadow: 0 0 12px rgba(196, 146, 42, 0.4), 0 2px 4px rgba(13,11,15,0.5);
background: linear-gradient(135deg, var(--color-gold), var(--color-amber));
```

**Secondary (outline):**
```css
background: transparent;
border: 1px solid rgba(196, 146, 42, 0.5);
color: var(--color-gold-bright);
font-family: 'Cinzel', serif;
/* Hover: border opacity increases, subtle background fill */
```

**Ghost / Destructive:**
```css
background: transparent;
border: 1px solid rgba(138, 32, 32, 0.4);
color: var(--color-error);
/* Use for remove-from-collection, delete-collection actions */
```

### Input / Search Field

The search bar is the most-used element on the entire app.

```css
.search-input {
  background: var(--color-crypt);
  border: 1px solid rgba(196, 146, 42, 0.3);
  border-radius: 4px;
  color: var(--text-primary);
  font-family: 'Crimson Pro', serif;
  font-size: 1rem;
  padding: 0.625rem 1rem 0.625rem 2.5rem; /* left padding for icon */
  width: 100%;

  transition: border-color 150ms ease, box-shadow 150ms ease;
}

.search-input::placeholder {
  color: var(--text-muted);
  font-style: italic; /* "Search cards..." in italic is a subtle TCG touch */
}

.search-input:focus {
  border-color: var(--color-gold);
  box-shadow: 0 0 0 2px rgba(196, 146, 42, 0.15);
  outline: none;
}
```

---

## 9. How This Feels Different From Generic Modern Web Apps

Generic modern web apps (2024 SaaS style) share these traits:
- Cool-gray or off-white backgrounds (#f8f9fa, #1a1a2e)
- Blue primary accent (#3b82f6 or similar)
- Sans-serif typography (Inter, Geist, Space Grotesk)
- Border-radius: 8-12px everywhere
- Clean, flat, frictionless
- Information presented as rows, tables, cards with drop shadows

Spellbook should differ in every dimension:

| Element | Generic SaaS | Spellbook |
|---------|-------------|-----------|
| Background | Cool neutral dark | Warm near-black, slight purple cast |
| Primary accent | Blue, purple, or teal | Gold/amber |
| Typography | Sans-serif, geometric | Serif: Cinzel + Crimson Pro |
| Border radius | 8-12px | 3-4px (sharp, not rounded) |
| Borders | Subtle gray | Faint gold |
| Cards/panels | Drop shadow outward | Inset highlight + outer shadow (depth illusion) |
| Hover interactions | Background color change | Physical lift + glow |
| Dividers | Simple lines | Ornamental with diamond glyph |
| Color system | Purely functional | Mana-color-aware (W/U/B/R/G) |
| Data display | Tables, lists | Card grids with art as primary element |
| Loading states | Spinner | Could use an arcane "casting" animation |
| Empty states | "No results found" | Illustrated/poetic — a scroll with flavor text |

The goal is that a first-time visitor immediately recognizes this is a Magic: The Gathering application from the visual design alone — before reading a single word. The color, typography, and card-centric layout should telegraph "TCG" the same way that Hearthstone's wooden jewelry box UI telegraphs "card game" and Gwent's bronze/gold rarity system telegraphs "fantasy game."

---

## 10. Reference Comparisons

### MTG Arena (Gold Standard for This Direction)

MTG Arena's collection screen is the closest reference point. Observed characteristics:
- **Dark slate background** with a faint purple undertone — not pure black
- **Gold/amber accent** throughout: buttons, active filters, selected states
- **Card art dominates** — cards in the grid have no thick borders; the art is the border
- **Filter panel** on the left with mana symbol color buttons (the five circles are iconic)
- **Hover lift** on cards — very clear physical feel
- **Cinzel-like headings** — the in-game font closely resembles the Cinzel/Matrix Bold style
- **No rounded corners on game elements** — the interface feels angular, intentional
- The overall feel: a dark library of artifacts, curated by a powerful wizard

### Gwent (CD Projekt Red)

Gwent's collection screen offers a secondary reference:
- **Faction-specific color theming** — each faction's collection area has a tinted background
- **Bronze and gold borders** on cards to signal rarity (equivalent to MTG uncommon/rare)
- **Stone and leather textures** implied by the background materials
- **Custom "Gwent" font** — a stylized serif that evokes medieval manuscripts
- Card hover shows an animated video preview — beyond V1 scope but aspirational
- The overall feel: a war council's card table, atmospheric and specific

### Hearthstone (TCG UI Lessons)

Hearthstone's key UI contribution to this space:
- **The "jewelry box" concept:** the entire game UI fits inside a physical object (the Hearthstone box). Every element feels like it's sitting on a physical tray, not floating on a flat screen.
- **Physicality:** cards bounce, tumble, have weight. Even web apps can hint at this through hover transforms and shadow depth changes.
- **Material language:** wood, leather, gold, gem. Real-world materials applied to UI surfaces.
- For Spellbook: the panel surfaces should evoke dark polished wood or stone slab — achieved through the background color + noise texture + inset shadows.

### Moxfield (Functional Peer Reference)

What Moxfield does well that Spellbook should match (functionally):
- Clean, fast card grid
- Inline quantity editing (no modal required for +/-)
- Powerful filters that don't overwhelm
- Quick-access search with debouncing

What Moxfield lacks that Spellbook should have:
- Dark mode is light mode dark, not a designed dark experience
- Typography is generic sans-serif (no TCG character)
- No ornament, no atmosphere — functional but forgettable
- Archidekt uses Lato; Moxfield uses similar sans-serif — Spellbook uses Cinzel+CrimsonPro

### Scryfall (Data Quality Reference, Not Aesthetic)

Scryfall is the data reference, not the aesthetic reference. Its design is deliberately utilitarian — it's a search engine, not an experience. Spellbook should be as comprehensive as Scryfall's data but as immersive as MTG Arena's collection screen.

---

## 11. Implementation Priority for V1

Given this is SvelteKit + Tailwind CSS + Bits UI, the implementation order:

### Phase 1: Foundation (do before any feature work)

1. **Define CSS custom properties** in `app.css` — the full color palette, type scale, and spacing tokens. All component styles reference these variables.
2. **Import fonts** via Fontsource (`@fontsource/cinzel`, `@fontsource/crimson-pro`) — self-hosted, no Google Fonts GDPR concern.
3. **Install Mana font** for mana symbol icons (npm package `@andrewgioia/mana` or CDN).
4. **Configure Tailwind** with the custom color tokens mapped to Tailwind utility names (e.g., `gold`, `crypt`, `stone`, `slate`).
5. **Noise texture asset** — create a 4x4 PNG noise pattern for the background texture overlay.

### Phase 2: Shell Components

6. **Nav.svelte** — top bar, Cinzel logo, gold active states
7. **Panel.svelte** — reusable dark panel with gold border, inset highlight
8. **OrnamentalDivider.svelte** — the diamond-center divider
9. **Button.svelte** — primary (gold gradient), secondary (outline), ghost (destructive)

### Phase 3: Card Components

10. **CardThumbnail.svelte** — the core card display with lift-on-hover
11. **CardGrid.svelte** — responsive grid with auto-sizing columns
12. **CardDetail.svelte** — side panel or modal with full art + info
13. **ManaCost.svelte** — renders a mana cost string as colored Mana font icons
14. **RarityBadge.svelte** — colored dot with appropriate rarity color

### Phase 4: Search UI

15. **SearchBar.svelte** — styled input with search icon, italic placeholder
16. **FilterPanel.svelte** — collapsible sections, mana color buttons, rarity filter
17. **SearchResults.svelte** — card grid wired to MeiliSearch

### Phase 5: Collection UI

18. **CollectionCard.svelte** — the art-mosaic collection tile for the grid
19. **CollectionView.svelte** — collection detail with filter sidebar + card grid

---

## 12. Anti-Patterns to Avoid

These choices would immediately undermine the TCG aesthetic:

- **Rounded corners larger than 6px** — looks like a pill, not a card frame
- **Blue primary accent** — instantly reads as corporate SaaS
- **Skeleton loaders with pulse animation** — looks like every other web app. Use a more thematic loading state (a shimmering gold shimmer, or a brief "spinning arcane symbol")
- **Toast notifications in the corner** — consider a more elegant inline confirmation ("Added 1× Llanowar Elves to Commander Staples" appearing briefly within the card detail panel)
- **Overflow of sans-serif typography** — one sans-serif font in the UI breaks the whole spell
- **White backgrounds anywhere** — even modals and dialogs should use `--color-stone` or `--color-slate`
- **Stock icon sets (Heroicons, Lucide)** — use Mana font icons where available; for others, prefer minimal stroked icons that don't look like generic web app icons
- **Card images as `background-image`** — use actual `<img>` with proper alt text and loading attributes. Accessibility matters even in a TCG app.
- **Hover states that only change background color** — too flat. Every interactive element needs a multi-property hover (color + shadow + transform).

---

## Appendix: Quick Reference

### Fonts (Fontsource packages)
```
@fontsource/cinzel
@fontsource/cinzel-decorative
@fontsource/crimson-pro
@fontsource/jetbrains-mono (limited use)
```

### Mana Symbol Library
```
npm: mana-font  (or @andrewgioia/mana)
CDN: https://mana.andrewgioia.com/mana.css
Docs: https://mana.andrewgioia.com/icons.html
```

### Key Rarity Hex Values (for reference)
```
Common:   #9aa0a6
Uncommon: #a8c4cc
Rare:     #d4af37
Mythic:   #d4521a
```

### MTG Mana Color Hex Values
```
White: #f9faf0
Blue:  #3a6eb5
Black: #4a3550
Red:   #c03030
Green: #2a7a3a
```

### Design Token Summary
```css
/* 6 backgrounds (void → smoke) */
/* 5 gold/amber accents (dim → amber) */
/* 5 mana color accents */
/* 4 rarity colors */
/* 4 text colors */
/* 3 semantic colors (success/error/warning) */
```
