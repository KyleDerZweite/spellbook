import { describe, expect, it } from 'vitest';
import {
	CatalogWindow,
	cardAt,
	planCatalogPages,
	type CatalogWindowSnapshot
} from '../../src/lib/search/catalogWindow.ts';
import type { CardDocument, SearchResult } from '../../src/lib/search/types.ts';
import type { SearchContextInput } from '../../src/lib/search/requestContext.ts';

const input: SearchContextInput = { game: 'mtg', query: '', filters: {}, limit: 50 };
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
function page(offset = 0, generation = 'first', total = 5000): SearchResult {
	return {
		hits: Array.from({ length: Math.min(50, Math.max(0, total - offset)) }, (_, index) => ({
			...card,
			id: `${generation}-${offset + index}`
		})),
		query: '',
		estimatedTotalHits: total,
		processingTimeMs: 1,
		generationId: generation,
		...(offset === 0
			? { facets: { colors: { U: total }, rarity: { common: total }, set_code: { dom: total } } }
			: {})
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
		h.requests[index].resolve(page(h.requests[index].offset));
		await flush();
	}
}

describe('catalog range planning', () => {
	it('addresses a far jump directly and prioritizes visible pages over adjacent prefetch', () => {
		expect(planCatalogPages({ start: 3500, end: 3600, direction: 1 }, 5000)).toEqual([
			3500, 3550, 3600, 3450
		]);
		expect(planCatalogPages({ start: 3500, end: 3600, direction: -1 }, 5000)).toEqual([
			3500, 3550, 3450, 3600
		]);
	});
	it('bounds empty, last, extreme and oversized windows to API offsets', () => {
		expect(planCatalogPages({ start: 0, end: 50, direction: 1 }, 0)).toEqual([]);
		expect(planCatalogPages({ start: 100, end: 150, direction: 1 }, 101)).toEqual([100, 50]);
		expect(planCatalogPages({ start: 2000000, end: 2000010, direction: 1 }, 3000000)).toEqual([
			1000000, 999950
		]);
		expect(
			planCatalogPages({ start: 0, end: 10000, direction: 1 }, 50000).length
		).toBeLessThanOrEqual(12);
	});
});

