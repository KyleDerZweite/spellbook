import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	browseCards,
	getSetCatalogSize,
	searchCards,
	searchPrintings
} from '../../src/lib/search/catalog.ts';

const fetchMock = vi.fn<typeof fetch>();
const empty = {
	hits: [],
	query: '',
	processingTimeMs: 0,
	estimatedTotalHits: 0,
	generationId: 'first'
};

beforeEach(() => {
	fetchMock.mockReset();
	fetchMock.mockImplementation(async () => Response.json(empty));
	vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('authenticated catalog client', () => {
	it('skips short queries, blank identities and unsupported games', async () => {
		for (const query of ['', 'a', '  ']) expect((await searchCards(query)).hits).toEqual([]);
		expect((await searchPrintings('')).hits).toEqual([]);
		expect(await getSetCatalogSize(' ')).toBe(0);
		await expect(browseCards({ game: 'pokemon' })).rejects.toThrow('not available');
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('sends typed filters and pagination to the same-origin API with cancellation', async () => {
		const controller = new AbortController();
		await searchCards(' bolt ', {
			filters: {
				colors: ['R', 'C'],
				rarities: ['rare'],
				types: ['Instant'],
				legalities: ['modern']
			},
			limit: 50,
			offset: 100,
			signal: controller.signal
		});
		const [url, options] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/catalog/search');
		expect(options).toMatchObject({
			method: 'POST',
			credentials: 'same-origin',
			cache: 'no-store',
			headers: { 'Content-Type': 'application/json' },
			signal: controller.signal
		});
		expect(JSON.parse(options!.body as string)).toEqual({
			query: 'bolt',
			filters: {
				colors: ['R', 'C'],
				rarities: ['rare'],
				types: ['Instant'],
				legalities: ['modern']
			},
			limit: 50,
			offset: 100
		});
	});

	it('browses without a query in alphabetical order', async () => {
		await browseCards();
		expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({
			query: '',
			limit: 50,
			offset: 0,
			sort: 'name:asc'
		});
	});

	it('requests matching facets with the document page and preserves generation', async () => {
		const facets = { colors: { R: 4 }, rarity: { rare: 4 }, set_code: { dom: 2 } };
		fetchMock.mockResolvedValueOnce(Response.json({ ...empty, query: 'bolt', facets }));
		const result = await searchCards('bolt', { filters: { rarities: ['rare'] }, facets: true });
		expect(result.facets).toEqual(facets);
		expect(result.generationId).toBe('first');
		expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({
			query: 'bolt',
			filters: { rarities: ['rare'] },
			limit: 20,
			offset: 0,
			facets: true
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('uses a set-filtered canonical count for inventory progress', async () => {
		fetchMock.mockResolvedValueOnce(Response.json({ ...empty, estimatedTotalHits: 269 }));
		expect(await getSetCatalogSize(' DOM ')).toBe(269);
		expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({
			query: '',
			filters: { sets: ['dom'] },
			limit: 0
		});
	});

	it('loads printing pages within the API limit and requested total', async () => {
		const first = Array.from({ length: 100 }, (_, i) => ({ id: `printing-${i}` }));
		const last = Array.from({ length: 5 }, (_, i) => ({ id: `printing-${i + 100}` }));
		fetchMock.mockResolvedValueOnce(
			Response.json({ ...empty, hits: first, estimatedTotalHits: 110 })
		);
		fetchMock.mockResolvedValueOnce(
			Response.json({ ...empty, hits: last, estimatedTotalHits: 110 })
		);
		const controller = new AbortController();
		const result = await searchPrintings('oracle-id', { limit: 105, signal: controller.signal });
		expect(result.hits).toHaveLength(105);
		expect(result.estimatedTotalHits).toBe(110);
		expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
			'/api/catalog/cards/oracle-id/printings?limit=100&offset=0',
			'/api/catalog/cards/oracle-id/printings?limit=5&offset=100'
		]);
		expect(fetchMock.mock.calls.every(([, options]) => options?.signal === controller.signal)).toBe(
			true
		);
	});

	it('rejects printing pages from different catalog publications', async () => {
		fetchMock.mockResolvedValueOnce(
			Response.json({ ...empty, hits: [{ id: 'first' }], estimatedTotalHits: 2 })
		);
		fetchMock.mockResolvedValueOnce(
			Response.json({
				...empty,
				hits: [{ id: 'second' }],
				estimatedTotalHits: 2,
				generationId: 'second'
			})
		);
		await expect(searchPrintings('oracle-id')).rejects.toThrow('catalog changed');
	});

	it('stops when a printing page is empty even if the count is larger', async () => {
		fetchMock.mockResolvedValueOnce(Response.json({ ...empty, estimatedTotalHits: 50 }));
		expect((await searchPrintings('oracle-id')).hits).toEqual([]);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('preserves cancellation failures', async () => {
		const aborted = new DOMException('The operation was aborted', 'AbortError');
		fetchMock.mockRejectedValueOnce(aborted);
		await expect(searchCards('bolt')).rejects.toBe(aborted);
	});

	it('reports API errors and handles non-JSON error responses', async () => {
		fetchMock.mockResolvedValueOnce(
			Response.json({ message: 'Authentication required' }, { status: 401 })
		);
		await expect(browseCards()).rejects.toThrow('Authentication required');
		fetchMock.mockResolvedValueOnce(new Response('upstream unavailable', { status: 502 }));
		await expect(browseCards()).rejects.toThrow('Catalog search failed');
	});
});
