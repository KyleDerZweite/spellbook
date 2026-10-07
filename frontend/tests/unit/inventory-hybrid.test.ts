import { describe, expect, it, vi } from 'vitest';
import { InventoryWindow } from '#lib/inventory/window.ts';
import { inventoryQueryFromUrl, inventoryQueryKey } from '@spellbook/backend/inventory/query.ts';
import type {
	InventoryEntry,
	InventoryPage,
	InventoryQuery
} from '@spellbook/contracts/inventory.ts';
vi.mock('#lib/server/data/inventory-window.ts', () => ({ inventoryQueryFromUrl }));
import { inventoryBrowseQuery } from '#lib/server/data/inventory-browsing.ts';
const query = inventoryQueryFromUrl(new URL('http://local/api/mobile/v1/mtg/inventory?limit=200'));
function result(input: InventoryQuery, notes = ''): InventoryPage {
	const entries: InventoryEntry[] = Array.from({ length: input.limit }, (_, index) => ({
		id: String(input.offset + index),
		accountId: 'owner',
		inventoryId: 'inventory',
		game: 'mtg',
		catalogCardId: 'printing',
		canonicalCardId: 'canonical',
		name: 'Card',
		setCode: 'set',
		imageUri: '',
		quantity: 1,
		finish: 'nonfoil',
		condition: 'NM',
		notes,
		notesRevision: '0',
		spellbookPosition: input.offset + index,
		createdAt: '2026-10-07T00:00:00Z',
		updatedAt: '2026-10-07T00:00:00Z'
	}));
	return {
		kind: 'Page',
		query: input,
		queryKey: inventoryQueryKey(input),
		revision: '1',
		entries,
		memberships: [],
		groups: [],
		groupPage: [],
		groupCount: 0,
		matching: { entryCount: 50000, copyCount: 50000 },
		totals: {
			entryCount: 50000,
			copyCount: 50000,
			canonicalCardCount: 10000,
			foilEntryCount: 0,
			setCount: 1
		},
		sets: [],
		setProgress: null,
		viewedAt: '2026-10-07T00:00:00Z'
	};
}
describe('Inventory hybrid browser addressing', () => {
	it.each([
		['', 200, 0],
		['page=3&pageSize=100', 100, 200],
		['page=10&pageSize=500', 500, 4500],
		['page=125&pageSize=lazy', 200, 24800],
		['page=bad&pageSize=500', 500, 0],
		['page=4&pageSize=bad', 200, 600]
	])('translates %s independently before the legacy parser', (params, limit, offset) => {
		const { query, pagination } = inventoryBrowseQuery(
			new URL(`http://local/mtg/inventory?${params}&set=DOM&set=dom&finish=foil`)
		);
		expect(query).toMatchObject({ limit, offset, sets: ['dom'], finish: 'foil' });
		expect(pagination).toMatchObject({ limit, offset });
	});
	it('ignores wire addressing on the browser route without changing legacy API defaults', () => {
		expect(
			inventoryBrowseQuery(new URL('http://local/mtg/inventory?offset=999&limit=1')).query
		).toMatchObject({ offset: 0, limit: 200 });
		expect(
			inventoryQueryFromUrl(new URL('http://local/api/mobile/v1/mtg/inventory'))
		).toMatchObject({ offset: 0, limit: 50 });
	});
});
it('keeps numeric size and mode separate despite unchanged legacy wire query keys', async () => {
	const transport = vi.fn(async (input: InventoryQuery) => result(input));
	const window = new InventoryWindow(transport, () => {});
	window.seed('owner', result(query), () => true, false, 'numeric');
	const firstKey = window.queryIdentity;
	await window.open(
		'owner',
		{ ...query, limit: 500, offset: 4500 },
		new AbortController().signal,
		'numeric'
	);
	expect(window.current?.query).toMatchObject({ limit: 500, offset: 4500 });
	expect(window.current?.queryKey).toBe(inventoryQueryKey(query));
	expect(window.queryIdentity).not.toBe(firstKey);
	const numericKey = window.queryIdentity;
	await window.open('owner', { ...query, offset: 24800 }, new AbortController().signal, 'lazy');
	expect(window.queryIdentity).not.toBe(numericKey);
	expect(window.at(24800)?.id).toBe('24800');
	window.clear();
});
it.each([100, 200, 500])(
	'plans only the selected numeric %i page and aligns location with that size',
	async (limit) => {
		const transport = vi.fn(async (input: InventoryQuery) => result(input));
		const window = new InventoryWindow(transport, () => {});
		window.seed(
			'owner',
			result({ ...query, limit, offset: limit * 4 }),
			() => true,
			false,
			'numeric'
		);
		window.plan(limit * 4, limit * 5);
		expect(transport).not.toHaveBeenCalled();
		await window.locateAndLoad(
			'located',
			async () => ({ kind: 'Location', revision: '1', index: limit * 12 + 37 }),
			new AbortController().signal
		);
		expect(transport).toHaveBeenCalledOnce();
		expect(transport.mock.calls[0][0]).toMatchObject({ limit, offset: limit * 12 });
		expect(window.at(limit * 12 + 37)?.id).toBe(String(limit * 12 + 37));
		window.clear();
	}
);
it('bounds cache by records across contexts and finite Lazy neighbors without repeated fetch thrash', async () => {
	const transport = vi.fn(async (input: InventoryQuery) => result(input));
	const window = new InventoryWindow(transport, () => {});
	window.seed('owner', result(query), () => true, false, 'lazy');
	window.plan(24800, 25000);
	await vi.waitFor(() => expect(window.metrics().requests).toBe(0));
	expect(window.metrics().entries).toBeLessThanOrEqual(1000);
	const calls = transport.mock.calls.length;
	for (let i = 0; i < 20; i++) window.plan(24800, 25000);
	await vi.waitFor(() => expect(window.metrics().requests).toBe(0));
	expect(transport.mock.calls.length).toBe(calls);
	for (let i = 0; i < 6; i++) {
		window.seed(
			'owner',
			result({ ...query, q: String(i), limit: 500 }),
			() => true,
			false,
			'numeric'
		);
		expect(window.metrics().entries).toBeLessThanOrEqual(1000);
		expect(window.metrics().pages).toBeLessThanOrEqual(20);
		expect(window.metrics().contexts).toBeLessThanOrEqual(4);
	}
	window.clear();
});
it('evicts other pages before preserving a valid oversized active page and reports its byte target overflow', () => {
	const window = new InventoryWindow(
		async (input) => result(input),
		() => {}
	);
	window.seed('owner', result({ ...query, q: 'prior', limit: 500 }), () => true, false, 'numeric');
	const oversized = result({ ...query, limit: 500 });
	oversized.groups = [
		{ id: 'valid-metadata', name: 'x'.repeat(34 * 1024 * 1024), entryCount: 1, quantity: 1 }
	];
	window.seed('owner', oversized, () => true, false, 'numeric');
	expect(window.at(0)?.id).toBe('0');
	expect(window.metrics()).toMatchObject({ pages: 1, entries: 500 });
	expect(window.metrics().byteOverflow).toBeGreaterThan(0);
	expect(window.metrics().metadataOverflow).toBeGreaterThan(0);
	window.clear();
});
it('retains aborted physical permits across mode replacement until underlying transports settle', async () => {
	const pending: Array<{
		input: InventoryQuery;
		signal: AbortSignal;
		finish: (page: InventoryPage) => void;
	}> = [];
	const window = new InventoryWindow(
		(input, _revision, signal) =>
			new Promise((resolve) => pending.push({ input, signal, finish: resolve })),
		() => {}
	);
	window.seed('owner', result(query), () => true, false, 'lazy');
	window.plan(24800, 25000);
	expect(pending).toHaveLength(3);
	const replacement = window.open(
		'owner',
		{ ...query, limit: 500, offset: 4500 },
		new AbortController().signal,
		'numeric'
	);
	expect(pending).toHaveLength(3);
	expect(pending.every((request) => request.signal.aborted)).toBe(true);
	pending[0].finish(result(pending[0].input));
	await vi.waitFor(() => expect(pending).toHaveLength(4));
	expect(window.metrics().requests).toBe(3);
	for (const request of pending.slice(1)) request.finish(result(request.input));
	await replacement;
	expect(window.current?.query).toMatchObject({ offset: 4500, limit: 500 });
	expect(window.metrics().requests).toBe(0);
	window.clear();
});

