import { describe, expect, it } from 'vitest';
import { parseCatalogSearchRequest } from '@spellbook/contracts/catalog-query.ts';
import { buildSearchContextKey } from '#lib/search/requestContext.ts';
import { parseSearchUrl } from '#lib/search/navigation.ts';

describe('structured color matching', () => {
	it('accepts NOT-only matching, normalizes exclusions and preserves omitted legacy groups', () => {
		expect(
			parseCatalogSearchRequest({
				filters: { colorMatch: { field: 'identity', any: [], all: [], not: ['R', 'R', 'C'] } }
			}).filters.colorMatch
		).toEqual({ field: 'identity', any: [], all: [], not: ['R', 'C'] });
		const key = (not: ('R' | 'C')[]) =>
			buildSearchContextKey({
				game: 'mtg',
				query: '',
				filters: { colorMatch: { field: 'identity', any: [], all: [], not } }
			});
		expect(key(['R', 'C'])).toBe(key(['C', 'R']));
		expect(key(['R'])).not.toBe(key(['C']));
	});
	it('isolates exact browser AND results from inclusive API AND results', () => {
		const filters = parseSearchUrl(
			new URL('https://spellbook.test/mtg/search?colorAnd=W&colorAnd=U')
		).filters;
		const key = (selected: typeof filters) =>
			buildSearchContextKey({ game: 'mtg', query: '', filters: selected });
		expect(key(filters)).not.toBe(
			key({ colorMatch: { field: 'color', any: [], all: ['W', 'U'] } })
		);
		expect(parseCatalogSearchRequest({ filters }).filters).toEqual(filters);
	});
	it('normalizes duplicates while retaining OR and AND and the selected field', () => {
		expect(
			parseCatalogSearchRequest({
				filters: { colorMatch: { field: 'identity', any: ['W', 'W', 'U'], all: ['B'] } }
			}).filters.colorMatch
		).toEqual({ field: 'identity', any: ['W', 'U'], all: ['B'] });
	});
	it.each([
		null,
		{},
		{ field: 'other', any: [], all: [] },
		{ field: 'color', any: ['W'], all: ['W'] },
		{ field: 'color', any: [], all: ['X'] },
		{ field: 'color', any: [], all: [], raw: 'SQL' },
		{ field: 'color', any: [], all: Array(7).fill('B') },
		{ field: 'color', any: ['R'], all: [], not: ['R'] },
		{ field: 'color', any: [], all: ['C'], not: ['C'] },
		{ field: 'color', any: [], all: [], not: null },
		{ field: 'color', any: [], all: [], not: ['X'] },
		{ field: 'color', any: [], all: [], not: Array(7).fill('R') }
	])('rejects malformed expressions %j', (colorMatch) => {
		expect(() => parseCatalogSearchRequest({ filters: { colorMatch } })).toThrow();
	});
	it('isolates cached results for different logic and fields while normalizing ordering', () => {
		const key = (field: 'color' | 'identity', any: ('W' | 'U' | 'B')[], all: ('W' | 'U' | 'B')[]) =>
			buildSearchContextKey({
				game: 'mtg',
				query: '',
				filters: { colorMatch: { field, any, all } }
			});
		expect(key('color', ['W', 'U'], ['B'])).toBe(key('color', ['U', 'W'], ['B']));
		expect(key('color', ['W', 'U'], ['B'])).not.toBe(key('identity', ['W', 'U'], ['B']));
		expect(key('color', ['W', 'U'], ['B'])).not.toBe(key('color', ['W', 'U', 'B'], []));
	});
});
