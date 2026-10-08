import { describe, expect, it } from 'vitest';
import {
	DeckLibraryWindow,
	deckLibraryGeometry,
	deckLibraryMountedRows,
	deckLibraryParams
} from '../../src/lib/decks/library-window.ts';
import {
	normalizeDeckLibraryQuery,
	deckLibraryQueryKey,
	type DeckLibraryPage
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
