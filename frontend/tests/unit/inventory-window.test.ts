import { it, expect } from 'vitest';
import { InventoryWindow } from '#lib/inventory/window.ts';
import type { InventoryPage, InventoryQuery } from '@spellbook/contracts/inventory.ts';
const query: InventoryQuery = {
	q: '',
	sets: [],
	finish: 'all',
	condition: 'all',
	sort: 'name',
	dir: 'asc',
	variant: null,
	variantDir: 'asc',
	view: 'cards',
	group: null,
	offset: 0,
	limit: 50
};
function page(offset = 0, q = query.q, revision = '1'): InventoryPage {
	return {
		kind: 'Page',
		query: { ...query, q, offset },
		queryKey: q,
		revision,
		entries: [],
		groups: [],
		groupPage: [],
		groupCount: 0,
		memberships: [],
		matching: { entryCount: 50000, copyCount: 50000 },
		totals: {
			entryCount: 50000,
			copyCount: 50000,
			canonicalCardCount: 50000,
			foilEntryCount: 0,
			setCount: 0
		},
		sets: [],
		setProgress: null,
		viewedAt: '2026-10-07T00:00:00Z'
	};
}
it('evicts pages globally and clears protected state on account change', async () => {
	const window = new InventoryWindow(
		async (q, revision) => page(q.offset, q.q, revision),
		() => {}
	);
	window.seed('owner', page());
	for (let context = 0; context < 5; context++) {
		window.seed('owner', page(0, String(context)));
		for (let index = 0; index < 8; index++) await window.request(index * 50);
	}
	expect(window.metrics().contexts).toBeLessThanOrEqual(4);
	expect(window.metrics().pages).toBeLessThanOrEqual(20);
	window.clear();
	expect(window.metrics()).toMatchObject({ contexts: 0, pages: 0, requests: 0 });
});
it('resets a changed revision without mixing page identities', async () => {
	let calls = 0;
	const window = new InventoryWindow(
		async (q, revision) => {
			calls++;
			return revision ? { kind: 'RevisionChanged', revision: '2' } : page(0, '', '2');
		},
		() => {}
	);
	window.seed('owner', page());
	await window.request(50);
	expect(window.current?.revision).toBe('2');
	expect(window.metrics().pages).toBe(1);
	expect(calls).toBe(2);
});

it('keeps rapid-jump request planning bounded', async () => {
	const requests: Array<{ signal: AbortSignal; resolve: (page: InventoryPage) => void }> = [];
	const window = new InventoryWindow(
		(_query, _revision, signal) => new Promise((resolve) => requests.push({ signal, resolve })),
		() => {}
	);
	window.seed('owner', page());
	for (let index = 0; index < 100; index++) window.plan(index * 500, index * 500 + 100);
	expect(window.metrics().requests).toBeLessThanOrEqual(3);
	expect(window.metrics().queued).toBeLessThanOrEqual(12);
	expect(requests.slice(0, 3).every((r) => r.signal.aborted)).toBe(true);
	window.clear();
	for (const request of requests) request.resolve(page());
});

it('cancels old pages before a filter replacement and bounds its transport slot', async () => {
	const requests: Array<{
		query: InventoryQuery;
		signal: AbortSignal;
		resolve: (page: InventoryPage) => void;
	}> = [];
	const window = new InventoryWindow(
		(query, _revision, signal) =>
			new Promise((resolve) => requests.push({ query, signal, resolve })),
		() => {}
	);
	window.seed('owner', page());
	window.plan(500, 600);
	const controller = new AbortController();
	const replacing = window.open('owner', { ...query, q: 'new' }, controller.signal);
	expect(requests).toHaveLength(3);
	expect(requests.every((r) => r.signal.aborted)).toBe(true);
	for (const request of requests) request.resolve(page(request.query.offset));
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(requests).toHaveLength(4);
	expect(window.metrics().requests).toBe(1);
	window.plan(900, 1000);
	expect(requests).toHaveLength(4);
	requests[3].resolve(page(0, 'new'));
	await replacing;
	expect(window.current?.query.q).toBe('new');
	expect(window.metrics().requests).toBe(0);
});

it('retains entries only in budgeted cache pages, independently of current metadata', async () => {
	const initial = page();
	const entry: import('@spellbook/contracts/inventory.ts').InventoryEntry = {
		id: 'entry',
		accountId: 'owner',
		inventoryId: 'inventory',
		game: 'mtg',
		catalogCardId: 'printing',
		canonicalCardId: 'oracle',
		name: 'Card',
		setCode: 'set',
		imageUri: '',
		quantity: 1,
		finish: 'nonfoil',
		condition: 'NM',
		notes: '',
		notesRevision: '0',
		spellbookPosition: 0,
		createdAt: initial.viewedAt,
		updatedAt: initial.viewedAt
	};
	initial.entries = [entry];
	const window = new InventoryWindow(
		async (q) => page(q.offset),
		() => {}
	);
	window.seed('owner', initial);
	expect(window.current?.entries).toEqual([]);
	expect(window.at(0)).toBe(entry);
	expect(window.metrics().entries).toBe(1);
	for (let i = 1; i <= 20; i++) await window.request(i * 50);
	expect(window.at(0)).toBeUndefined();
	expect(window.current?.entries).toEqual([]);
	expect(window.metrics().entries).toBe(0);
});
