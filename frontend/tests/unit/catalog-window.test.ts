import { describe, expect, it } from 'vitest';
import {
	CatalogWindow,
	cardAt,
	planCatalogPages,
	type CatalogWindowSnapshot
} from '../../src/lib/search/catalogWindow.ts';
import type { CardDocument, SearchResult } from '../../src/lib/search/types.ts';
import type { SearchContextInput } from '../../src/lib/search/requestContext.ts';

const card: CardDocument = {
	id: 'printing',
	oracle_id: 'canonical',
	name: 'Opt',
	lang: 'en',
	released_at: '',
	layout: 'normal',
	mana_cost: '{U}',
	cmc: 1,
	type_line: 'Instant',
	oracle_text: '',
	colors: ['U'],
	color_identity: ['U'],
	keywords: [],
	card_types: ['Instant'],
	rarity: 'common',
	set_code: 'dom',
	set_name: 'Dominaria',
	collector_number: '1',
	image_uri: '',
	image_uri_small: '',
	is_foil_available: true,
	is_nonfoil_available: true,
	legalities: {}
};
function page(offset = 0, generation = 'first', total = 5000, limit = 200): SearchResult {
	return {
		hits: Array.from({ length: Math.min(limit, Math.max(0, total - offset)) }, (_, index) => ({
			...card,
			id: `${generation}-${offset + index}`
		})),
		query: '',
		estimatedTotalHits: total,
		processingTimeMs: 1,
		generationId: generation,
		facets: { colors: { U: total }, rarity: { common: total }, set_code: { dom: total } }
	};
}
function harness() {
	let snapshot!: CatalogWindowSnapshot;
	const requests: {
		input: SearchContextInput;
		offset: number;
		signal: AbortSignal;
		resolve: (value: SearchResult) => void;
		reject: (reason: Error) => void;
	}[] = [];
	const window = new CatalogWindow(
		(next) => {
			snapshot = next;
		},
		(input, offset, signal) =>
			new Promise((resolve, reject) => {
				requests.push({ input, offset, signal, resolve, reject });
			})
	);
	return {
		window,
		requests,
		get snapshot() {
			return snapshot;
		}
	};
}
async function flush() {
	await Promise.resolve();
	await Promise.resolve();
}
async function settle(h: ReturnType<typeof harness>) {
	for (let index = 0; index < h.requests.length; index++) {
		const request = h.requests[index];
		request.resolve(page(request.offset, 'first', 5000, request.input.limit));
		await flush();
	}
}
const lazy: SearchContextInput = {
	game: 'mtg',
	query: '',
	filters: {},
	limit: 200,
	browsingMode: 'lazy'
};
const numeric: SearchContextInput = { ...lazy, browsingMode: 'numeric' };

