export const IMAGE_CACHE_DB_NAME = 'spellbook-card-images';
export const IMAGE_CACHE_DB_VERSION = 1;
export const IMAGE_CACHE_STORE_NAME = 'images';
export const IMAGE_CACHE_LAST_ACCESSED_INDEX = 'by_last_accessed';
export const DEFAULT_MAX_ENTRIES = 2000;
export const DEFAULT_MAX_BYTES = 200 * 1024 * 1024;
export const SCRYFALL_IMAGE_HOST = 'cards.scryfall.io';

export interface CachedImageRecord {
	url: string;
	blob: Blob;
	size: number;
	lastAccessedAt: number;
}

export interface ImageCacheStats {
	available: boolean;
	entryCount: number;
	totalBytes: number;
	maxEntries: number;
	maxBytes: number;
}

export interface ResolvedCardImage {
	src: string;
	fromCache: boolean;
	release: () => void;
}

export interface CardImageCacheOptions {
	dbName?: string;
	maxEntries?: number;
	maxBytes?: number;
	indexedDB?: IDBFactory | null;
	fetchImpl?: typeof fetch;
	createObjectUrl?: (blob: Blob) => string;
	revokeObjectUrl?: (url: string) => void;
	now?: () => number;
}

interface ActiveObjectUrlEntry {
	objectUrl: string;
	refs: number;
	detached: boolean;
}

interface LoadedBlob {
	blob: Blob;
	fromCache: boolean;
}

export interface CardImageCache {
	readonly maxEntries: number;
	readonly maxBytes: number;
	acquireSync(url: string): ResolvedCardImage | null;
	acquire(url: string, options?: { signal?: AbortSignal }): Promise<ResolvedCardImage>;
	prewarm(url: string): Promise<boolean>;
	getStats(): Promise<ImageCacheStats>;
	clear(): Promise<boolean>;
	close(): Promise<void>;
}

const NOOP = () => {};

export function isCacheableScryfallImageUrl(rawUrl: string | null | undefined): boolean {
	if (!rawUrl) return false;
	try {
		const parsed = new URL(rawUrl);
		return parsed.protocol === 'https:' && parsed.hostname === SCRYFALL_IMAGE_HOST;
	} catch {
		return false;
	}
}

export function formatByteSize(bytes: number, locale: string): string {
	const safeBytes = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
	const units = ['B', 'KB', 'MB', 'GB'] as const;
	let value = safeBytes;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}
	const formatted = new Intl.NumberFormat(locale, {
		maximumFractionDigits: unitIndex === 0 ? 0 : 1
	}).format(value);
	return `${formatted} ${units[unitIndex]}`;
}

function isQuotaExceededError(error: unknown): boolean {
	if (!error || typeof error !== 'object') return false;
	const name = 'name' in error ? String(error.name) : '';
	return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED';
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
	});
}

function transactionComplete(tx: IDBTransaction): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		let settled = false;
		const fail = (error: unknown) => {
			if (settled) return;
			settled = true;
			reject(error);
		};
		tx.oncomplete = () => {
			if (settled) return;
			settled = true;
			resolve();
		};
		tx.onerror = (event) => {
			const target = event?.target as { error?: unknown } | null;
			fail(tx.error ?? target?.error ?? new Error('IndexedDB transaction failed'));
		};
		tx.onabort = () => {
			fail(tx.error ?? new Error('IndexedDB transaction aborted'));
		};
	});
}

function isImageBlob(blob: Blob, contentTypeHeader: string | null): boolean {
	const type = (blob.type || contentTypeHeader || '').trim().toLowerCase();
	return type.startsWith('image/');
}