it('reserves the exact retained 500-entry SSR page across a different-query Lazy window', async () => {
	const transport = vi.fn(async (input: InventoryQuery) => result(input));
	const window = new InventoryWindow(transport, () => {});
	const seed = result({ ...query, limit: 500 });
	window.pinServerPage(seed);
	window.seed('owner', seed, () => true, false, 'numeric');
	expect(window.metrics()).toMatchObject({
		pages: 1,
		entries: 500,
		pinnedSSRPages: 1,
		pinnedSSREntries: 500
	});
	await window.open(
		'owner',
		{ ...query, q: 'other', offset: 24800 },
		new AbortController().signal,
		'lazy'
	);
	window.plan(24800, 24995);
	await vi.waitFor(() => expect(window.metrics().requests).toBe(0));
	expect(window.metrics().entries).toBeLessThanOrEqual(1000);
	expect(window.metrics().entries).toBe(900);
	expect(window.metrics().pinnedSSREntries).toBe(500);
	const calls = transport.mock.calls.length;
	for (let i = 0; i < 20; i++) window.plan(24800, 24995);
	await vi.waitFor(() => expect(window.metrics().requests).toBe(0));
	expect(transport.mock.calls).toHaveLength(calls);
	window.clear();
	expect(window.metrics()).toMatchObject({ entries: 500, pages: 1 });
	window.clear(true);
	expect(window.metrics()).toMatchObject({ entries: 0, pages: 0 });
});

