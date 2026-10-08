import { describe, expect, it, vi } from 'vitest';
import {
	DeckLibraryWindow,
	deckLibraryGeometry,
	deckLibraryMountedRows,
	deckLibraryParams,
	readDeckLibraryJSON,
	mergeDeckLibraryCategories,
	deckLibraryTiles,
	deckLibraryMeasurement,
	DeckLibraryLocateAttempts,
	deckLibraryTilePosition
} from '../../src/lib/decks/library-window.ts';
import {
	normalizeDeckLibraryQuery,
	deckLibraryQueryKey,
	type DeckLibraryPage,
	type DeckLibraryCategories
} from '../../../contracts/src/deck-library.ts';
import { hasDeepBrowseAnchor } from '../../src/lib/browsing/pagination.ts';
import { captureBrowseAnchor, browseAnchorScrollTop } from '../../src/lib/browsing/viewport.ts';

const query = normalizeDeckLibraryQuery({});
function page(
	offset = 0,
	total = 1601,
	revision = '1',
	queryText = '',
	limit = 200
): DeckLibraryPage {
	const normalized = normalizeDeckLibraryQuery({ ...query, query: queryText });
	return {
		query: normalized,
		queryKey: deckLibraryQueryKey(normalized),
		revision,
		offset,
		limit,
		matchingTotal: total,
		globalTotal: total,
		items: Array.from({ length: Math.min(limit, Math.max(0, total - offset)) }, (_, index) => ({
			id: `deck-${offset + index}`,
			name: `Deck ${offset + index}`,
			format: 'Commander',
			quantity: 100,
			imageUri: '',
			createdAt: '2026-10-08',
			updatedAt: '2026-10-08',
			categories: [],
			remainingCategoryCount: 0
		}))
	};
}
function deferred<T>() {
	let resolve!: (value: T) => void, reject!: (error: Error) => void;
	const promise = new Promise<T>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
}
const settle = async () => {
	for (let index = 0; index < 8; index++) await Promise.resolve();
};
describe('Deck Library physical window', () => {
	it('keeps three physical slots through ignored abort and body decoding, rejects stale account results', async () => {
		const calls: Array<{
			offset: number;
			signal: AbortSignal;
			headers: ReturnType<typeof deferred<void>>;
			body: ReturnType<typeof deferred<DeckLibraryPage>>;
		}> = [];
		const window = new DeckLibraryWindow(
			async (_query, offset, _limit, _revision, signal) => {
				const headers = deferred<void>(),
					body = deferred<DeckLibraryPage>();
				calls.push({ offset, signal, headers, body });
				await headers.promise;
				return body.promise;
			},
			() => {}
		);
		window.seed('first', page());
		void window.request(200);
		void window.request(400);
		void window.request(600);
		expect(calls).toHaveLength(3);
		calls.forEach((call) => call.headers.resolve());
		await settle();
		expect(window.metrics().requests).toBe(3);
		window.seed('second', page(1000, 1601, '2'));
		void window.request(1200);
		expect(calls).toHaveLength(3);
		expect(calls.every((call) => call.signal.aborted)).toBe(true);
		calls[0].body.resolve(page(200));
		await settle();
		expect(calls).toHaveLength(4);
		expect(window.at(200)).toBeUndefined();
		calls[3].headers.resolve();
		calls[3].body.resolve(page(1200, 1601, '2'));
		calls[1].body.resolve(page(400));
		calls[2].body.resolve(page(600));
		await settle();
		expect(window.span).toEqual({ start: 1000, end: 1400 });
		expect(window.metrics().requests).toBe(0);
	});
	it('admits category/location reads through the same physical slots', async () => {
		const bodies = Array.from({ length: 3 }, () => deferred<DeckLibraryPage>());
		let calls = 0;
		const window = new DeckLibraryWindow(
			(_query, offset) => bodies[calls++].promise,
			() => {}
		);
		window.seed('account', page());
		void window.request(200);
		void window.request(400);
		void window.request(600);
		let externalStarted = false;
		const controller = new AbortController(),
			body = deferred<number>();
		const external = window.read(async () => {
			externalStarted = true;
			return body.promise;
		}, controller.signal);
		expect(externalStarted).toBe(false);
		bodies[0].resolve(page(200));
		await settle();
		expect(externalStarted).toBe(true);
		expect(window.metrics().requests).toBe(3);
		controller.abort();
		await settle();
		expect(window.metrics().requests).toBe(3);
		body.resolve(7);
		expect(await external).toBeNull();
		bodies[1].resolve(page(400));
		bodies[2].resolve(page(600));
		await settle();
		expect(window.metrics().requests).toBe(0);
	});
	it('grows only successful explicit contiguous ranges and retries failed ranges', async () => {
		let fail = true;
		const window = new DeckLibraryWindow(
			async (_query, offset) => {
				if (offset === 400 && fail) throw new Error('Offline');
				return page(offset);
			},
			() => {}
		);
		window.seed('account', page(200));
		await window.request(800, false);
		expect(window.span).toEqual({ start: 200, end: 400 });
		await window.request(400);
		expect(window.span).toEqual({ start: 200, end: 400 });
		expect(window.error).toBe('Offline');
		fail = false;
		await window.retry();
		expect(window.span).toEqual({ start: 200, end: 600 });
		await window.loadEarlier();
		expect(window.span).toEqual({ start: 0, end: 600 });
		await window.request(800);
		expect(window.span.end).toBe(600);
	});
	it('evicts within four contexts, twenty pages and 1000 records including retained seeds and focus', async () => {
		const window = new DeckLibraryWindow(
			async (query, offset, limit, _revision) => page(offset, 5001, '1', query.query, limit),
			() => {}
		);
		for (let context = 0; context < 8; context++) {
			window.seed('account', page(0, 5001, '1', `query-${context}`));
			expect(window.metrics().contexts).toBeLessThanOrEqual(4);
		}
		const retained = window.at(0)!;
		window.retain(retained);
		for (let offset = 200; offset < 5000; offset += 200) {
			await window.request(offset);
			window.setVisible(offset, offset + 10);
			expect(window.metrics().records).toBeLessThanOrEqual(1000);
			expect(window.metrics().pages).toBeLessThanOrEqual(20);
		}
		window.seed('account', page(0, 5001, '1', 'tiny', 20));
		for (let offset = 20; offset < 600; offset += 20) {
			await window.request(offset);
			window.setVisible(offset, offset + 5);
			expect(window.metrics().records).toBeLessThanOrEqual(1000);
			expect(window.metrics().pages).toBeLessThanOrEqual(20);
		}
	});
	it('counts the actual SSR seed while refresh adopts a new revision, and clears terminal presentation', async () => {
		const window = new DeckLibraryWindow(
			async () => page(0, 1601, '2'),
			() => {}
		);
		window.seed('account', page());
		await window.refresh();
		expect(window.current?.revision).toBe('2');
		expect(window.metrics().records).toBe(400);
		window.clear();
		expect(window.current).toBeUndefined();
		expect(window.metrics()).toMatchObject({ records: 0, pages: 0, contexts: 0 });
	});
	it('waits for a bounded end-range replacement when deletion removes the visible page', async () => {
		const final = deferred<DeckLibraryPage>();
		let settled = false;
		const window = new DeckLibraryWindow(
			async (_query, offset) => (offset === 1000 ? page(1000, 401, '2') : final.promise),
			() => {}
		);
		window.seed('account', page(1000));
		const refresh = window.refresh().then(() => (settled = true));
		await settle();
		expect(settled).toBe(false);
		expect(window.current?.revision).toBe('1');
		final.resolve(page(400, 401, '2'));
		await refresh;
		expect(window.span).toEqual({ start: 400, end: 401 });
		expect(window.current?.revision).toBe('2');
	});
	it('fences cancelled refresh publication', async () => {
		const body = deferred<DeckLibraryPage>();
		let current = true;
		const window = new DeckLibraryWindow(
			() => body.promise,
			() => {}
		);
		window.seed('account', page());
		const refresh = window.refresh(() => current);
		current = false;
		body.resolve(page(0, 1601, '2'));
		await refresh;
		expect(window.current?.revision).toBe('1');
	});
});
describe('Deck Library measured geometry and route identity', () => {
	it('measures variable rows and retains signed clearance through prepend', () => {
		const heights = new Map([
				['deck-200', 600],
				['deck-202', 420]
			]),
			at = (index: number) => ({ id: `deck-${index}` });
		const original = deckLibraryGeometry({ start: 200, end: 400 }, 2, 300, heights, at);
		expect(original.offsets.slice(0, 3)).toEqual([0, 624, 1068]);
		const captured = captureBrowseAnchor(-80, original.rowAt, (index) => original.offsets[index]);
		const expanded = deckLibraryGeometry({ start: 0, end: 400 }, 2, 300, heights, at);
		expect(captured.intra).toBe(-80);
		expect(browseAnchorScrollTop(100, expanded.offsets[100], captured.intra, 0)).toBe(32420);
	});
	it('mounts at most 200 tiles including a retained focus row across viewport sizes', () => {
		for (const columns of [1, 2, 3, 4, 7, 12]) {
			const geometry = deckLibraryGeometry(
				{ start: 0, end: 1601 },
				columns,
				300,
				new Map(),
				() => undefined
			);
			const rows = deckLibraryMountedRows(
				geometry.base,
				geometry.offsets,
				20_000,
				100_000,
				columns,
				geometry.rowAt,
				0
			);
			expect(rows).toContain(0);
			expect(rows.length * columns).toBeLessThanOrEqual(200);
		}
	});
	it('uses distinct directory keys and recognizes deep directory anchors', () => {
		const params = deckLibraryParams(query, 400, 200, '7');
		expect(params.get('q')).toBeNull();
		expect(params.get('revision')).toBe('7');
		expect(hasDeepBrowseAnchor(new URL('http://localhost/mtg/decks?dirPage=3&q=Bolt'))).toBe(true);
		expect(hasDeepBrowseAnchor(new URL('http://localhost/mtg/decks?page=3'))).toBe(false);
	});
});

