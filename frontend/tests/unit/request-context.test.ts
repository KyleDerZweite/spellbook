import { describe, expect, it } from 'vitest';
import { buildSearchContextKey } from '../../src/lib/search/requestContext';

describe('buildSearchContextKey', () => {
	it('returns the same key for the same input', () => {
		const first = buildSearchContextKey({
			game: 'mtg',
			query: 'bolt',
			filters: ['rarity = "rare"', 'colors = "R"']
		});
		const second = buildSearchContextKey({
			game: 'mtg',
			query: 'bolt',
			filters: ['colors = "R"', 'rarity = "rare"']
		});

		expect(first).toBe(second);
	});

	it('changes when the query changes', () => {
		expect(buildSearchContextKey({ game: 'mtg', query: 'bolt', filters: [] })).not.toBe(
			buildSearchContextKey({ game: 'mtg', query: 'brainstorm', filters: [] })
		);
	});

	it('changes when the filters change', () => {
		expect(
			buildSearchContextKey({ game: 'mtg', query: 'bolt', filters: ['rarity = "rare"'] })
		).not.toBe(buildSearchContextKey({ game: 'mtg', query: 'bolt', filters: ['colors = "R"'] }));
	});

	it('changes across the browse and search mode boundary', () => {
		expect(buildSearchContextKey({ game: 'mtg', query: 'a', filters: [] })).not.toBe(
			buildSearchContextKey({ game: 'mtg', query: 'ab', filters: [] })
		);
	});

	it('changes when the game changes', () => {
		expect(buildSearchContextKey({ game: 'mtg', query: 'bolt', filters: [] })).not.toBe(
			buildSearchContextKey({ game: 'pokemon', query: 'bolt', filters: [] })
		);
	});
});
