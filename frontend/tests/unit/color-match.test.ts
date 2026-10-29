import { describe, expect, it } from 'vitest';
import { parseCatalogSearchRequest } from '@spellbook/contracts/catalog-query.ts';
import { buildSearchContextKey } from '#lib/search/requestContext.ts';

describe('structured color matching', () => {
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
		{ field: 'color', any: [], all: Array(7).fill('B') }
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