export function createCardImageCache(options: CardImageCacheOptions = {}): CardImageCache {
	const dbName = options.dbName ?? IMAGE_CACHE_DB_NAME;
	const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
	const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
	const getIndexedDB = (): IDBFactory | null => {
		if (options.indexedDB !== undefined) return options.indexedDB;
		return typeof globalThis.indexedDB !== 'undefined' ? globalThis.indexedDB : null;
	};
	const fetchImpl = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
	const createObjectUrl = options.createObjectUrl ?? ((blob: Blob) => URL.createObjectURL(blob));
	const revokeObjectUrl = options.revokeObjectUrl ?? ((url: string) => URL.revokeObjectURL(url));
	const now = options.now ?? (() => Date.now());

	let lastTimestamp = 0;
	const nextTimestamp = (): number => {
		const current = now();
		lastTimestamp = current > lastTimestamp ? current : lastTimestamp + 1;
		return lastTimestamp;
	};

	let dbPromise: Promise<IDBDatabase | null> | null = null;
	let unavailable = false;
	let cacheGeneration = 0;

	const activeObjectUrls = new Map<string, ActiveObjectUrlEntry>();
	const inFlight = new Map<string, Promise<LoadedBlob | null>>();

	function openDatabase(): Promise<IDBDatabase | null> {
		if (unavailable) return Promise.resolve(null);
		if (dbPromise) return dbPromise;

		const idb = getIndexedDB();
		if (!idb) {
			unavailable = true;
			return Promise.resolve(null);
		}

		dbPromise = new Promise<IDBDatabase | null>((resolve) => {
			let request: IDBOpenDBRequest;
			try {
				request = idb.open(dbName, IMAGE_CACHE_DB_VERSION);
			} catch {
				unavailable = true;
				dbPromise = null;
				resolve(null);
				return;
			}

			request.onupgradeneeded = () => {
				const db = request.result;
				const store = db.objectStoreNames.contains(IMAGE_CACHE_STORE_NAME)
					? request.transaction?.objectStore(IMAGE_CACHE_STORE_NAME)
					: db.createObjectStore(IMAGE_CACHE_STORE_NAME, { keyPath: 'url' });
				if (store && !store.indexNames.contains(IMAGE_CACHE_LAST_ACCESSED_INDEX)) {
					store.createIndex(IMAGE_CACHE_LAST_ACCESSED_INDEX, 'lastAccessedAt', {
						unique: false
					});
				}
			};

			request.onsuccess = () => {
				const db = request.result;
				db.onversionchange = () => {
					db.close();
					dbPromise = null;
				};
				db.onclose = () => {
					dbPromise = null;
				};
				resolve(db);
			};

			request.onerror = () => {
				unavailable = true;
				dbPromise = null;
				resolve(null);
			};

			request.onblocked = () => {
				dbPromise = null;
				resolve(null);
			};
		});

		return dbPromise;
	}

	async function readRecord(db: IDBDatabase, url: string): Promise<CachedImageRecord | null> {
		try {
			const tx = db.transaction(IMAGE_CACHE_STORE_NAME, 'readonly');
			const done = transactionComplete(tx);
			const store = tx.objectStore(IMAGE_CACHE_STORE_NAME);
			const record = await requestToPromise(store.get(url));
			await done;
			if (!record || !(record.blob instanceof Blob) || record.blob.size <= 0) return null;
			return record as CachedImageRecord;
		} catch {
			return null;
		}
	}

	async function touchRecord(db: IDBDatabase, url: string, generation: number): Promise<void> {
		if (generation !== cacheGeneration) return;
		try {
			const tx = db.transaction(IMAGE_CACHE_STORE_NAME, 'readwrite');
			const done = transactionComplete(tx);
			const store = tx.objectStore(IMAGE_CACHE_STORE_NAME);
			const getReq = store.get(url);
			getReq.onsuccess = () => {
				const existing = getReq.result as CachedImageRecord | undefined;
				if (existing && generation === cacheGeneration) {
					store.put({
						...existing,
						lastAccessedAt: nextTimestamp()
					});
				}
			};
			await done;
		} catch {
			// Best-effort LRU touch; ignore transient or quota errors.
		}
	}

	function evictInStore(
		store: IDBObjectStore,
		targetMaxEntries: number,
		targetMaxBytes: number
	): void {
		const keys: Array<{ key: IDBValidKey; size: number }> = [];
		let totalBytes = 0;
		const index = store.index(IMAGE_CACHE_LAST_ACCESSED_INDEX);
		const cursorReq = index.openCursor(null, 'next');

		cursorReq.onsuccess = () => {
			const cursor = cursorReq.result;
			if (cursor) {
				const value = cursor.value as CachedImageRecord | undefined;
				const size = value?.size ?? value?.blob?.size ?? 0;
				keys.push({ key: cursor.primaryKey, size });
				totalBytes += size;
				cursor.continue();
				return;
			}
			let entryCount = keys.length;
			for (const item of keys) {
				if (entryCount <= targetMaxEntries && totalBytes <= targetMaxBytes) break;
				store.delete(item.key);
				entryCount -= 1;
				totalBytes = Math.max(0, totalBytes - item.size);
			}
		};
	}

	async function evictOldest(
		db: IDBDatabase,
		targetMaxEntries: number,
		targetMaxBytes: number
	): Promise<void> {
		const tx = db.transaction(IMAGE_CACHE_STORE_NAME, 'readwrite');
		const done = transactionComplete(tx);
		const store = tx.objectStore(IMAGE_CACHE_STORE_NAME);
		evictInStore(store, targetMaxEntries, targetMaxBytes);
		await done;
	}

	async function writeRecord(
		db: IDBDatabase,
		url: string,
		blob: Blob,
		generation: number
	): Promise<void> {
		if (generation !== cacheGeneration) return;
		if (blob.size <= 0 || blob.size > maxBytes || maxEntries <= 0) return;

		const putAndEvict = async () => {
			const tx = db.transaction(IMAGE_CACHE_STORE_NAME, 'readwrite');
			const done = transactionComplete(tx);
			const store = tx.objectStore(IMAGE_CACHE_STORE_NAME);
			const record: CachedImageRecord = {
				url,
				blob,
				size: blob.size,
				lastAccessedAt: nextTimestamp()
			};
			const putReq = store.put(record);
			putReq.onsuccess = () => {
				evictInStore(store, maxEntries, maxBytes);
			};
			await done;
		};

		try {
			await putAndEvict();
		} catch (error) {
			if (!isQuotaExceededError(error)) return;
			try {
				// Free space by evicting oldest entries to make room, then retry once.
				const reducedBytes = Math.max(0, Math.floor((maxBytes - blob.size) * 0.8));
				const reducedEntries = Math.max(0, Math.floor((maxEntries - 1) * 0.8));
				await evictOldest(db, reducedEntries, reducedBytes);
				if (generation === cacheGeneration) {
					await putAndEvict();
				}
			} catch {
				// Graceful degradation: continue without persisting if quota remains exceeded.
			}
		}
	}

	function createHandle(
		url: string,
		entry: ActiveObjectUrlEntry,
		fromCache: boolean
	): ResolvedCardImage {
		let released = false;
		return {
			src: entry.objectUrl,
			fromCache,
			release() {
				if (released) return;
				released = true;
				entry.refs -= 1;
				if (entry.refs <= 0) {
					if (!entry.detached && activeObjectUrls.get(url) === entry) {
						activeObjectUrls.delete(url);
					}
					revokeObjectUrl(entry.objectUrl);
				}
			}
		};
	}

	function loadBlob(url: string): Promise<LoadedBlob | null> {
		const existing = inFlight.get(url);
		if (existing) return existing;

		const generation = cacheGeneration;
		const promise = (async (): Promise<LoadedBlob | null> => {
			const db = await openDatabase();
			if (!db) return null;

			const cached = await readRecord(db, url);
			if (cached) {
				void touchRecord(db, url, generation);
				return { blob: cached.blob, fromCache: true };
			}

			let response: Response;
			try {
				response = await fetchImpl(url, { mode: 'cors', credentials: 'omit' });
			} catch {
				return null;
			}
			if (!response.ok) return null;

			let blob: Blob;
			try {
				blob = await response.blob();
			} catch {
				return null;
			}

			if (blob.size <= 0 || !isImageBlob(blob, response.headers.get('content-type'))) {
				return null;
			}

			if (generation === cacheGeneration) {
				await writeRecord(db, url, blob, generation);
			}

			return { blob, fromCache: false };
		})().finally(() => {
			if (inFlight.get(url) === promise) {
				inFlight.delete(url);
			}
		});

		inFlight.set(url, promise);
		return promise;
	}

	return {
		maxEntries,
		maxBytes,

		acquireSync(url: string): ResolvedCardImage | null {
			if (!isCacheableScryfallImageUrl(url)) return null;
			const entry = activeObjectUrls.get(url);
			if (!entry || entry.detached) return null;
			entry.refs += 1;
			const generation = cacheGeneration;
			void openDatabase().then((db) => {
				if (db) void touchRecord(db, url, generation);
			});
			return createHandle(url, entry, true);
		},

		async acquire(
			url: string,
			acquireOptions?: { signal?: AbortSignal }
		): Promise<ResolvedCardImage> {
			const fallback = (): ResolvedCardImage => ({
				src: url,
				fromCache: false,
				release: NOOP
			});

			if (!isCacheableScryfallImageUrl(url) || acquireOptions?.signal?.aborted) {
				return fallback();
			}

			const syncHit = this.acquireSync(url);
			if (syncHit) return syncHit;

			const generation = cacheGeneration;
			const loaded = await loadBlob(url);
			if (!loaded || acquireOptions?.signal?.aborted || generation !== cacheGeneration) {
				return fallback();
			}

			const existing = activeObjectUrls.get(url);
			if (existing && !existing.detached) {
				existing.refs += 1;
				return createHandle(url, existing, loaded.fromCache);
			}

			let objectUrl: string;
			try {
				objectUrl = createObjectUrl(loaded.blob);
			} catch {
				return fallback();
			}

			const entry: ActiveObjectUrlEntry = {
				objectUrl,
				refs: 1,
				detached: false
			};
			activeObjectUrls.set(url, entry);
			return createHandle(url, entry, loaded.fromCache);
		},

		async prewarm(url: string): Promise<boolean> {
			if (!isCacheableScryfallImageUrl(url)) return false;
			if (activeObjectUrls.has(url)) return true;
			const loaded = await loadBlob(url);
			return loaded !== null;
		},

		async getStats(): Promise<ImageCacheStats> {
			const db = await openDatabase();
			if (!db) {
				return {
					available: false,
					entryCount: 0,
					totalBytes: 0,
					maxEntries,
					maxBytes
				};
			}

			try {
				const tx = db.transaction(IMAGE_CACHE_STORE_NAME, 'readonly');
				const done = transactionComplete(tx);
				const store = tx.objectStore(IMAGE_CACHE_STORE_NAME);
				let entryCount = 0;
				let totalBytes = 0;

				const cursorReq = store.openCursor();
				cursorReq.onsuccess = () => {
					const cursor = cursorReq.result;
					if (!cursor) return;
					const value = cursor.value as CachedImageRecord | undefined;
					entryCount += 1;
					totalBytes += value?.size ?? value?.blob?.size ?? 0;
					cursor.continue();
				};

				await done;
				return {
					available: true,
					entryCount,
					totalBytes,
					maxEntries,
					maxBytes
				};
			} catch {
				return {
					available: false,
					entryCount: 0,
					totalBytes: 0,
					maxEntries,
					maxBytes
				};
			}
		},

		async clear(): Promise<boolean> {
			cacheGeneration += 1;
			for (const entry of activeObjectUrls.values()) {
				entry.detached = true;
			}
			activeObjectUrls.clear();
			inFlight.clear();

			const db = await openDatabase();
			if (!db) return false;

			try {
				const tx = db.transaction(IMAGE_CACHE_STORE_NAME, 'readwrite');
				const done = transactionComplete(tx);
				const store = tx.objectStore(IMAGE_CACHE_STORE_NAME);
				store.clear();
				await done;
				return true;
			} catch {
				return false;
			}
		},

		async close(): Promise<void> {
			const current = dbPromise;
			dbPromise = null;
			if (!current) return;
			const db = await current;
			db?.close();
		}
	};
}

export const cardImageCache: CardImageCache = createCardImageCache();
