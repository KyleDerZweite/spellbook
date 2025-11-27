# KyleHub Design System: Style Guide

**Theme:** Modern · Minimal · Sustainable · Secure

---

### A Note on Usage

This document serves as a hybrid style guide, designed for both human developers and AI assistants. 

- **For Human Developers:** Please read the main body of this guide to understand the core design principles, visual identity, and overall aesthetic. This will help you make informed design decisions and contribute to the project in a consistent way.

- **For AI Assistants:** Please refer to the `## AI-STYLE-GUIDE` section at the end of this document. This section contains a machine-readable set of design tokens that you should use to generate code and components. When a design decision is not explicitly covered by the tokens, you may refer to the main body of the guide for context and guidance.

---

This guide establishes a uniform visual identity for all KyleHub web projects. It's inspired by a clean, modern aesthetic that combines dark, tech-focused elements with natural textures like stone, wood, and plant life, grounded in principles of usability and accessibility.

## 1. Core Design Principles

- **Clarity & Purpose:** Every element on the page must serve a clear purpose. If an element doesn't contribute to the user's goal or convey important information, it should be removed.
- **Intentional Spacing:** Negative space (or "dark space") is an active tool. Use it generously to reduce cognitive load, create focus, and establish a clear visual hierarchy.
- **Accessibility First:** Design for everyone. Our aesthetic must never compromise usability for users with disabilities. Accessibility is a foundational requirement, not an optional feature.
- **Visual Hierarchy:** Guide the user's attention to the most important elements first. Use size, color, weight, and placement to create a natural flow of information.

## 2. Accessibility (A11y)

Adherence to these guidelines is mandatory to ensure our projects are usable by the widest possible audience.

- **Color Contrast:** All text must meet a minimum contrast ratio of 4.5:1 against its background (WCAG AA). Use a contrast checker tool during design.
- **Keyboard Navigation:** All interactive elements (links, buttons, form fields) must be fully reachable and operable using only the keyboard. The navigation order must be logical and predictable.
- **Visible Focus States:** A clear, visible focus indicator (e.g., an outline or ring) is required for all interactive elements when they are selected via keyboard.
- **Semantic HTML:** Use HTML5 elements according to their purpose (`<nav>`, `<main>`, `<button>`, `<aside>`, etc.). This provides inherent accessibility for screen readers.
- **Image Alt Text:** All images that convey information must have descriptive alt text. Decorative images should have an empty `alt=""` attribute.

## 3. Color Palette

The color scheme is designed for high contrast and low eye strain in a dark-mode environment.

| Role           | Name           | HEX Code  | Usage                                                       |
| :------------- | :------------- | :-------- | :---------------------------------------------------------- |
| Primary BG     | Charcoal Black | `#121212` | Main background. Softer than pure black to reduce eye strain. |
| UI BG          | Deep Slate     | `#1E1E1E` | Background for cards, modals, and primary content areas.    |
| Primary Accent | Forest Green   | `#4CAF50` | CTAs, active states, key highlights, and links.             |
| Accent Hover   | Bright Green   | `#66BB6A` | Hover state for primary accent elements.                    |
| Primary Text   | Off-White      | `#EAEAEA` | Headings and primary body text.                             |
| Secondary Text | Cool Gray      | `#B0B0B0` | Subheadings, helper text, and inactive links.               |
| Borders/Lines  | Stone Gray     | `#444444` | Borders for containers, cards, and subtle dividers.         |
| Focus Border   | Bright Green   | `#66BB6A` | Visible outline for focused interactive elements.           |
| Texture Accent | Rich Wood      | `#8B5E3C` | Decorative accents. Use sparingly to avoid clutter.         |

## 4. Typography

Typography is clean, modern, and highly legible.

- **Font Family:**
    - **Primary:** Inter (from Google Fonts).
    - **Monospace/Code:** JetBrains Mono or Fira Code.
- **Line Height:** 1.6 for body text.
- **Line Width:** For optimal readability, paragraphs of body text should aim for a maximum width of 75ch (75 characters).

### Type Scale

| Element | Font Size      | Font Weight   |
| :------ | :------------- | :------------ |
| H1      | 2.5rem (40px)  | Bold (700)    |
| H2      | 2.0rem (32px)  | Bold (700)    |
| H3      | 1.5rem (24px)  | Medium (500)  |
| Body    | 1rem (16px)    | Regular (400) |
| Small   | 0.875rem (14px)| Regular (400) |

## 5. Components & UI Elements

These are the core, reusable building blocks of the interface.

### Glass Effect Navbar & Panels

```css
.glass-panel {
  background: rgba(30, 30, 30, 0.75); /* Deep Slate @ 75% */
  backdrop-filter: blur(15px);
  -webkit-backdrop-filter: blur(15px);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}
```

### Cards

