import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import {
	createCardImageCache,
	formatByteSize,
	isCacheableScryfallImageUrl,
	type CachedImageRecord
} from '#lib/cards/image-cache.ts';
import { cachedCardImage, cardImageSrc } from '#lib/cards/card-image.ts';
import ImageCacheSettings from '#lib/components/settings/ImageCacheSettings.svelte';

const SCRYFALL_A = 'https://cards.scryfall.io/normal/front/a/a/aaaa.jpg?1';
const SCRYFALL_B = 'https://cards.scryfall.io/normal/front/b/b/bbbb.jpg?1';
const SCRYFALL_C = 'https://cards.scryfall.io/normal/front/c/c/cccc.jpg?1';
const SCRYFALL_D = 'https://cards.scryfall.io/normal/front/d/d/dddd.jpg?1';

interface MockIDBOptions {
	failOpenWith?: 'throw' | 'error';
	quotaFailPutCount?: number;
}

/**
 * Minimal in-memory IDBFactory double supporting keyPath stores, secondary index cursors,
 * transactions, and simulated QuotaExceededError / Private Mode failures.
 */
function createMockIndexedDB(options: MockIDBOptions = {}) {
	const stores = new Map<string, Map<string, CachedImageRecord>>();
	const indexes = new Map<string, Set<string>>();
	let remainingQuotaFailures = options.quotaFailPutCount ?? 0;

	const schedule = (fn: () => void) => queueMicrotask(fn);

	function makeRequest<T>(executor: () => T): IDBRequest<T> {
		const req = {
			result: undefined as unknown as T,
			error: null as DOMException | null,
			onsuccess: null as ((ev: Event) => void) | null,
			onerror: null as ((ev: Event) => void) | null
		} as unknown as IDBRequest<T>;

		schedule(() => {
			try {
				(req as { result: T }).result = executor();
				req.onsuccess?.(new Event('success'));
			} catch (err) {
				(req as { error: DOMException }).error =
					err instanceof DOMException ? err : new DOMException(String(err), 'UnknownError');
				req.onerror?.(new Event('error'));
			}
		});
		return req;
	}

	function createDb(): IDBDatabase {
		const db = {
			objectStoreNames: {
				contains: (name: string) => stores.has(name)
			},
			createObjectStore: (name: string) => {
				if (!stores.has(name)) stores.set(name, new Map());
				if (!indexes.has(name)) indexes.set(name, new Set());
				return {
					indexNames: { contains: (idx: string) => indexes.get(name)?.has(idx) ?? false },
					createIndex: (idx: string) => {
						indexes.get(name)?.add(idx);
					}
				};
			},
			transaction: (storeName: string, _mode?: IDBTransactionMode) => {
				const map = stores.get(storeName);
				if (!map) throw new DOMException(`Missing store ${storeName}`, 'NotFoundError');

				let pendingOps = 0;
				let txFailed = false;
				let scheduledComplete = false;

				const tx = {
					error: null as DOMException | null,
					oncomplete: null as ((ev: Event) => void) | null,
					onerror: null as ((ev: Event) => void) | null,
					onabort: null as ((ev: Event) => void) | null,
					objectStore: (name: string) => {
						const targetMap = stores.get(name)!;
						const trackOp = <T>(fn: () => T): IDBRequest<T> => {
							pendingOps += 1;
							const req = {
								result: undefined as unknown as T,
								error: null as DOMException | null,
								onsuccess: null as ((ev: Event) => void) | null,
								onerror: null as ((ev: Event) => void) | null
							} as unknown as IDBRequest<T>;
							schedule(() => {
								try {
									(req as { result: T }).result = fn();
									req.onsuccess?.(new Event('success'));
								} catch (err) {
									const domErr =
										err instanceof DOMException
											? err
											: new DOMException(String(err), 'UnknownError');
									(req as { error: DOMException }).error = domErr;
									txFailed = true;
									// Mirror browser IDB: tx.onerror fires from the bubbling request error
									// before tx.error is populated on abort.
									const errorEvent = { target: req } as unknown as Event;
									req.onerror?.(errorEvent);
									tx.onerror?.(errorEvent);
									(tx as { error: DOMException }).error = domErr;
									tx.onabort?.(new Event('abort'));
								} finally {
									pendingOps -= 1;
									maybeComplete();
								}
							});
							return req;
						};

						const makeCursorRequest = (ordered: CachedImageRecord[]) => {
							pendingOps += 1;
							let idx = 0;
							const req = {
								result: null as IDBCursorWithValue | null,
								error: null as DOMException | null,
								onsuccess: null as ((ev: Event) => void) | null,
								onerror: null as ((ev: Event) => void) | null
							} as unknown as IDBRequest<IDBCursorWithValue | null>;

							const emit = () => {
								schedule(() => {
									if (idx >= ordered.length) {
										(req as { result: IDBCursorWithValue | null }).result = null;
										req.onsuccess?.(new Event('success'));
										pendingOps -= 1;
										maybeComplete();
										return;
									}
									const current = ordered[idx];
									const cursor = {
										primaryKey: current.url,
										key: current.lastAccessedAt,
										value: current,
										continue: () => {
											idx += 1;
											emit();
										}
									} as unknown as IDBCursorWithValue;
									(req as { result: IDBCursorWithValue | null }).result = cursor;
									req.onsuccess?.(new Event('success'));
								});
							};
							emit();
							return req;
						};

						return {
							get: (key: string) => trackOp(() => targetMap.get(key)),
							put: (record: CachedImageRecord) =>
								trackOp(() => {
									if (remainingQuotaFailures > 0) {
										remainingQuotaFailures -= 1;
										throw new DOMException('Quota exceeded', 'QuotaExceededError');
									}
									targetMap.set(record.url, record);
									return record.url;
								}),
							delete: (key: string) =>
								trackOp(() => {
									targetMap.delete(key);
								}),
							clear: () =>
								trackOp(() => {
									targetMap.clear();
								}),
							openCursor: () => makeCursorRequest([...targetMap.values()]),
							index: (_indexName: string) => ({
								openCursor: () => {
									const sorted = [...targetMap.values()].sort(
										(a, b) => a.lastAccessedAt - b.lastAccessedAt
									);
									return makeCursorRequest(sorted);
								}
							})
						};
					}
				} as unknown as IDBTransaction;

				function maybeComplete() {
					if (txFailed || pendingOps > 0 || scheduledComplete) return;
					scheduledComplete = true;
					schedule(() => {
						if (!txFailed && pendingOps === 0) {
							tx.oncomplete?.(new Event('complete'));
						} else {
							scheduledComplete = false;
						}
					});
				}

				schedule(maybeComplete);
				return tx;
			},
			close: () => {},
			onversionchange: null,
			onclose: null
		} as unknown as IDBDatabase;
		return db;
	}

	const factory = {
		open: (_name: string, _version?: number) => {
			if (options.failOpenWith === 'throw') {
				throw new DOMException('Private browsing', 'SecurityError');
			}
			const req = {
				result: undefined as unknown as IDBDatabase,
				error: null as DOMException | null,
				transaction: null as IDBTransaction | null,
				onupgradeneeded: null as ((ev: IDBVersionChangeEvent) => void) | null,
				onsuccess: null as ((ev: Event) => void) | null,
				onerror: null as ((ev: Event) => void) | null,
				onblocked: null as ((ev: Event) => void) | null
			} as unknown as IDBOpenDBRequest;

			schedule(() => {
				if (options.failOpenWith === 'error') {
					(req as { error: DOMException }).error = new DOMException('Blocked', 'SecurityError');
					req.onerror?.(new Event('error'));
					return;
				}
				const db = createDb();
				(req as { result: IDBDatabase }).result = db;
				if (!stores.has('images')) {
					req.onupgradeneeded?.({} as IDBVersionChangeEvent);
				}
				req.onsuccess?.(new Event('success'));
			});
			return req;
		}
	} as unknown as IDBFactory;

	return {
		factory,
		getStore: () => stores.get('images') ?? new Map<string, CachedImageRecord>()
	};
}