describe('bounded catalog window', () => {
	it('keeps total, facets and generation together, deduplicates and limits requests', async () => {
		const h = harness();
		h.window.activate(input);
		h.window.start();
		expect(h.requests).toHaveLength(1);
		h.requests[0].resolve(page());
		await flush();
		expect(h.snapshot).toMatchObject({
			total: 5000,
			generation: 'first',
			facets: { colors: { U: 5000 } }
		});
		h.window.setRange({ start: 3500, end: 3600, direction: 1 });
		expect(h.requests[1].signal.aborted).toBe(true);
		expect(h.requests.slice(2).map((request) => request.offset)).toEqual([3500, 3550, 3600]);
		h.window.setRange({ start: 3500, end: 3600, direction: 1 });
		expect(h.requests).toHaveLength(5);
		expect(cardAt(h.snapshot, 3500)).toBeUndefined();
		h.requests[2].resolve(page(3500));
		await flush();
		expect(cardAt(h.snapshot, 3500)?.id).toBe('first-3500');
		expect(h.requests.at(-1)?.offset).toBe(3450);
	});
	it('bounds page sizes to the existing API contract', () => {
		const h = harness();
		h.window.activate({ ...input, limit: 200 });
		h.window.start();
		expect(h.requests[0].input.limit).toBe(100);
		h.window.activate({ ...input, limit: 0 });
		h.window.start();
		expect(h.requests[1].input.limit).toBe(1);
	});

	it('ignores abandoned range and context results even when fetch ignores abort', async () => {
		const h = harness();
		h.window.activate(input);
		h.window.start();
		const abandoned = h.requests[0];
		h.window.activate({ ...input, query: 'bolt' });
		h.window.start();
		expect(abandoned.signal.aborted).toBe(true);
		abandoned.resolve(page(0, 'old', 9000));
		await flush();
		expect(h.snapshot.total).toBe(0);
		h.requests[1].resolve(page(0, 'new', 100));
		await flush();
		h.window.setRange({ start: 75, end: 100, direction: 1 });
		const staleRange = h.requests[2];
		h.window.activate(input);
		h.window.start();
		staleRange.resolve(page(50, 'new', 100));
		await flush();
		expect(h.snapshot.pages.size).toBe(0);
		expect(h.snapshot.generation).toBeUndefined();
	});
	it('restarts atomically after publication and rejects stale concurrent pages', async () => {
		const h = harness();
		h.window.activate(input);
		h.window.start();
		h.requests[0].resolve(page());
		await flush();
		h.window.setRange({ start: 500, end: 600, direction: 1 });
		const changed = h.requests[2];
		const stale = h.requests[3];
		const reset = h.snapshot.reset;
		changed.resolve(page(500, 'second', 300));
		await flush();
		expect(h.snapshot).toMatchObject({
			total: 0,
			facets: null,
			generation: undefined,
			reset: reset + 1
		});
		expect(h.snapshot.pages.size).toBe(0);
		expect(stale.signal.aborted).toBe(true);
		stale.resolve(page(550));
		await flush();
		h.requests.at(-1)!.resolve(page(0, 'second', 300));
		await flush();
		expect(h.snapshot).toMatchObject({
			total: 300,
			generation: 'second',
			facets: { colors: { U: 300 } }
		});
		expect(
			[...h.snapshot.pages.values()].flat().every((card) => card.id.startsWith('second-'))
		).toBe(true);
	});
	it('reuses known contexts while revalidating page zero before range requests', async () => {
		const h = harness();
		h.window.activate(input);
		h.window.start();
		await settle(h);
		h.window.activate({ ...input, query: 'bolt' });
		h.window.start();
		await settle(h);
		h.window.activate(input);
		expect(cardAt(h.snapshot, 0)?.id).toBe('first-0');
		expect(h.snapshot.loading).toBe(true);
		const before = h.requests.length;
		h.window.start();
		h.window.setRange({ start: 3000, end: 3050, direction: 1 });
		expect(h.requests.slice(before).map((request) => request.offset)).toEqual([0]);
		h.requests.at(-1)!.resolve(page(0, 'second', 42));
		await flush();
		expect(h.snapshot.total).toBe(42);
		expect(cardAt(h.snapshot, 0)?.id).toBe('second-0');
	});
	it('evicts old pages and contexts while keeping the current range available', async () => {
		const h = harness();
		h.window.activate(input);
		h.window.start();
		await settle(h);
		for (let start = 500; start < 5000; start += 500) {
			h.window.setRange({ start, end: start + 50, direction: 1 });
			await settle(h);
			expect(h.snapshot.pages.size).toBeLessThanOrEqual(20);
			expect(cardAt(h.snapshot, start)?.id).toBe(`first-${start}`);
		}
		expect(cardAt(h.snapshot, 0)).toBeUndefined();
		for (const query of ['one', 'two', 'three', 'four']) {
			h.window.activate({ ...input, query });
			h.window.start();
			await settle(h);
		}
		h.window.activate(input);
		expect(h.snapshot.total).toBe(0);
	});
	it('exposes failed ranges, preserves loaded cards, and retries only failed missing pages', async () => {
		const h = harness();
		h.window.activate(input);
		h.window.start();
		h.requests[0].resolve(page());
		await flush();
		h.requests[1].reject(new Error('Network unavailable'));
		await flush();
		expect(h.snapshot.error).toBe('Network unavailable');
		expect(cardAt(h.snapshot, 0)?.id).toBe('first-0');
		expect(h.snapshot.loading).toBe(false);
		const before = h.requests.length;
		h.window.retry();
		expect(h.requests.slice(before).map((request) => request.offset)).toEqual([50]);
		h.requests.at(-1)!.resolve(page(50));
		await flush();
		expect(h.snapshot.error).toBeNull();
		expect(h.snapshot.loading).toBe(false);
	});
});

describe('catalog workspace resume', () => {
	it('revalidates a hidden workspace without resetting its range or cached pages', async () => {
		const h = harness();
		h.window.activate(input);
		h.window.start();
		await settle(h);
		h.window.setRange({ start: 3000, end: 3050, direction: 1 });
		await settle(h);
		const reset = h.snapshot.reset;
		h.window.dispose();
		const before = h.requests.length;
		h.window.setRange({ start: 3000, end: 3050, direction: 1 });
		expect(h.requests).toHaveLength(before);
		h.window.resume();
		expect(h.requests.slice(before).map((request) => request.offset)).toEqual([0]);
		expect(h.snapshot.reset).toBe(reset);
		expect(cardAt(h.snapshot, 3000)?.id).toBe('first-3000');
		h.requests.at(-1)!.resolve(page());
		await flush();
		expect(h.snapshot.reset).toBe(reset);
		expect(h.snapshot.loading).toBe(false);
		expect(cardAt(h.snapshot, 3000)?.id).toBe('first-3000');
	});

	it('resets resumed results when publication changed while Search was hidden', async () => {
		const h = harness();
		h.window.activate(input);
		h.window.start();
		await settle(h);
		const reset = h.snapshot.reset;
		h.window.dispose();
		h.window.resume();
		h.requests.at(-1)!.resolve(page(0, 'second', 12));
		await flush();
		expect(h.snapshot.reset).toBe(reset + 1);
		expect(h.snapshot.total).toBe(12);
		expect(cardAt(h.snapshot, 0)?.id).toBe('second-0');
	});
});
