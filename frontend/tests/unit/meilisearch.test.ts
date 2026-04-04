import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the meilisearch module before importing our client
vi.mock('meilisearch', () => {
	const mockSearch = vi.fn().mockResolvedValue({
		hits: [],
		query: '',
		processingTimeMs: 0,
		estimatedTotalHits: 0
	});

	return {
		MeiliSearch: vi.fn().mockImplementation(() => ({
			index: vi.fn().mockReturnValue({ search: mockSearch })
		}))
	};
});

vi.mock('$env/dynamic/public', () => ({
	env: {
		PUBLIC_MEILISEARCH_URL: 'http://localhost:7700',
		PUBLIC_MEILISEARCH_SEARCH_KEY: 'test-key'
	}
}));

import { initMeiliSearch, searchCards, searchPrintings } from '../../src/lib/search/meilisearch';

beforeEach(() => {
	initMeiliSearch('test-key');
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
});
