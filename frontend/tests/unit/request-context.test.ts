import { describe, expect, it } from 'vitest';
import { buildSearchContextKey } from '../../src/lib/search/requestContext.ts';

describe('buildSearchContextKey', () => {
	it('normalizes query whitespace, category order and selection order', () => {
		const first = buildSearchContextKey({
			game: 'mtg',
			query: ' bolt ',
			filters: { rarities: ['rare'], colors: ['R', 'G'] }
		});
		const second = buildSearchContextKey({
			game: 'mtg',
			query: 'bolt',
			filters: { colors: ['G', 'R'], rarities: ['rare'] }
		});
		expect(first).toBe(second);
	});

	it('treats absent and empty filter categories equally', () => {
		expect(buildSearchContextKey({ game: 'mtg', query: '', filters: {} })).toBe(
			buildSearchContextKey({
				game: 'mtg',
				query: '',
				filters: { colors: [], rarities: [], types: [], legalities: [], sets: [] }
			})
		);
	});

	it('rejects stale page contexts after query, game or category changes', () => {
		const baseline = buildSearchContextKey({ game: 'mtg', query: 'bolt', filters: {} });
		for (const changed of [
			buildSearchContextKey({ game: 'mtg', query: 'brainstorm', filters: {} }),
			buildSearchContextKey({ game: 'pokemon', query: 'bolt', filters: {} }),
			buildSearchContextKey({ game: 'mtg', query: 'bolt', filters: { colors: ['R'] } }),
			buildSearchContextKey({ game: 'mtg', query: 'bolt', filters: { sets: ['dom'] } })
		])
			expect(changed).not.toBe(baseline);
	});

	it('changes across the browse and search boundary', () => {
		expect(buildSearchContextKey({ game: 'mtg', query: 'a', filters: {} })).not.toBe(
			buildSearchContextKey({ game: 'mtg', query: 'ab', filters: {} })
		);
	});
});