describe('catalog hybrid range planning', () => {
	it('addresses a deep range directly, prioritizing visible then adjacent ranges within the record budget', () => {
		expect(planCatalogPages({ start: 3400, end: 3700, direction: 1 }, 5000)).toEqual([
			3400, 3600, 3800, 3200
		]);
		expect(planCatalogPages({ start: 3400, end: 3700, direction: -1 }, 5000)).toEqual([
			3400, 3600, 3200, 3800
		]);
		expect(planCatalogPages({ start: 0, end: 200, direction: 1 }, 0)).toEqual([]);
		expect(planCatalogPages({ start: 2000000, end: 2000010, direction: 1 }, 3000000)).toEqual([
			1000000, 999800
		]);
		expect(
			planCatalogPages({ start: 0, end: 10000, direction: 1 }, 50000).length
		).toBeLessThanOrEqual(5);
	});
});
describe('catalog physical request ownership', () => {
	it('retains all three aborted permits until actual settlement across competing queries', async () => {
		const h = harness();
		for (const query of ['one', 'two', 'three', 'four']) {
			h.window.activate({ ...numeric, query });
			h.window.start();
		}
		expect(h.requests).toHaveLength(3);
		expect(h.snapshot.resources?.physicalRequests).toBe(3);
		expect(h.requests.every((r) => r.signal.aborted)).toBe(true);
		h.requests[0].resolve(page(0, 'abandoned'));
		await flush();
		expect(h.requests).toHaveLength(4);
		expect(h.requests[3].input.query).toBe('four');
		expect(h.snapshot.total).toBe(0);
		h.requests[3].resolve(page(0, 'current'));
		await flush();
		expect(cardAt(h.snapshot, 0)?.id).toBe('current-0');
		h.requests[1].resolve(page(0, 'old'));
		h.requests[2].reject(new Error('late failure'));
		await flush();
		expect(h.snapshot.error).toBeNull();
		expect(h.snapshot.resources?.physicalRequests).toBe(0);
	});
	it('does not start competing range fetches while aborted requests remain physically active', async () => {
		const h = harness();
		h.window.activate(lazy);
		h.window.start();
		h.requests[0].resolve(page());
		await flush();
		h.window.setRange({ start: 3400, end: 3700, direction: 1 });
		expect(h.snapshot.resources?.physicalRequests).toBe(3);
		h.window.setRange({ start: 4000, end: 4100, direction: 1 });
		const before = h.requests.length;
		expect(h.requests.filter((r) => !r.signal.aborted).length).toBe(1); // completed first read
		h.requests[1].resolve(page(200));
		await flush();
		expect(h.requests.length).toBe(before + 1);
		expect(h.requests.at(-1)?.offset).toBe(4000);
		expect(h.snapshot.resources?.physicalRequests).toBe(3);
	});
});
describe('catalog numeric pages and publication', () => {
	it.each([100, 200, 500])(
		'loads only the selected %i-row page and validates its facets without reading earlier pages',
		async (limit) => {
			const h = harness();
			h.window.activate({ ...numeric, limit, offset: limit * 7 });
			h.window.start();
			expect(h.requests.map((r) => r.offset)).toEqual([limit * 7]);
			h.requests[0].resolve(page(limit * 7, 'first', 5000, limit));
			await flush();
			expect(h.requests).toHaveLength(1);
			expect(h.snapshot).toMatchObject({
				generation: 'first',
				facets: { colors: { U: 5000 } },
				validated: true,
				anchor: limit * 7
			});
			expect(cardAt(h.snapshot, limit * 7, limit)?.id).toBe(`first-${limit * 7}`);
			h.window.setAnchor(limit * 8);
			h.requests[1].resolve(page(limit * 8, 'first', 5000, limit));
			await flush();
			expect(h.requests.map((r) => r.offset)).toEqual([limit * 7, limit * 8]);
		}
	);
	it('clears all mixed-generation pages and returns to page one on a changed deep-anchor validation', async () => {
		const h = harness();
		h.window.activate({ ...numeric, offset: 3400 });
		h.window.start();
		h.requests[0].resolve(page(3400));
		await flush();
		const reset = h.snapshot.reset;
		h.window.dispose();
		h.window.resume();
		h.requests[1].resolve(page(3400, 'second', 4200));
		await flush();
		expect(h.snapshot).toMatchObject({
			total: 0,
			generation: undefined,
			facets: null,
			reset: reset + 1,
			anchor: 0,
			validated: false
		});
		expect(h.snapshot.pages.size).toBe(0);
		expect(h.requests[2].offset).toBe(0);
		h.requests[2].resolve(page(0, 'second', 4200));
		await flush();
		expect(h.snapshot.pages.size).toBe(1);
		expect(cardAt(h.snapshot, 0)?.id).toBe('second-0');
	});
	it('clamps an out-of-range anchor without fetching every preceding page', async () => {
		const h = harness();
		h.window.activate({ ...numeric, offset: 3400 });
		h.window.start();
		h.requests[0].resolve(page(3400, 'first', 410));
		await flush();
		expect(h.requests.map((r) => r.offset)).toEqual([3400, 400]);
		h.requests[1].resolve(page(400, 'first', 410));
		await flush();
		expect(h.snapshot).toMatchObject({ total: 410, anchor: 400, validated: true });
	});
	it('preserves a resumed deep page while revalidating exactly that anchor', async () => {
		const h = harness();
		h.window.activate({ ...numeric, offset: 3400 });
		h.window.start();
		h.requests[0].resolve(page(3400));
		await flush();
		const reset = h.snapshot.reset;
		h.window.dispose();
		h.window.resume();
		expect(h.requests[1].offset).toBe(3400);
		expect(h.snapshot.reset).toBe(reset);
		h.requests[1].resolve(page(3400));
		await flush();
		expect(h.snapshot.reset).toBe(reset);
		expect(h.snapshot.loading).toBe(false);
	});
	it('distinguishes failed reads from a successful empty result and scopes retry', async () => {
		const h = harness();
		h.window.activate(numeric);
		h.window.start();
		h.requests[0].reject(new Error('Unavailable'));
		await flush();
		expect(h.snapshot).toMatchObject({
			total: 0,
			error: 'Unavailable',
			loading: false,
			validated: false
		});
		h.window.retry();
		expect(h.requests).toHaveLength(2);
		h.requests[1].resolve(page(0, 'first', 0));
		await flush();
		expect(h.snapshot).toMatchObject({ total: 0, error: null, loading: false, validated: true });
	});
});
describe('catalog global cache admission', () => {
	it('bounds all contexts to 1,000 records, twenty pages and four contexts while preserving selected pages', async () => {
		const h = harness();
		for (const query of ['one', 'two', 'three', 'four', 'five']) {
			h.window.activate({ ...numeric, query, limit: 500 });
			h.window.start();
			await settle(h);
			for (let offset = 500; offset < 2500; offset += 500) {
				h.window.setAnchor(offset);
				await settle(h);
				expect(h.snapshot.resources!.records).toBeLessThanOrEqual(1000);
				expect(h.snapshot.resources!.pages).toBeLessThanOrEqual(20);
				expect(h.snapshot.resources!.contexts).toBeLessThanOrEqual(4);
				expect(cardAt(h.snapshot, offset, 500)?.id).toBe(`first-${offset}`);
			}
		}
	});
	it('retains required oversized current evidence and reports byte overflow while suppressing repeated adjacent admission', async () => {
		const h = harness();
		h.window.activate(lazy);
		h.window.start();
		const large = page();
		large.hits[0].oracle_text = 'x'.repeat(9 * 1024 * 1024);
		h.requests[0].resolve(large);
		await flush();
		expect(h.snapshot.resources!.byteOverflow).toBeGreaterThan(0);
		h.requests[1].resolve(page(200));
		await flush();
		expect(h.requests).toHaveLength(2);
		expect(h.snapshot.pages.size).toBe(1);
		expect(cardAt(h.snapshot, 0)?.id).toBe('first-0');
	});
	it('uses different cache contexts for numeric and lazy with the same transport size', async () => {
		const h = harness();
		h.window.activate(numeric);
		h.window.start();
		await settle(h);
		h.window.activate(lazy);
		expect(h.snapshot.pages.size).toBe(0);
	});
	it('counts a retained Kit 500-row seed across mode/context switches and releases it only on owner replacement', async () => {
		const h = harness();
		h.window.activate({ ...numeric, limit: 500, offset: 500 });
		const seed = page(500, 'first', 5000, 500);
		h.window.seed(seed);
		h.window.start();
		expect(h.requests).toHaveLength(0);
		expect(h.snapshot.pages.get(500)).toBe(seed.hits);
		expect(h.snapshot.resources).toMatchObject({
			records: 500,
			pages: 1,
			retainedSeedRecords: 500
		});
		h.window.activate({ ...lazy, query: 'elf' });
		h.window.start();
		await settle(h);
		expect(h.snapshot.resources!.records).toBeLessThanOrEqual(1000);
		expect(h.snapshot.resources!.retainedSeedRecords).toBe(500);
		expect(h.requests.map((r) => r.offset)).toEqual([0, 200]);
		for (const query of ['one', 'two', 'three', 'four']) {
			h.window.activate({ ...lazy, query });
			h.window.start();
			await settle(h);
			expect(h.snapshot.resources!.records).toBeLessThanOrEqual(1000);
			expect(h.snapshot.resources!.contexts).toBeLessThanOrEqual(4);
		}
		h.window.releaseSeed();
		expect(h.snapshot.resources!.retainedSeedRecords).toBe(0);
	});
	it('adopts a replaced native seed without mixing cached generations or reading earlier deep pages', async () => {
		const h = harness();
		h.window.activate({ ...numeric, limit: 500, offset: 500 });
		h.window.seed(page(500, 'first', 5000, 500));
		h.window.start();
		expect(h.requests).toHaveLength(0);
		h.window.dispose();
		expect(h.window.seed(page(500, 'second', 5000, 500))).toBe(false);
		h.window.start();
		expect(h.snapshot).toMatchObject({ anchor: 0, validated: false, publicationReset: 1 });
		expect(h.snapshot.pages.size).toBe(0);
		expect(h.requests.map((r) => r.offset)).toEqual([0]);
		h.requests[0].resolve(page(0, 'second', 5000, 500));
		await flush();
		expect(h.snapshot.resources!.records).toBe(1000);
		expect(h.snapshot.resources!.retainedSeedRecords).toBe(500);
		expect(cardAt(h.snapshot, 0, 500)?.id).toBe('second-0');
	});
});