function makeImageResponse(bytes: number, type = 'image/jpeg'): Response {
	return new Response(new Uint8Array(bytes), {
		status: 200,
		headers: { 'content-type': type }
	});
}

describe('isCacheableScryfallImageUrl', () => {
	it('accepts https cards.scryfall.io URLs only', () => {
		expect(isCacheableScryfallImageUrl(SCRYFALL_A)).toBe(true);
		expect(isCacheableScryfallImageUrl('http://cards.scryfall.io/normal/front/a/a/aaaa.jpg')).toBe(
			false
		);
		expect(isCacheableScryfallImageUrl('https://svgs.scryfall.io/sets/neo.svg')).toBe(false);
		expect(isCacheableScryfallImageUrl('https://example.com/card.jpg')).toBe(false);
		expect(isCacheableScryfallImageUrl('/logo.webp')).toBe(false);
		expect(isCacheableScryfallImageUrl('')).toBe(false);
		expect(isCacheableScryfallImageUrl(null)).toBe(false);
	});
});

describe('formatByteSize', () => {
	it('formats byte sizes using the active locale', () => {
		expect(formatByteSize(0, 'en')).toBe('0 B');
		expect(formatByteSize(1536, 'en')).toBe('1.5 KB');
		expect(formatByteSize(1536, 'de')).toBe('1,5 KB');
		expect(formatByteSize(200 * 1024 * 1024, 'en')).toBe('200 MB');
	});
});