it('keeps required visible ranges and avoids oversized-metadata adjacent refetch thrash', async () => {
	const oversized = result(query);
	oversized.groups = [
		{ id: 'valid-metadata', name: 'x'.repeat(34 * 1024 * 1024), entryCount: 1, quantity: 1 }
	];
	const transport = vi.fn(async (input: InventoryQuery) => ({
		...result(input),
		groups: oversized.groups
	}));
	const window = new InventoryWindow(transport, () => {});
	window.seed('owner', oversized, () => true, false, 'lazy');
	window.plan(190, 385);
	await vi.waitFor(() => expect(window.metrics().requests).toBe(0));
	expect(window.at(190)?.id).toBe('190');
	expect(window.at(384)?.id).toBe('384');
	const calls = transport.mock.calls.length;
	for (let i = 0; i < 10; i++) window.plan(190, 385);
	await vi.waitFor(() => expect(window.metrics().requests).toBe(0));
	expect(transport.mock.calls).toHaveLength(calls);
	expect(window.metrics().entries).toBeLessThanOrEqual(1000);
	expect(window.metrics().byteOverflow).toBeGreaterThan(0);
	window.clear(true);
});

it('remembers a large evicted neighbor admission cost instead of repeatedly fetching it', async () => {
	const transport = vi.fn(async (input: InventoryQuery) =>
		result(input, input.offset ? 'x'.repeat(180000) : '')
	);
	const window = new InventoryWindow(transport, () => {});
	window.seed('owner', result(query), () => true, false, 'lazy');
	window.plan(0, 10);
	await vi.waitFor(() => expect(window.metrics().requests).toBe(0));
	const calls = transport.mock.calls.length;
	for (let index = 0; index < 10; index++) window.plan(0, 10);
	await vi.waitFor(() => expect(window.metrics().requests).toBe(0));
	expect(transport.mock.calls.length).toBe(calls);
	expect(window.at(0)?.id).toBe('0');
	window.clear(true);
});
