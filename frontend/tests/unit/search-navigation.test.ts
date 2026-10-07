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
				colorIdentity: ['R', 'U'] as const,
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
						colorIdentity: [...input.filters.colorIdentity],
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
			colorIdentity: ['U', 'R'],
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
			colorIdentity: ['G'],
			rarities: ['rare'],
			types: ['Creature'],
			legalities: ['legacy']
		});
		expect(searchHref(parsed)).toBe(
			'/mtg/search?q=elf&color=G&rarity=rare&type=Creature&legal=legacy&pageSize=200&page=1'
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
		expect(first.filters.selectedColors).toEqual(new Set(['G']));
		expect(first.input.filters.colorIdentity).toEqual(['G']);
		expect(first.input.filters.colors).toBeUndefined();
		first.scrollTop = 840;
		first.hydrate(parseSearchUrl(new URL(searchHref(first.input), origin)));
		expect(first.scrollTop).toBe(840);
		expect(second.input).toMatchObject({
			query: '',
			filters: { colorIdentity: [], rarities: [], types: [], legalities: [] }
		});
		first.hydrate(parseSearchUrl(new URL('/mtg/search?q=bolt', origin)));
		expect(first.scrollTop).toBe(0);
	});
});

describe('Search hybrid URL and history state', () => {
	it.each([
		'?pageSize=500&page=9007199254740992',
		'?pageSize=500&page=2002',
		'?pageSize=100&page=-1',
		'?pageSize=100&page=2&page=3',
		'?pageSize=100&pageSize=500&page=2',
		'?pageSize=bogus&page=abc'
	])('normalizes malformed or excessive pagination %s', (query) => {
		const state = parseSearchUrl(new URL('/mtg/search' + query, origin)).pagination!;
		expect(state.offset).toBeLessThanOrEqual(1000000);
		expect(state.page).toBe(query.includes('pageSize=100&pageSize=500') ? 2 : 1);
	});
	it('retains deep lazy anchors without synthesizing earlier pages', () => {
		const state = parseSearchUrl(
			new URL('/mtg/search?q=elf&color=G&pageSize=lazy&page=1234', origin)
		);
		expect(state.pagination).toMatchObject({
			pageSize: 'lazy',
			limit: 200,
			offset: 246600,
			page: 1234
		});
		expect(parseSearchUrl(new URL(searchHref(state), origin))).toEqual(state);
	});
	it('replaces typing and lazy crossing, pushes explicit submit/filter/navigation, and resets changed queries to one', () => {
		const session = new SearchSession();
		const intents: string[] = [];
		session.onEdit = (intent) => intents.push(intent);
		session.hydrate(parseSearchUrl(new URL('/mtg/search?pageSize=500&page=3', origin)));
		session.setQuery('elf');
		expect(session.pagination).toMatchObject({ pageSize: 500, page: 1 });
		session.submit();
		session.filters.toggleColor('G');
		session.navigate(parseSearchUrl(new URL('/mtg/search?q=elf&pageSize=lazy&page=4', origin)));
		session.setRange({ start: 800, end: 950, direction: 1 });
		expect(session.pagination.page).toBe(5);
		expect(intents).toEqual(['replace', 'push', 'push', 'push', 'replace']);
	});
	it('restores mode, page and saved host position on Back and Forward hydration', () => {
		const session = new SearchSession();
		const first = parseSearchUrl(new URL('/mtg/search?q=elf&pageSize=100&page=2', origin));
		const second = parseSearchUrl(new URL('/mtg/search?q=bolt&pageSize=lazy&page=8', origin));
		session.hydrate(first);
		session.scrollTop = 1234;
		session.hydrate(second);
		session.scrollTop = 5678;
		session.hydrate(first);
		expect(session.scrollTop).toBe(1234);
		expect(session.pagination).toMatchObject({ pageSize: 100, page: 2 });
		session.hydrate(second);
		expect(session.scrollTop).toBe(5678);
		expect(session.pagination).toMatchObject({ pageSize: 'lazy', page: 8 });
	});
});