describe('createCardImageCache', () => {
	it('fetches once, caches in IndexedDB, and serves subsequent requests from cache', async () => {
		const mockIdb = createMockIndexedDB();
		const fetchMock = vi.fn(async () => makeImageResponse(1024));
		let nextId = 0;
		const created: string[] = [];
		const revoked: string[] = [];

		const cache = createCardImageCache({
			indexedDB: mockIdb.factory,
			fetchImpl: fetchMock,
			createObjectUrl: () => {
				const url = `blob:card-${++nextId}`;
				created.push(url);
				return url;
			},
			revokeObjectUrl: (url) => {
				revoked.push(url);
			}
		});

		const first = await cache.acquire(SCRYFALL_A);
		expect(first.fromCache).toBe(false);
		expect(first.src).toBe('blob:card-1');
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledWith(SCRYFALL_A, {
			mode: 'cors',
			credentials: 'omit'
		});

		// Release first handle -> object URL is revoked cleanly.
		first.release();
		first.release(); // idempotent
		expect(revoked).toEqual(['blob:card-1']);

		// Second acquire reads from IndexedDB without hitting network.
		const second = await cache.acquire(SCRYFALL_A);
		expect(second.fromCache).toBe(true);
		expect(second.src).toBe('blob:card-2');
		expect(fetchMock).toHaveBeenCalledTimes(1);

		second.release();
		expect(revoked).toEqual(['blob:card-1', 'blob:card-2']);
		await cache.close();
	});

	it('deduplicates concurrent fetches and ref-counts shared object URLs', async () => {
		const mockIdb = createMockIndexedDB();
		const fetchMock = vi.fn(async () => makeImageResponse(512));
		const revoked: string[] = [];
		let counter = 0;

		const cache = createCardImageCache({
			indexedDB: mockIdb.factory,
			fetchImpl: fetchMock,
			createObjectUrl: () => `blob:shared-${++counter}`,
			revokeObjectUrl: (url) => revoked.push(url)
		});

		const [h1, h2] = await Promise.all([cache.acquire(SCRYFALL_A), cache.acquire(SCRYFALL_A)]);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(h1.src).toBe('blob:shared-1');
		expect(h2.src).toBe('blob:shared-1');

		const syncHit = cache.acquireSync(SCRYFALL_A);
		expect(syncHit?.src).toBe('blob:shared-1');

		h1.release();
		expect(revoked).toEqual([]);
		h2.release();
		expect(revoked).toEqual([]);
		syncHit?.release();
		expect(revoked).toEqual(['blob:shared-1']);

		await cache.close();
	});

	it('evicts least-recently-used entries when maxEntries is exceeded', async () => {
		const mockIdb = createMockIndexedDB();
		let tick = 100;
		const cache = createCardImageCache({
			indexedDB: mockIdb.factory,
			maxEntries: 2,
			maxBytes: 1024 * 1024,
			now: () => (tick += 10),
			fetchImpl: async () => makeImageResponse(100),
			createObjectUrl: () => 'blob:lru',
			revokeObjectUrl: () => {}
		});

		const a = await cache.acquire(SCRYFALL_A);
		a.release();
		const b = await cache.acquire(SCRYFALL_B);
		b.release();

		// Access A again so B becomes the least-recently-used entry.
		const aAgain = await cache.acquire(SCRYFALL_A);
		expect(aAgain.fromCache).toBe(true);
		aAgain.release();

		// Allow best-effort touch microtasks to flush.
		await Promise.resolve();
		await Promise.resolve();

		// Adding C should evict B, keeping A and C.
		const c = await cache.acquire(SCRYFALL_C);
		c.release();

		const keys = [...mockIdb.getStore().keys()];
		expect(keys).toHaveLength(2);
		expect(keys).toContain(SCRYFALL_A);
		expect(keys).toContain(SCRYFALL_C);
		expect(keys).not.toContain(SCRYFALL_B);

		const stats = await cache.getStats();
		expect(stats).toEqual({
			available: true,
			entryCount: 2,
			totalBytes: 200,
			maxEntries: 2,
			maxBytes: 1024 * 1024
		});

		await cache.close();
	});

	it('evicts oldest entries when maxBytes is exceeded', async () => {
		const mockIdb = createMockIndexedDB();
		let tick = 100;
		const cache = createCardImageCache({
			indexedDB: mockIdb.factory,
			maxEntries: 10,
			maxBytes: 250,
			now: () => (tick += 10),
			fetchImpl: async () => makeImageResponse(100),
			createObjectUrl: () => 'blob:bytes',
			revokeObjectUrl: () => {}
		});

		for (const url of [SCRYFALL_A, SCRYFALL_B, SCRYFALL_C, SCRYFALL_D]) {
			const handle = await cache.acquire(url);
			handle.release();
		}

		const stats = await cache.getStats();
		expect(stats.entryCount).toBe(2);
		expect(stats.totalBytes).toBe(200);
		expect([...mockIdb.getStore().keys()]).toEqual([SCRYFALL_C, SCRYFALL_D]);

		await cache.close();
	});

	it('falls back gracefully when IndexedDB is unavailable or blocked (SSR / Private Mode)', async () => {
		const fetchMock = vi.fn(async () => makeImageResponse(100));

		const ssrCache = createCardImageCache({ indexedDB: null, fetchImpl: fetchMock });
		const ssrResult = await ssrCache.acquire(SCRYFALL_A);
		expect(ssrResult.src).toBe(SCRYFALL_A);
		expect(ssrResult.fromCache).toBe(false);
		expect(fetchMock).not.toHaveBeenCalled();
		expect(await ssrCache.getStats()).toMatchObject({ available: false, entryCount: 0 });
		expect(await ssrCache.clear()).toBe(false);

		const privateThrow = createCardImageCache({
			indexedDB: createMockIndexedDB({ failOpenWith: 'throw' }).factory,
			fetchImpl: fetchMock
		});
		expect((await privateThrow.acquire(SCRYFALL_A)).src).toBe(SCRYFALL_A);
		expect((await privateThrow.getStats()).available).toBe(false);

		const privateError = createCardImageCache({
			indexedDB: createMockIndexedDB({ failOpenWith: 'error' }).factory,
			fetchImpl: fetchMock
		});
		expect((await privateError.acquire(SCRYFALL_A)).src).toBe(SCRYFALL_A);
		expect((await privateError.getStats()).available).toBe(false);
	});

	it('handles QuotaExceededError by evicting and retrying without breaking image rendering', async () => {
		const mockIdb = createMockIndexedDB({ quotaFailPutCount: 1 });
		const cache = createCardImageCache({
			indexedDB: mockIdb.factory,
			maxEntries: 5,
			maxBytes: 1024,
			fetchImpl: async () => makeImageResponse(200),
			createObjectUrl: () => 'blob:quota',
			revokeObjectUrl: () => {}
		});

		const handle = await cache.acquire(SCRYFALL_A);
		expect(handle.src).toBe('blob:quota');
		handle.release();

		// Retry succeeded after quota eviction path.
		expect(mockIdb.getStore().has(SCRYFALL_A)).toBe(true);
		await cache.close();
	});

	it('falls back to raw URL on network failure or non-image response', async () => {
		const mockIdb = createMockIndexedDB();
		const cache = createCardImageCache({
			indexedDB: mockIdb.factory,
			fetchImpl: async (url) => {
				if (url === SCRYFALL_A) throw new TypeError('CORS blocked');
				if (url === SCRYFALL_B) return new Response('not found', { status: 404 });
				return new Response('<html>not an image</html>', {
					status: 200,
					headers: { 'content-type': 'text/html' }
				});
			}
		});

		expect((await cache.acquire(SCRYFALL_A)).src).toBe(SCRYFALL_A);
		expect((await cache.acquire(SCRYFALL_B)).src).toBe(SCRYFALL_B);
		expect((await cache.acquire(SCRYFALL_C)).src).toBe(SCRYFALL_C);
		expect((await cache.getStats()).entryCount).toBe(0);

		await cache.close();
	});

	it('does not leak object URLs when acquire is aborted mid-flight', async () => {
		const mockIdb = createMockIndexedDB();
		const created: string[] = [];
		const controller = new AbortController();

		const cache = createCardImageCache({
			indexedDB: mockIdb.factory,
			fetchImpl: async () => {
				controller.abort();
				return makeImageResponse(128);
			},
			createObjectUrl: () => {
				created.push('blob:leaked');
				return 'blob:leaked';
			}
		});

		const result = await cache.acquire(SCRYFALL_A, { signal: controller.signal });
		expect(result.src).toBe(SCRYFALL_A);
		expect(created).toEqual([]);
		await cache.close();
	});

	it('prewarms IndexedDB without creating object URLs and clears cleanly', async () => {
		const mockIdb = createMockIndexedDB();
		const fetchMock = vi.fn(async () => makeImageResponse(300));
		const created: string[] = [];
		const revoked: string[] = [];

		const cache = createCardImageCache({
			indexedDB: mockIdb.factory,
			fetchImpl: fetchMock,
			createObjectUrl: () => {
				const url = `blob:warm-${created.length + 1}`;
				created.push(url);
				return url;
			},
			revokeObjectUrl: (url) => revoked.push(url)
		});

		expect(await cache.prewarm(SCRYFALL_A)).toBe(true);
		expect(created).toEqual([]);
		expect(fetchMock).toHaveBeenCalledTimes(1);

		const ssrCache = createCardImageCache({ indexedDB: null });
		expect(await ssrCache.prewarm(SCRYFALL_A)).toBe(false);

		const handle = await cache.acquire(SCRYFALL_A);
		expect(handle.fromCache).toBe(true);
		expect(fetchMock).toHaveBeenCalledTimes(1);

		// Clearing while a handle is active empties IDB and detaches the handle;
		// releasing it later still revokes its object URL cleanly.
		expect(await cache.clear()).toBe(true);
		expect(await cache.getStats()).toMatchObject({ available: true, entryCount: 0, totalBytes: 0 });
		expect(cache.acquireSync(SCRYFALL_A)).toBeNull();
		expect(revoked).toEqual([]);

		handle.release();
		expect(revoked).toEqual(['blob:warm-1']);
		await cache.close();
	});
});