describe('Deck Library owned responses and stable identity', () => {
	it('ignores a deferred old-account 401 before expiring the current workspace', async () => {
		const response = deferred<Response>(),
			expire = vi.fn();
		let owned = true;
		const read = readDeckLibraryJSON(
			'/directory',
			new AbortController().signal,
			() => owned,
			expire,
			(() => response.promise) as typeof fetch
		);
		owned = false;
		response.resolve(new Response(null, { status: 401 }));
		expect(await read).toBeNull();
		expect(expire).not.toHaveBeenCalled();
	});
	it('guards aborted and invalidated external option leases before a 401 side effect', async () => {
		const window = new DeckLibraryWindow(
			async () => page(),
			() => {}
		);
		window.seed('account', page());
		const response = deferred<Response>(),
			expire = vi.fn(),
			controller = new AbortController();
		let lease = true;
		const read = window.read(
			(signal, current) =>
				readDeckLibraryJSON(
					'/options',
					signal,
					current,
					expire,
					(() => response.promise) as typeof fetch
				),
			controller.signal,
			() => lease
		);
		lease = false;
		controller.abort();
		response.resolve(new Response(null, { status: 401 }));
		expect(await read).toBeNull();
		expect(expire).not.toHaveBeenCalled();
	});
	it('expires only a still-owned 401 and holds decode admission until it settles', async () => {
		const expire = vi.fn();
		await readDeckLibraryJSON(
			'/directory',
			new AbortController().signal,
			() => true,
			expire,
			(async () => new Response(null, { status: 401 })) as typeof fetch
		);
		expect(expire).toHaveBeenCalledTimes(1);
		const body = deferred<DeckLibraryPage>();
		let owned = true;
		const read = readDeckLibraryJSON(
			'/directory',
			new AbortController().signal,
			() => owned,
			expire,
			async () => {
				const response = new Response(null, { status: 200 });
				vi.spyOn(response, 'json').mockImplementation(() => body.promise);
				return response;
			}
		);
		await settle();
		owned = false;
		body.resolve(page());
		expect(await read).toBeNull();
		expect(expire).toHaveBeenCalledTimes(1);
	});
	it('locates the same visible Deck after a revision reorders it into an evicted range', async () => {
		const reordered = page(800, 1601, '2');
		reordered.items[17] = { ...reordered.items[17], id: 'deck-0' };
		const window = new DeckLibraryWindow(
			async (_query, offset) => (offset === 800 ? reordered : page(offset, 1601, '2')),
			() => {}
		);
		window.seed('account', page());
		await window.refresh();
		const location = await window.locateAndLoad(
			'deck-0',
			async (query, deckId, revision) => ({
				query,
				queryKey: deckLibraryQueryKey(query),
				revision,
				deckId,
				offset: 817,
				matchingTotal: 1601
			}),
			new AbortController().signal
		);
		expect(location).toMatchObject({ index: 817, revision: '2' });
		expect(window.at(817)?.id).toBe('deck-0');
		expect(window.span).toEqual({ start: 800, end: 1000 });
		expect(window.metrics().requests).toBe(0);
	});
	it('locate shares physical admission and cannot publish across account replacement', async () => {
		const bodies = Array.from({ length: 3 }, () => deferred<DeckLibraryPage>());
		let calls = 0;
		const window = new DeckLibraryWindow(
			() => bodies[calls++].promise,
			() => {}
		);
		window.seed('first', page());
		void window.request(200);
		void window.request(400);
		void window.request(600);
		const locate = vi.fn(async (query, deckId, revision) => ({
			query,
			queryKey: deckLibraryQueryKey(query),
			revision,
			deckId,
			offset: 0,
			matchingTotal: 1601
		}));
		const result = window.locateAndLoad('deck-0', locate, new AbortController().signal);
		expect(locate).not.toHaveBeenCalled();
		window.seed('second', page(1000, 1601, '2'));
		await settle();
		expect(await result).toBeNull();
		expect(locate).not.toHaveBeenCalled();
		bodies.forEach((body, index) => body.resolve(page((index + 1) * 200)));
		await settle();
		expect(window.metrics().requests).toBe(0);
	});
	it('rejects stale revision locations and refreshes before coherent lookup', async () => {
		const window = new DeckLibraryWindow(
			async () => page(0, 1601, '2'),
			() => {}
		);
		window.seed('account', page());
		let attempts = 0;
		const location = await window.locateAndLoad(
			'deck-0',
			async (query, deckId, revision) =>
				++attempts === 1
					? { kind: 'RevisionChanged', revision: '2' }
					: {
							query,
							queryKey: deckLibraryQueryKey(query),
							revision,
							deckId,
							offset: 0,
							matchingTotal: 1601
						},
			new AbortController().signal
		);
		expect(attempts).toBe(2);
		expect(location).toMatchObject({ index: 0, revision: '2' });
	});
	it('decodes fresh SSE category counts before replacing retained selected options', async () => {
		const window = new DeckLibraryWindow(
			async () => page(0, 1601, '2'),
			() => {}
		);
		window.seed('account', page());
		await window.refresh();
		const option = {
			versionId: 'version',
			originId: 'origin',
			name: 'Draw',
			historical: false,
			meaning: 'Saved meaning',
			version: 1,
			count: 1
		};
		const body = deferred<DeckLibraryCategories>();
		const request = window.read(
			(signal, current) =>
				readDeckLibraryJSON<DeckLibraryCategories>(
					'/options',
					signal,
					current,
					() => {},
					async () => {
						const response = new Response(null, { status: 200 });
						vi.spyOn(response, 'json').mockImplementation(() => body.promise);
						return response;
					}
				),
			new AbortController().signal
		);
		await settle();
		expect(window.metrics().requests).toBe(1);
		body.resolve({
			query,
			queryKey: deckLibraryQueryKey(query),
			revision: '2',
			offset: 0,
			limit: 200,
			total: 1,
			items: [],
			selected: [{ ...option, count: 7 }]
		});
		const fresh = await request;
		expect(fresh?.revision).toBe('2');
		expect(mergeDeckLibraryCategories(fresh!, [option], ['version'])[0].count).toBe(7);
		expect(window.metrics().requests).toBe(0);
	});
	it('uses fresh SSE option counts over retained same-version labels and keeps only absent selected choices', () => {
		const option = {
			versionId: 'version',
			originId: 'origin',
			name: 'Draw',
			historical: false,
			meaning: 'Saved meaning',
			version: 1,
			count: 1
		};
		const fresh = {
			query,
			queryKey: deckLibraryQueryKey(query),
			revision: '2',
			offset: 0,
			limit: 200,
			total: 2,
			items: [{ ...option, count: 7 }],
			selected: [{ ...option, count: 7 }]
		};
		const absent = { ...option, versionId: 'historical', count: 3 };
		expect(
			mergeDeckLibraryCategories(
				fresh,
				[option, absent, { ...option, versionId: 'unselected' }],
				['version', 'historical']
			)
		).toEqual([{ ...option, count: 7 }, absent]);
	});
});

