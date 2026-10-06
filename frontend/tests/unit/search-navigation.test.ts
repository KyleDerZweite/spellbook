import { describe, expect, it } from 'vitest';
import { isPrimaryClick, parseSearchUrl, searchHref } from '../../src/lib/search/navigation.ts';
import { pendingOverlayBack } from '../../src/lib/search/history.ts';
import { SearchSession } from '../../src/lib/search/session.svelte.ts';

const origin = 'https://spellbook.test';
describe('Search navigation', () => {
	it('round trips query and all supported filter categories for direct visits and full view', () => {
		const input = {
			query: 'Lightning Bolt & "elf"',
			filters: {
				colors: ['R', 'U'] as const,
				rarities: ['common'] as const,
				types: ['Instant'] as const,
				legalities: ['modern', 'commander'] as const
			}
		};
		const parsed = parseSearchUrl(
			new URL(
				searchHref({
					query: input.query,
					filters: {
						colors: [...input.filters.colors],
						rarities: [...input.filters.rarities],
						types: [...input.filters.types],
						legalities: [...input.filters.legalities]
					}
				}),
				origin
			)
		);
		expect(parsed.query).toBe(input.query);
		expect(parsed.filters).toEqual({
			colors: ['U', 'R'],
			rarities: ['common'],
			types: ['Instant'],
			legalities: ['modern', 'commander']
		});
	});

	it('drops unknown filters, duplicate values and unrelated background parameters', () => {
		const parsed = parseSearchUrl(
			new URL(
				'/mtg/search?q=elf&color=G&color=G&color=invalid&rarity=rare&type=Creature&legal=legacy&legal=invalid&deck=private',
				origin
			)
		);
		expect(parsed.filters).toEqual({
			colors: ['G'],
			rarities: ['rare'],
			types: ['Creature'],
			legalities: ['legacy']
		});
		expect(searchHref(parsed)).toBe(
			'/mtg/search?q=elf&color=G&rarity=rare&type=Creature&legal=legacy'
		);
		expect(searchHref({ query: '', filters: {} })).toBe('/mtg/search');
	});

	it('leaves modified and secondary navigation clicks to the browser', () => {
		const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
		expect(isPrimaryClick(click as MouseEvent)).toBe(true);
		for (const modifier of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey'])
			expect(isPrimaryClick({ ...click, [modifier]: true } as MouseEvent)).toBe(false);
		expect(isPrimaryClick({ ...click, button: 1 } as MouseEvent)).toBe(false);
	});

	it('guards the pending overlay Back entry without changing ordinary history traversal', () => {
		const background = `${origin}/mtg/decks?deck=owned`;
		expect(pendingOverlayBack(true, background, background)).toBe(true);
		expect(pendingOverlayBack(false, background, background)).toBe(false);
		expect(pendingOverlayBack(true, undefined, background)).toBe(false);
		expect(pendingOverlayBack(true, background, `${origin}/mtg/search?q=elf`)).toBe(false);
	});

	it('keeps sessions isolated and unchanged URL hydration preserves result position', () => {
		const first = new SearchSession();
		const second = new SearchSession();
		first.hydrate(parseSearchUrl(new URL('/mtg/search?q=elf&color=G', origin)));
		first.scrollTop = 840;
		first.hydrate(parseSearchUrl(new URL(searchHref(first.input), origin)));
		expect(first.scrollTop).toBe(840);
		expect(second.input).toEqual({
			query: '',
			filters: { colors: [], rarities: [], types: [], legalities: [] }
		});
		first.hydrate(parseSearchUrl(new URL('/mtg/search?q=bolt', origin)));
		expect(first.scrollTop).toBe(0);
	});
});
