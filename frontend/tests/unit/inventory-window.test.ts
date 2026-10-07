import { it, expect, vi } from 'vitest';
import { createServer } from 'node:http';
import { InventoryWindow } from '#lib/inventory/window.ts';
import { inventoryRowSlots } from '#lib/inventory/rows.ts';
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
	expect(requests.slice(0, 3).every((r) => !r.signal.aborted)).toBe(true);
	window.clear();
	expect(requests.slice(0, 3).every((r) => r.signal.aborted)).toBe(true);
	for (const request of requests) request.resolve(page());
});

it('keeps HTTP work bounded through rapid plans until a response completes', async () => {
	const started: number[] = [];
	const pending = new Map<number, () => void>();
	let serverPeak = 0,
		abortRejections = 0;
	const server = createServer((request, response) => {
		const url = new URL(request.url!, 'http://local');
		if (url.pathname === '/barrier') {
			response.end('ready');
			return;
		}
		const offset = Number(url.searchParams.get('offset'));
		started.push(offset);
		pending.set(offset, () => {
			pending.delete(offset);
			response.setHeader('content-type', 'application/json');
			response.end(JSON.stringify(page(offset)));
		});
		serverPeak = Math.max(serverPeak, pending.size);
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const address = server.address();
	if (!address || typeof address === 'string') throw Error('Expected isolated HTTP port');
	const origin = `http://127.0.0.1:${address.port}`;
	const transportStarts: number[] = [];
	const window = new InventoryWindow(
		async (q, _revision, signal) => {
			transportStarts.push(q.offset);
			try {
				const response = await fetch(`${origin}/page?offset=${q.offset}`, { signal });
				return await response.json();
			} catch (cause) {
				if (signal.aborted) abortRejections++;
				throw cause;
			}
		},
		() => {}
	);
	const barrier = async () => {
		const response = await fetch(`${origin}/barrier`);
		await response.text();
	};
	try {
		window.seed('owner', page());
		window.plan(500, 600);
		await vi.waitFor(() => expect(pending.size).toBe(3));
		window.plan(2000, 2100);
		window.plan(4000, 4100);
		await barrier();
		await vi.waitFor(() => expect(started).toHaveLength(transportStarts.length));
		expect.soft(pending.size).toBe(3);
		expect.soft(abortRejections).toBe(0);
		expect(transportStarts).toEqual([450, 500, 550]);
		pending.get(450)!();
		await vi.waitFor(() => expect(started).toHaveLength(4));
		expect(started[3]).toBe(3950);
		expect(pending.size).toBe(3);
		for (let i = 0; i < 10 && (window.metrics().requests || window.metrics().queued); i++) {
			for (const finish of [...pending.values()]) finish();
			await barrier();
		}
		await vi.waitFor(() => expect(window.metrics().requests).toBe(0));
		expect(transportStarts).toEqual([450, 500, 550, 3950, 4000, 4050, 4100, 4150]);
		expect(started.toSorted((a, b) => a - b)).toEqual(transportStarts);
		expect(serverPeak).toBe(3);
		expect(window.metrics()).toMatchObject({ contexts: 1, pages: 9, queued: 0 });
	} finally {
		window.clear();
		for (const finish of [...pending.values()]) finish();
		const closed = new Promise<void>((resolve) => server.close(() => resolve()));
		server.closeAllConnections();
		await closed;
	}
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

it('bounds overlapping replacements while three older transports delay abort', async () => {
	let active = 0,
		peak = 0;
	const requests: Array<{ q: InventoryQuery; finish: () => void; signal: AbortSignal }> = [];
	const window = new InventoryWindow(
		(q, _revision, signal) =>
			new Promise((resolve) => {
				active++;
				peak = Math.max(peak, active);
				requests.push({
					q,
					signal,
					finish: () => {
						active--;
						resolve(page(q.offset, q.q));
					}
				});
			}),
		() => {}
	);
	window.seed('owner', page());
	window.plan(500, 600);
	const first = window.open('owner', { ...query, q: 'first' }, new AbortController().signal);
	const latest = window.open('owner', { ...query, q: 'latest' }, new AbortController().signal);
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(active).toBe(3);
	expect(requests).toHaveLength(3);
	expect(requests.every((r) => r.signal.aborted)).toBe(true);
	requests[0].finish();
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(requests).toHaveLength(4);
	expect(requests[3].q.q).toBe('latest');
	expect(active).toBe(3);
	requests.slice(1).forEach((r) => r.finish());
	await Promise.all([first, latest]);
	expect(window.current?.query.q).toBe('latest');
	expect(peak).toBe(3);
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

it('discards a location that finishes after query replacement', async () => {
	let finish!: (result: import('@spellbook/contracts/inventory.ts').InventoryLocation) => void;
	let requests = 0;
	const window = new InventoryWindow(
		async (q) => {
			requests++;
			return page(q.offset, q.q);
		},
		() => {}
	);
	window.seed('owner', page());
	const located = window.locateAndLoad(
		'entry',
		() =>
			new Promise((resolve) => {
				finish = resolve;
			}),
		new AbortController().signal
	);
	window.seed('owner', page(0, 'replacement'));
	finish({ kind: 'Location', revision: '1', index: 500 });
	expect(await located).toBeNull();
	expect(requests).toBe(0);
	expect(window.metrics().pages).toBe(2);
});

it('resets and retries a location revision before loading its page', async () => {
	const window = new InventoryWindow(
		async (q) => page(q.offset, q.q, '2'),
		() => {}
	);
	window.seed('owner', page());
	let calls = 0;
	const located = await window.locateAndLoad(
		'entry',
		async () =>
			++calls === 1
				? { kind: 'RevisionChanged', revision: '2' }
				: { kind: 'Location', revision: '2', index: 75 },
		new AbortController().signal
	);
	expect(calls).toBe(2);
	expect(window.current?.revision).toBe('2');
	expect(located).toEqual({ identity: window.identity, index: 75 });
	expect(window.metrics().pages).toBe(2);
});

it('retries after a revision reset while loading the located page', async () => {
	const window = new InventoryWindow(
		async (q, revision) =>
			revision === '1' ? { kind: 'RevisionChanged', revision: '2' } : page(q.offset, q.q, '2'),
		() => {}
	);
	window.seed('owner', page());
	let calls = 0;
	const result = await window.locateAndLoad(
		'entry',
		async (_q, _id, revision) => ({ kind: 'Location', revision, index: ++calls === 1 ? 75 : 76 }),
		new AbortController().signal
	);
	expect(calls).toBe(2);
	expect(result).toEqual({ identity: window.identity, index: 76 });
});

it('discards a loaded location page after a different query was activated', async () => {
	let finish!: (page: InventoryPage) => void;
	const window = new InventoryWindow(
		() =>
			new Promise((resolve) => {
				finish = resolve;
			}),
		() => {}
	);
	window.seed('owner', page());
	const located = window.locateAndLoad(
		'entry',
		async () => ({ kind: 'Location', revision: '1', index: 500 }),
		new AbortController().signal
	);
	await new Promise((resolve) => setTimeout(resolve, 0));
	window.seed('owner', page(0, 'other'));
	finish(page(500));
	expect(await located).toBeNull();
	expect(window.current?.query.q).toBe('other');
	expect(window.at(500)).toBeUndefined();
});

it('discards a location reset interrupted by query replacement', async () => {
	let finish!: (page: InventoryPage) => void;
	const window = new InventoryWindow(
		() =>
			new Promise((resolve) => {
				finish = resolve;
			}),
		() => {}
	);
	window.seed('owner', page());
	let calls = 0;
	const located = window.locateAndLoad(
		'entry',
		async () => {
			calls++;
			return { kind: 'RevisionChanged', revision: '2' };
		},
		new AbortController().signal
	);
	await new Promise((resolve) => setTimeout(resolve, 0));
	window.seed('owner', page(0, 'other', '2'));
	finish(page(0, '', '2'));
	expect(await located).toBeNull();
	expect(calls).toBe(1);
	expect(window.current?.query.q).toBe('other');
});

it('shares three transport slots with lookup and releases lookup before its page load', async () => {
	let active = 0,
		peak = 0,
		lookups = 0;
	const pending: Array<() => void> = [];
	const begin = () => {
		active++;
		peak = Math.max(peak, active);
	};
	const window = new InventoryWindow(
		(q) =>
			new Promise((resolve) => {
				begin();
				pending.push(() => {
					active--;
					resolve(page(q.offset));
				});
			}),
		() => {}
	);
	window.seed('owner', page());
	window.plan(500, 600);
	let complete!: () => void;
	const located = window.locateAndLoad(
		'entry',
		() =>
			new Promise((resolve) => {
				lookups++;
				begin();
				complete = () => {
					active--;
					resolve({ kind: 'Location', revision: '1', index: 75 });
				};
			}),
		new AbortController().signal
	);
	expect(active).toBe(3);
	expect(lookups).toBe(0);
	pending.shift()!();
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(lookups).toBe(1);
	expect(window.metrics().requests).toBe(3);
	complete();
	for (let i = 0; i < 6; i++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		pending.splice(0).forEach((finish) => finish());
	}
	expect(await located).toEqual({ identity: window.identity, index: 75 });
	expect(peak).toBe(3);
	expect(active).toBe(0);
	expect(window.metrics().requests).toBe(0);
});

it('cancels a waiting lookup and cancels an active lookup on replacement without leaked slots', async () => {
	let calls = 0;
	const pending: Array<() => void> = [];
	const window = new InventoryWindow(
		(q, _revision, signal) =>
			new Promise((resolve) => {
				const finish = () => resolve(page(q.offset, q.q));
				signal.addEventListener('abort', finish, { once: true });
				pending.push(finish);
			}),
		() => {}
	);
	window.seed('owner', page());
	window.plan(500, 600);
	const waiting = new AbortController();
	const canceled = window.locateAndLoad(
		'entry',
		async () => {
			calls++;
			return { kind: 'Location', revision: '1', index: 75 };
		},
		waiting.signal
	);
	waiting.abort();
	expect(await canceled).toBeNull();
	expect(calls).toBe(0);
	window.clear();
	await new Promise((resolve) => setTimeout(resolve, 0));
	window.seed('owner', page());
	let lookupSignal!: AbortSignal;
	const active = window.locateAndLoad(
		'entry',
		(_q, _id, _revision, signal) =>
			new Promise((resolve) => {
				lookupSignal = signal;
				signal.addEventListener(
					'abort',
					() => resolve({ kind: 'Location', revision: '1', index: 75 }),
					{ once: true }
				);
			}),
		new AbortController().signal
	);
	expect(window.metrics().requests).toBe(1);
	const replacement = window.open('owner', { ...query, q: 'other' }, new AbortController().signal);
	expect(lookupSignal.aborted).toBe(true);
	expect(await active).toBeNull();
	await new Promise((resolve) => setTimeout(resolve, 0));
	pending.splice(0).forEach((finish) => finish());
	await replacement;
	expect(window.current?.query.q).toBe('other');
	expect(window.metrics().requests).toBe(0);
});

it('discards a waiting lookup on query replacement even if old transports ignore abort', async () => {
	const pending: Array<() => void> = [];
	const window = new InventoryWindow(
		(q) =>
			new Promise((resolve) => {
				pending.push(() => resolve(page(q.offset)));
			}),
		() => {}
	);
	window.seed('owner', page());
	window.plan(500, 600);
	let calls = 0;
	const located = window.locateAndLoad(
		'entry',
		async () => {
			calls++;
			return { kind: 'Location', revision: '1', index: 75 };
		},
		new AbortController().signal
	);
	window.seed('owner', page(0, 'other'));
	expect(await located).toBeNull();
	expect(calls).toBe(0);
	pending.splice(0).forEach((finish) => finish());
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(window.metrics().requests).toBe(0);
});

it('keeps teardown callbacks on their captured entry after eviction and query replacement', async () => {
	const initial = page();
	const entry = {
		id: 'entry',
		inventoryId: 'inventory',
		accountId: 'owner',
		game: 'mtg' as const,
		catalogCardId: 'printing',
		canonicalCardId: 'oracle',
		name: 'Card',
		setCode: 'set',
		imageUri: '',
		quantity: 1,
		finish: 'nonfoil' as const,
		condition: 'NM' as const,
		notes: 'saved notes',
		notesRevision: '1',
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
	const [captured] = inventoryRowSlots(initial.queryKey, [0], (index) => window.at(index));
	const refs: Record<string, unknown> = {};
	const staleCleanup = () => {
		const card = { ...captured.entry!, createdAt: new Date(captured.entry!.createdAt) };
		refs[card.id] = null;
		return card;
	};
	for (let i = 1; i <= 20; i++) await window.request(i * 50);
	expect(window.at(0)).toBeUndefined();
	window.seed('owner', page(0, 'replacement'));
	const [placeholder] = inventoryRowSlots('replacement', [0], (index) => window.at(index));
	expect(placeholder.entry).toBeUndefined();
	expect(placeholder.key).not.toBe(captured.key);
	const [replaced] = inventoryRowSlots(initial.queryKey, [0], () => ({
		...entry,
		id: 'different-entry'
	}));
	expect(replaced.key).not.toBe(captured.key);
	expect(() => new Date(window.at(0)!.createdAt)).toThrow(
		"Cannot read properties of undefined (reading 'createdAt')"
	);
	expect(staleCleanup()).toMatchObject({ id: entry.id, notes: 'saved notes' });
	expect(staleCleanup().createdAt.toISOString()).toBe(new Date(initial.viewedAt).toISOString());
	expect(refs).toEqual({ entry: null });
});

it('changes placeholder identity without mixing query contexts', () => {
	const [first] = inventoryRowSlots('first', [100], () => undefined);
	const [second] = inventoryRowSlots('second', [100], () => undefined);
	expect(first.key).not.toBe(second.key);
	expect(first.entry).toBeUndefined();
	expect(second.entry).toBeUndefined();
});
