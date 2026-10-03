# Mana symbol font

- Status: Canonical
- Last Reviewed: 2026-10-03
- Source of Truth: installed package, application imports, upstream documentation
- Update Triggers: mana-font upgrades, symbol rendering, stylesheet imports, license changes
- Related Docs: [Reference](../README.md), [Frontend](../../architecture/frontend.md), [Selected UI components](../ui-libraries.md)

Spellbook uses the installed `mana-font` package for mana, card-type, and rarity symbols. [`frontend/src/app.css`](../../../frontend/src/app.css) imports the packaged stylesheet. [`ManaCost.svelte`](../../../frontend/src/lib/components/cards/ManaCost.svelte) renders parsed costs using [`manaCostParser.ts`](../../../frontend/src/lib/utils/manaCostParser.ts).

Use the existing components and parser instead of loading another font copy or a floating CDN version. Keep readable card information and accessible labels alongside symbols. The package manifest and lockfile own the installed version.

Upstream references:

- [Mana repository](https://github.com/andrewgioia/mana)
- [Symbol documentation](https://mana.andrewgioia.com/)
- [Cheatsheet](https://mana.andrewgioia.com/cheatsheet.html)

The font uses SIL Open Font License 1.1; CSS, Less, and Sass use MIT. MTG symbol artwork belongs to Wizards of the Coast. Preserve the upstream package's license notices.