describe('cardImageSrc and ImageCacheSettings SSR', () => {
	it('returns the direct Scryfall URL on SSR for progressive enhancement', () => {
		expect(cardImageSrc(SCRYFALL_A)).toBe(SCRYFALL_A);
		expect(cardImageSrc('')).toBeUndefined();
		expect(cardImageSrc(null)).toBeUndefined();
	});

	it('suppresses transient blob load error for downstream listeners until raw URL also fails', () => {
		const originalWindow = globalThis.window;
		(globalThis as { window?: unknown }).window = {};
		try {
			const listeners = new Map<string, Array<(ev: Event) => void>>();
			const fakeImage = {
				src: 'blob:corrupt-card',
				getAttribute: () => null,
				addEventListener: (type: string, fn: (ev: Event) => void) => {
					const list = listeners.get(type) ?? [];
					list.push(fn);
					listeners.set(type, list);
				},
				removeEventListener: (type: string, fn: (ev: Event) => void) => {
					const list = listeners.get(type) ?? [];
					listeners.set(
						type,
						list.filter((item) => item !== fn)
					);
				}
			};
			const dispatchError = () => {
				let stopped = false;
				const event = {
					stopImmediatePropagation: () => {
						stopped = true;
					}
				} as unknown as Event;
				for (const fn of [...(listeners.get('error') ?? [])]) {
					fn(event);
					if (stopped) break;
				}
			};

			const cleanup = cachedCardImage(SCRYFALL_A)(fakeImage as unknown as HTMLImageElement);
			const downstreamErrors = vi.fn();
			fakeImage.addEventListener('error', downstreamErrors);

			// First error on blob URL switches to raw Scryfall URL without notifying downstream.
			dispatchError();
			expect(fakeImage.src).toBe(SCRYFALL_A);
			expect(downstreamErrors).not.toHaveBeenCalled();

			// Second error on raw URL propagates to downstream listeners (e.g. print sheet tracker).
			dispatchError();
			expect(downstreamErrors).toHaveBeenCalledTimes(1);

			cleanup?.();
		} finally {
			(globalThis as { window?: unknown }).window = originalWindow;
		}
	});

	it('renders ImageCacheSettings with heading and clear button', () => {
		const { body } = render(ImageCacheSettings);
		expect(body).toContain('Card image cache');
		expect(body).toContain('Clear image cache');
	});
});