- **Background:** Deep Slate (`#1E1E1E`)
- **Border Radius:** 20px (1.25rem)
- **Padding:** 32px
- **Border:** 1px solid `#444444`
- **Shadow:** `box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);`

### Buttons

**Primary Button (Green):**

- **Default:** Background Forest Green (`#4CAF50`), Text Off-White (`#EAEAEA`).
- **Hover:** Background Bright Green (`#66BB6A`), `transform: scale(1.03);`.
- **Focus:** A 2px solid `#66BB6A` outline with an offset.

**Secondary Button (Ghost/Link):**

- **Default:** Transparent background, Text Cool Gray (`#B0B0B0`).
- **Hover:** Text Off-White (`#EAEAEA`). Often paired with a `→` icon.
- **Focus:** Text Off-White (`#EAEAEA`) and a 2px solid `#66BB6A` outline.

### Forms

- **Labels:** Must always be visible and clearly associated with their input. Do not use placeholder text as a label.
- **Input Fields:**
    - **Default:** Background Charcoal Black (`#121212`), 1px solid `#444444` border, Text Off-White (`#EAEAEA`).
    - **Focus:** Border color changes to Bright Green (`#66BB6A`).
    - **Error:** Border color changes to an error color (e.g., a muted red like `#B71C1C`).
- **Error Messages:** Displayed in text, close to the invalid field.

## 6. Animation & Motion

Animations should be purposeful, enhancing the user experience without being distracting.

- **Principle:** Motion should provide feedback, guide attention, or improve perceived performance. Avoid purely decorative animations.
- **Transition Speed:** Use a consistent duration of 200ms to 300ms with an `ease-in-out` timing function.
- **Card Hover:** `transform: translateY(-4px) scale(1.02);`
- **Page Load:** Fade in sections as they enter the viewport with a slight upward motion.

---

## AI-STYLE-GUIDE

This section provides a machine-readable set of design tokens for use by AI assistants. Please use these tokens to generate code and components.

### Color Tokens

| Token Name                | Value     | Description                                                 |
| ------------------------- | --------- | ----------------------------------------------------------- |
| `color-primary-bg`        | `#121212` | Main background color.                                      |
| `color-ui-bg`             | `#1E1E1E` | Background for UI elements like cards and modals.           |
| `color-accent-primary`    | `#4CAF50` | Primary accent color for buttons, links, and active states. |
| `color-accent-hover`      | `#66BB6A` | Hover state for primary accent elements.                    |
| `color-text-primary`      | `#EAEAEA` | Primary text color.                                         |
| `color-text-secondary`    | `#B0B0B0` | Secondary text color for subheadings and helper text.       |
| `color-border`            | `#444444` | Border color for containers and dividers.                   |
| `color-focus-border`      | `#66BB6A` | Border color for focused interactive elements.              |
| `color-texture-accent`    | `#8B5E3C` | Decorative accent color.                                    |

### Typography Tokens

| Token Name                | Value           | Description                               |
| ------------------------- | --------------- | ----------------------------------------- |
| `font-family-primary`     | `Inter`         | The primary font for all text.            |
| `font-family-monospace`   | `JetBrains Mono`| The font for all code snippets.           |
| `font-size-h1`            | `2.5rem`        | Font size for H1 headings.                |
| `font-size-h2`            | `2.0rem`        | Font size for H2 headings.                |
| `font-size-h3`            | `1.5rem`        | Font size for H3 headings.                |
| `font-size-body`          | `1rem`          | Font size for body text.                  |
| `font-size-small`         | `0.875rem`      | Font size for small text.                 |
| `font-weight-bold`        | `700`           | Font weight for bold text.                |
| `font-weight-medium`      | `500`           | Font weight for medium text.              |
| `font-weight-regular`     | `400`           | Font weight for regular text.             |
| `line-height-body`        | `1.6`           | Line height for body text.                |

### Spacing Tokens

| Token Name                | Value     | Description                               |
| ------------------------- | --------- | ----------------------------------------- |
| `spacing-xs`              | `4px`     | Extra small spacing.                      |
| `spacing-sm`              | `8px`     | Small spacing.                            |
| `spacing-md`              | `16px`    | Medium spacing.                           |
| `spacing-lg`              | `32px`    | Large spacing.                            |
| `spacing-xl`              | `64px`    | Extra large spacing.                      |

### Border Radius Tokens

| Token Name                | Value     | Description                               |
| ------------------------- | --------- | ----------------------------------------- |
| `border-radius-sm`        | `8px`     | Small border radius for small components. |
| `border-radius-md`        | `16px`    | Medium border radius for cards and modals.|
| `border-radius-lg`        | `20px`    | Large border radius for large containers. |

### Animation Tokens

| Token Name                | Value         | Description                               |
| ------------------------- | ------------- | ----------------------------------------- |
| `animation-duration`      | `250ms`       | The standard duration for all animations. |
| `animation-timing-function`| `ease-in-out`| The standard timing function for all animations.|
