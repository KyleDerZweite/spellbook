# Kylehub Design System

This document outlines the universal design principles, color palette, typography, and component styles for the **Kylehub** brand. Use this guide to ensure consistency across all web applications and projects within the Kylehub ecosystem.

## 1. Brand Identity

**"Elegant Modern Mix"**

- **Core Values**: Sophisticated, Clean, Nature-inspired, High-performance.
- **Aesthetic**: Dark mode base, glassmorphism effects, vibrant purple interactions, and specific brand green accents.

## 2. Color Palette

### Base Colors

- **Background**: `Zinc 950` (`#09090b`) - Deep, rich black/gray for the main app background.
- **Card Surface**: `Zinc 900` (`#18181b`) - Slightly lighter dark gray for content containers.
- **Sidebar**: `Black` (`#000000`) - Pure black for the navigation sidebar.

### Accent Colors

- **Primary (Interaction)**: `Violet 500` (`#8b5cf6`)
  - Used for: Primary buttons, active navigation states, focus rings, glows.
  - Why: Provides a vibrant, magical/tech feel.
- **Success (Brand Identity)**: `Brand Green` (`#25c2a0`)
  - Used for: Logo, borders, success states, checkmarks, subtle accents.
  - Why: Ties back to the "Hatchery" nature theme and specific brand logo.

### Utility Colors

- **Text Main**: `Zinc 50` (`#fafafa`) - High contrast for readability.
- **Text Muted**: `Zinc 400` (`#a1a1aa`) - For descriptions and secondary text.
- **Border Subtle**: `Brand Green` at 10% opacity (`rgba(37, 194, 160, 0.1)`).

## 3. Typography

- **Font Family**: Inter / System UI (Sans-serif).
- **Weights**:
  - Regular (400): Body text.
  - Medium (500): Buttons, navigation links.
  - Semibold (600): Card titles, section headers.
  - Bold (700): Page titles, major stats.

## 4. UI Components

### Cards (Glassmorphism)

Standard container for dashboard content.

- **Background**: `bg-card/50` (50% opacity Zinc 900).
- **Effect**: `backdrop-blur-sm` (Small blur for depth).
- **Border**: `border-success/10` (Subtle brand green).
- **Shadow**: `shadow-xl` (Deep shadow for elevation).
- **Corner Radius**: `rounded-xl` (Extra large rounded corners).

**Example Usage:**

```tsx
<Card className="bg-card/50 backdrop-blur-sm border-success/10 shadow-xl">
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>Content</CardContent>
</Card>
```

### Buttons

- **Primary (CTA)**:
  - Background: `bg-primary` or Gradient `from-violet-600 to-indigo-600`.
  - Text: White.
  - Shadow: `shadow-lg shadow-primary/20` (Glow effect).
  - Hover: `hover:scale-[1.01]` (Subtle lift).
- **Secondary**:
  - Background: `bg-secondary`.
  - Border: `border-white/5`.
  - Hover: `hover:bg-secondary/80`.

### Inputs

- **Background**: `bg-black/20` (Darker than card).
- **Border**: `border-success/10` (Matches card border).
- **Focus**: `ring-primary` (Purple focus ring).

## 5. Layout & Spacing

- **Sidebar**: Fixed width (`280px`), glassmorphism (`bg-sidebar/95 backdrop-blur-xl`), right border (`border-success/10`).
- **Page Content**: Max-width container, centered or grid-based.
- **Grid**: Standard gap of `gap-4` or `gap-6`.

## 6. Effects

- **Glows**: Use `shadow-primary/20` or radial gradients for background atmosphere.
- **Transitions**: `transition-all duration-300` for smooth state changes.
- **Micro-interactions**: Scale buttons slightly on hover/active.
