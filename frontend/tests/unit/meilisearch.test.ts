import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDistinctSearch = vi.fn().mockResolvedValue({
	hits: [],
	query: '',
	processingTimeMs: 0,
	estimatedTotalHits: 0
});

const mockAllSearch = vi.fn().mockResolvedValue({
	hits: [],
	query: '',
	processingTimeMs: 0,
	estimatedTotalHits: 0
});

// Mock the meilisearch module before importing our client
vi.mock('meilisearch', () => {
	class MockMeilisearch {
		index = vi.fn((uid: string) => ({
			search: uid === 'cards_all' ? mockAllSearch : mockDistinctSearch
		}));
	}

	return {
		Meilisearch: MockMeilisearch
	};
});

vi.mock('$lib/env/public', () => ({
	publicEnv: {
		PUBLIC_MEILISEARCH_URL: 'http://localhost:7700',
		PUBLIC_MEILISEARCH_SEARCH_KEY: 'test-key'
	}
}));

import { initMeiliSearch, searchCards, searchPrintings } from '../../src/lib/search/meilisearch';
import { browseCards, getFacets } from '../../src/lib/search/meilisearch';

beforeEach(() => {
	mockDistinctSearch.mockClear();
	mockAllSearch.mockClear();
	initMeiliSearch('test-key');
	mockDistinctSearch.mockClear();
	mockAllSearch.mockClear();
});

describe('searchCards', () => {
	it('returns empty results for empty query', async () => {
		const result = await searchCards('');
		expect(result.hits).toEqual([]);
		expect(result.estimatedTotalHits).toBe(0);
	});

	it('returns empty results for single-character query', async () => {
		const result = await searchCards('a');
		expect(result.hits).toEqual([]);
		expect(result.estimatedTotalHits).toBe(0);
	});

	it('calls MeiliSearch for queries with 2+ characters', async () => {
		const result = await searchCards('lightning bolt');
		expect(result).toBeDefined();
		expect(result.hits).toEqual([]);
	});

	it('forwards AbortSignal to card search requests', async () => {
		const controller = new AbortController();

		await searchCards('lightning bolt', { signal: controller.signal });

		expect(mockDistinctSearch).toHaveBeenCalledWith(
			'lightning bolt',
			expect.objectContaining({ limit: 20, offset: 0 }),
			{ signal: controller.signal }
		);
	});
});

describe('browseCards', () => {
	it('forwards AbortSignal to browse requests', async () => {
		const controller = new AbortController();

		await browseCards({ signal: controller.signal });

		expect(mockDistinctSearch).toHaveBeenCalledWith(
			'',
			expect.objectContaining({ limit: 50, offset: 0, sort: ['name:asc'] }),
			{ signal: controller.signal }
		);
	});
});

describe('getFacets', () => {
	it('forwards AbortSignal to facet requests', async () => {
		const controller = new AbortController();

		await getFacets(['rarity = "rare"'], controller.signal);

		expect(mockDistinctSearch).toHaveBeenCalledWith(
			'',
			expect.objectContaining({
				limit: 0,
				filter: ['rarity = "rare"'],
				facets: ['colors', 'rarity', 'set_code']
			}),
			{ signal: controller.signal }
		);
	});
});

describe('searchPrintings', () => {
	it('returns empty results for empty oracle_id', async () => {
		const result = await searchPrintings('');
		expect(result.hits).toEqual([]);
		expect(result.estimatedTotalHits).toBe(0);
	});

	it('calls MeiliSearch for valid oracle_id', async () => {
		const result = await searchPrintings('some-oracle-id');
		expect(result).toBeDefined();
		expect(result.hits).toEqual([]);
	});

	it('forwards AbortSignal to printing requests', async () => {
		const controller = new AbortController();

		await searchPrintings('some-oracle-id', { signal: controller.signal });

		expect(mockAllSearch).toHaveBeenCalledWith(
			'',
			expect.objectContaining({
				filter: ['oracle_id = "some-oracle-id"'],
				sort: ['set_code:asc'],
				limit: 1000
			}),
			{ signal: controller.signal }
		);
	});
});