describe('Deck Library keyboard focus identity', () => {
	it('keeps fresh slots and one focused Deck after an insertion before focus', () => {
		const old = page().items;
		const fresh = [
			{ ...old[0], id: 'inserted', name: 'New Deck' },
			...old.map((item) => ({ ...item, name: `Fresh ${item.name}` }))
		];
		const focus = { index: 1, item: old[1] };
		const tiles = deckLibraryTiles([0, 1, 2, 3], (index) => fresh[index], focus);
		expect(tiles.map(({ item }) => item?.id)).toEqual(['inserted', 'deck-0', 'deck-1', 'deck-2']);
		expect(tiles.filter(({ item }) => item?.id === focus.item.id)).toHaveLength(1);
		expect(tiles.find(({ item }) => item?.id === focus.item.id)).toMatchObject({
			index: 2,
			key: 'deck:deck-1',
			item: { name: `Fresh ${old[1].name}` }
		});
	});
	it('retains the same focused node key through eviction and relocation within the physical tile budget', () => {
		const items = page().items;
		const focused = { index: 900, item: { ...items[0], id: 'focused' } };
		const evicted = deckLibraryTiles(
			Array.from({ length: 200 }, (_, i) => i),
			(index) => items[index],
			focused
		);
		expect(evicted).toHaveLength(200);
		expect(evicted.at(-1)?.key).toBe('deck:focused');
		const fresh = { ...focused.item, name: 'Updated focused Deck' };
		const relocated = deckLibraryTiles(
			[0, 1, 2],
			(index) => (index === 1 ? fresh : items[index]),
			focused
		);
		expect(relocated.filter(({ key }) => key === 'deck:focused')).toEqual([
			{ index: 1, item: fresh, key: 'deck:focused' }
		]);
		expect(relocated[0].item).toBe(items[0]);
	});
	it('records reused action measurements against the current Deck ID', () => {
		const items = page().items,
			record = vi.fn();
		const measurement = deckLibraryMeasurement(items[0], record);
		measurement.measure(280);
		measurement.update(items[1]);
		measurement.measure(410);
		expect(record.mock.calls).toEqual([
			['deck-0', 280],
			['deck-1', 410]
		]);
	});
});

