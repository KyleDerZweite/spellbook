import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../src');
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8');

describe('design-system spacing grid and target sizes (#427)', () => {
	it('defines the 4px/8px spacing tokens and 44px/40px target sizes in app.css', () => {
		const css = read('app.css');
		expect(css).toContain('--space-control-inline: 0.25rem;');
		expect(css).toContain('--space-control-gap: 0.5rem;');
		expect(css).toContain('--space-toolbar-group: 0.75rem;');
		expect(css).toContain('--space-page-margin: 1rem;');
		expect(css).toContain('--space-section: 1.5rem;');
		expect(css).toContain('--space-section-lg: 2rem;');
		expect(css).toContain('--target-min: 2.75rem;');
		expect(css).toContain('--target-compact: 2.5rem;');
		expect(css).toContain(
			'scroll-padding-top: calc(var(--app-header-height) + var(--space-page-margin));'
		);
		expect(css).not.toContain('+ 18px');
	});

	it('keeps deck header actions and library toolbar controls separated and aligned', () => {
		const decksPage = read('routes/mtg/decks/+page.svelte');
		expect(decksPage).toMatch(/\.deck-picker\s*\{[^}]*align-items:\s*center;[^}]*gap:\s*0\.5rem;/s);
		expect(decksPage).toMatch(/\.view-controls\s*\{[^}]*gap:\s*0\.5rem;/s);

		const deckLibrary = read('lib/components/decks/DeckLibrary.svelte');
		expect(deckLibrary).toMatch(/\.view-toggle\s*\{[^}]*gap:\s*0\.5rem;/s);
		expect(deckLibrary).toMatch(
			/\.ownership-filter\s*\{[^}]*align-items:\s*center;[^}]*gap:\s*0\.5rem;/s
		);
		expect(deckLibrary).toMatch(/\.directory-controls\s*\{[^}]*gap:\s*0\.75rem;/s);
	});

	it('keeps nav account controls, search overlay actions, and quantity controls on grid', () => {
		const nav = read('lib/components/layout/Nav.svelte');
		expect(nav).toMatch(/\.desktop-links\s*\{[^}]*gap:\s*0\.5rem;/s);
		expect(nav).toMatch(/\.account-controls\s*\{[^}]*gap:\s*0\.5rem;/s);

		const overlay = read('lib/components/search/SearchOverlay.svelte');
		expect(overlay).toContain('ml-auto flex shrink-0 items-center gap-2');

		const qty = read('lib/components/ui/QuantityControl.svelte');
		expect(qty).toMatch(
			/\.quantity-control :global\(\.btn-icon\)\s*\{[^}]*min-height:\s*2\.5rem;/s
		);
	});
});