describe('Deck Library failed location admission', () => {
	it.each(['focus', 'anchor'] as const)(
		'bounds %s relocation through deferred failure and scheduler notifications',
		async (role) => {
			const attempts = new DeckLibraryLocateAttempts(),
				response = deferred<Response>();
			const fetcher = vi
				.fn<typeof fetch>()
				.mockImplementationOnce(() => response.promise)
				.mockResolvedValue(
					new Response(JSON.stringify({ message: 'Location unavailable' }), { status: 503 })
				);
			let enabled = false;
			const key = JSON.stringify(['account', query, '2', 'deck-0']);
			const locate = vi.fn(() =>
				window.locateAndLoad(
					'deck-0',
					async (_query, _id, _revision, signal, current) =>
						readDeckLibraryJSON('/locate', signal, current, vi.fn(), fetcher),
					new AbortController().signal
				)
			);
			const window = new DeckLibraryWindow(
				async () => page(400, 1000, '2'),
				() => {
					if (enabled) void Promise.resolve().then(() => attempts.run(role, key, locate));
				}
			);
			window.seed('account', page(400, 1000, '2'));
			const retained = { index: 0, item: page().items[0] };
			window.retain(retained.item);
			enabled = true;
			const pending = attempts.run(role, key, locate);
			await settle();
			for (let i = 0; i < 20; i++) {
				attempts.retry(); // Cannot free a physically pending attempt.
				expect(await attempts.run(role, key, locate)).toEqual({ kind: 'Skipped' });
			}
			expect(fetcher).toHaveBeenCalledTimes(1);
			expect(window.metrics().requests).toBe(1);
			response.resolve(
				new Response(JSON.stringify({ message: 'Location unavailable' }), { status: 503 })
			);
			expect(await pending).toMatchObject({
				kind: 'Failed',
				cause: new Error('Location unavailable')
			});
			await settle();
			for (let i = 0; i < 20; i++)
				expect(await attempts.run(role, key, locate)).toEqual({ kind: 'Skipped' });
			expect(fetcher).toHaveBeenCalledTimes(1);
			expect(window.metrics().requests).toBe(0);
			expect(deckLibraryTiles([400], (index) => window.at(index), retained).at(-1)?.key).toBe(
				'deck:deck-0'
			);
			attempts.retry();
			expect(await attempts.run(role, key, locate)).toMatchObject({ kind: 'Failed' });
			await settle();
			expect(fetcher).toHaveBeenCalledTimes(2);
			expect(await attempts.run(role, key, locate)).toEqual({ kind: 'Skipped' });
			enabled = false;
			expect(
				await attempts.run(
					role,
					JSON.stringify(['account', query, '3', 'deck-0']),
					async () => 'new revision'
				)
			).toEqual({ kind: 'Resolved', value: 'new revision' });
		}
	);
	it('shares one failed Deck identity across focus and viewport-anchor reads', async () => {
		const attempts = new DeckLibraryLocateAttempts();
		const operation = vi.fn(async () => {
			throw new Error('503');
		});
		expect(await attempts.run('focus', 'account/query/revision/deck', operation)).toMatchObject({
			kind: 'Failed'
		});
		expect(await attempts.run('anchor', 'account/query/revision/deck', operation)).toEqual({
			kind: 'Skipped'
		});
		expect(operation).toHaveBeenCalledTimes(1);
		attempts.retry();
		expect(await attempts.run('anchor', 'account/query/revision/deck', operation)).toMatchObject({
			kind: 'Failed'
		});
		expect(operation).toHaveBeenCalledTimes(2);
	});
	it('places retained focus outside a later span offscreen instead of over a fresh slot', () => {
		const span = { start: 400, end: 600 };
		const geometry = deckLibraryGeometry(span, 2, 300, new Map(), () => undefined);
		const retained = deckLibraryTilePosition(0, span, 2, geometry.base, geometry.offsets, 180);
		const fresh = deckLibraryTilePosition(400, span, 2, geometry.base, geometry.offsets, 180);
		expect(retained).toEqual({ top: 0, left: -10000, offscreen: true });
		expect(fresh).toEqual({ top: 0, left: 0, offscreen: false });
		expect(
			deckLibraryTilePosition(900, span, 2, geometry.base, geometry.offsets, 180).offscreen
		).toBe(true);
	});
});
