import type {
	InventoryEntry,
	InventoryPage,
	InventoryLocation,
	InventoryQuery,
	RevisionChanged
} from '@spellbook/contracts/inventory.ts';
export type InventoryTransport = (
	query: InventoryQuery,
	revision: string | undefined,
	signal: AbortSignal
) => Promise<InventoryPage | RevisionChanged>;
export type InventoryBrowseMode = 'numeric' | 'lazy';
interface Context {
	page: InventoryPage;
	pages: Map<number, InventoryPage>;
	maxPageBytes: number;
	used: number;
}
interface Job {
	key: string;
	offset: number;
	planned: boolean;
	resolve: () => void;
}
/** Account-scoped mutable windows. Geometry and user drafts belong to callers. */
export class InventoryWindow {
	private contexts = new Map<string, Context>();
	private account = '';
	private clock = 0;
	private key = '';
	private mode: InventoryBrowseMode = 'lazy';
	private activeOffset = 0;
	private serverPage: InventoryPage | null = null;
	private visibleOffsets = new Set<number>();
	private pageBytes = new WeakMap<InventoryPage, number>();
	private readonly byteTarget = 32 * 1024 * 1024;
	private cacheKey(page: InventoryPage) {
		return JSON.stringify([page.queryKey, page.query.limit, this.mode]);
	}
	private bytes(page: InventoryPage) {
		let bytes = this.pageBytes.get(page);
		if (bytes === undefined) {
			bytes = new TextEncoder().encode(JSON.stringify(page)).byteLength;
			this.pageBytes.set(page, bytes);
		}
		return bytes;
	}
	/** Kit retains this exact SSR DTO until replacing page data or disposing the route. */
	pinServerPage(page: InventoryPage | null) {
		this.serverPage = page;
		this.evict();
		this.changed();
	}
	private residentPages() {
		const pages = new Set(
			[...this.contexts.values()].flatMap((context) => [...context.pages.values()])
		);
		if (this.serverPage) pages.add(this.serverPage);
		return pages;
	}
	private residentRecords() {
		return [...this.residentPages()].reduce((count, page) => count + page.entries.length, 0);
	}

	get browseMode() {
		return this.mode;
	}
	get queryIdentity() {
		return this.key;
	}
	private generation = 0;
	// Delayed aborts keep their permits until the actual transport settles.
	private active = new Map<
		string,
		{ controller: AbortController; offset: number; planned: boolean; done: Promise<void> }
	>();
	private queue: Job[] = [];
	private replacing = false;
	private priorityWaiters = 0;
	private slotWaiters = new Set<() => void>();
	private listeners = new Map<string, Promise<void>>();
	error = '';
	constructor(
		private transport: InventoryTransport,
		private changed: () => void,
		private beforeRevisionReset: () => void = () => {},
		private publication: () => () => boolean = () => () => true
	) {}
	get identity() {
		return this.generation;
	}
	private async withSlot<T>(call: (signal: AbortSignal) => Promise<T>, signal: AbortSignal) {
		const identity = this.identity;
		let wake!: () => void;
		const aborted = new Promise<void>((resolve) => {
			wake = resolve;
		});
		signal.addEventListener('abort', wake, { once: true });
		this.slotWaiters.add(wake);
		this.priorityWaiters++;
		let acquired = false;
		try {
			while (this.active.size >= 3) {
				if (signal.aborted || identity !== this.identity) return null;
				await Promise.race(
					[...this.active.values()].map((request) => request.done).concat(aborted)
				);
			}
			if (signal.aborted || identity !== this.identity) return null;
			acquired = true;
		} finally {
			signal.removeEventListener('abort', wake);
			this.slotWaiters.delete(wake);
			this.priorityWaiters--;
			if (!acquired) this.pump();
		}
		const key = `transport:${identity}:${++this.clock}`;
		const controller = new AbortController();
		const abort = () => controller.abort();
		signal.addEventListener('abort', abort, { once: true });
		let complete!: () => void;
		this.listeners.set(
			key,
			new Promise<void>((resolve) => {
				complete = resolve;
			})
		);
		this.active.set(key, {
			controller,
			offset: -1,
			planned: false,
			done: this.listeners.get(key)!
		});
		this.changed();
		try {
			return await call(controller.signal);
		} catch (cause) {
			if (controller.signal.aborted) return null;
			throw cause;
		} finally {
			signal.removeEventListener('abort', abort);
			this.active.delete(key);
			this.listeners.delete(key);
			complete();
			this.changed();
			this.pump();
		}
	}
	async locateAndLoad(
		entryId: string,
		locate: (
			query: InventoryQuery,
			entryId: string,
			revision: string,
			signal: AbortSignal
		) => Promise<InventoryLocation | RevisionChanged>,
		signal: AbortSignal,
		currentLease: () => boolean = this.publication()
	) {
		const account = this.account;
		for (let attempt = 0; attempt < 2; attempt++) {
			const identity = this.identity,
				current = this.current;
			if (!currentLease() || !current || signal.aborted || account !== this.account) return null;
			let result: InventoryLocation | RevisionChanged | null;
			try {
				result = await this.withSlot(
					(lookupSignal) => locate(current.query, entryId, current.revision, lookupSignal),
					signal
				);
			} catch (cause) {
				if (signal.aborted || identity !== this.identity) return null;
				throw cause;
			}
			if (!currentLease() || !result || signal.aborted || identity !== this.identity) return null;
			if (result.kind === 'RevisionChanged') {
				this.beforeRevisionReset();
				const restored = await this.refresh(this.account, signal, currentLease);
				if (
					!currentLease() ||
					signal.aborted ||
					restored !== this.identity ||
					account !== this.account
				)
					return null;
				continue;
			}
			if (result.revision !== current.revision) return null;
			if (result.index !== null) {
				this.activeOffset = Math.floor(result.index / current.query.limit) * current.query.limit;
				this.visibleOffsets = new Set([this.activeOffset]);
				await this.request(this.activeOffset);
				if (!currentLease() || signal.aborted || account !== this.account) return null;
				if (identity !== this.identity) {
					if (
						!this.replacing &&
						this.current?.queryKey === current.queryKey &&
						this.current.revision !== current.revision
					)
						continue;
					return null;
				}
			}
			if (!currentLease()) return null;
			if (result.index !== null) {
				const context = this.contexts.get(this.key);
				if (context)
					context.page = {
						...context.page,
						query: {
							...context.page.query,
							offset: Math.floor(result.index / current.query.limit) * current.query.limit
						}
					};
				this.changed();
			}
			return { identity, index: result.index };
		}
		return null;
	}

	get current() {
		const context = this.contexts.get(this.key);
		return context
			? {
					...context.page,
					groupPage: context.pages.get(context.page.query.offset)?.groupPage ?? []
				}
			: undefined;
	}
	seed(
		account: string,
		page: InventoryPage,
		currentLease: () => boolean = () => true,
		drain = false,
		mode: InventoryBrowseMode = this.mode
	) {
		if (!currentLease()) return;
		if (account !== this.account) {
			this.clear();
			this.account = account;
		}
		if (!drain) this.cancel();
		else this.pruneQueue();
		this.generation++;
		for (const [key, context] of this.contexts)
			if (context.page.revision !== page.revision) this.contexts.delete(key);
		this.mode = mode;
		this.key = this.cacheKey(page);
		this.activeOffset = page.query.offset;
		this.visibleOffsets = new Set([page.query.offset]);
		this.error = '';
		this.replacing = false;
		const metadata = { ...page, entries: [], memberships: [], groupPage: [] };
		let context = this.contexts.get(this.key);
		if (!context || context.page.revision !== page.revision)
			context = { page: metadata, pages: new Map(), maxPageBytes: 0, used: ++this.clock };
		context.page = metadata;
		context.pages.set(page.query.offset, page);
		context.maxPageBytes = Math.max(context.maxPageBytes, this.bytes(page));
		context.used = ++this.clock;
		this.contexts.set(this.key, context);
		while (this.contexts.size > 4) {
			const oldest = [...this.contexts]
				.filter(([key]) => key !== this.key)
				.sort((a, b) => a[1].used - b[1].used)[0];
			if (oldest) this.contexts.delete(oldest[0]);
		}
		this.evict();
		this.changed();
	}
	async open(
		account: string,
		query: InventoryQuery,
		signal: AbortSignal,
		mode: InventoryBrowseMode = this.mode
	) {
		return this.replace(account, query, signal, mode);
	}
	async refresh(
		account: string,
		signal: AbortSignal,
		currentLease: () => boolean = this.publication(),
		requestedQuery?: InventoryQuery,
		mode: InventoryBrowseMode = this.mode
	) {
		const query = requestedQuery ?? this.current?.query;
		if (!query || !currentLease() || (account !== this.account && this.current)) return;
		if (account !== this.account) {
			this.clear();
			this.account = account;
		}
		this.pruneQueue();
		const generation = ++this.generation;
		this.replacing = true;
		try {
			const page = await this.withSlot(
				(signal) => this.transport(query, undefined, signal),
				signal
			);
			if (
				page?.kind === 'Page' &&
				!signal.aborted &&
				generation === this.generation &&
				currentLease()
			) {
				this.seed(account, page, currentLease, true, mode);
				return this.identity;
			}
		} finally {
			if (generation === this.generation) this.replacing = false;
			this.changed();
			this.pump();
		}
	}
	private pruneQueue() {
		for (const job of this.queue) {
			this.listeners.delete(job.key);
			job.resolve();
		}
		this.queue = [];
	}
	private async replace(
		account: string,
		query: InventoryQuery,
		signal: AbortSignal,
		mode: InventoryBrowseMode
	) {
		const currentLease = this.publication();
		this.cancel();
		const generation = ++this.generation;
		this.replacing = true;
		try {
			const page = await this.withSlot(
				(transportSignal) => this.transport(query, undefined, transportSignal),
				signal
			);
			if (
				page?.kind === 'Page' &&
				!signal.aborted &&
				generation === this.generation &&
				currentLease()
			) {
				this.seed(account, page, currentLease, false, mode);
				return this.identity;
			}
		} finally {
			if (generation === this.generation) this.replacing = false;
			this.changed();
			this.pump();
		}
	}

	clear(releaseServerPage = false) {
		if (releaseServerPage) this.serverPage = null;
		this.visibleOffsets.clear();
		this.cancel();
		this.generation++;
		this.contexts.clear();
		this.account = '';
		this.key = '';
		this.replacing = false;
		this.error = '';
		this.changed();
	}
	private cancel() {
		for (const wake of this.slotWaiters) wake();
		for (const active of this.active.values()) active.controller.abort();
		for (const job of this.queue) job.resolve();
		this.queue = [];
		this.listeners.clear();
	}
	private evict() {
		const count = () => this.residentRecords();
		const pages = () => this.residentPages().size;
		while (count() > 1000 || pages() > 20 || this.serializedBytes() > this.byteTarget) {
			const contexts = [...this.contexts].sort((a, b) => a[1].used - b[1].used);
			const candidate = contexts.flatMap(([key, c]) =>
				[...c.pages.keys()]
					.filter((offset) => key !== this.key || !this.visibleOffsets.has(offset))
					.map((offset) => ({ key, c, offset }))
			)[0];
			if (!candidate) break;
			candidate.c.pages.delete(candidate.offset);
			if (!candidate.c.pages.size && candidate.key !== this.key)
				this.contexts.delete(candidate.key);
		}
	}
	private serializedBytes() {
		return (
			[...this.contexts.values()].reduce((n, c) => n + this.bytes(c.page), 0) +
			[...this.residentPages()].reduce((n, page) => n + this.bytes(page), 0)
		);
	}

	request(offset: number, planned = false): Promise<void> {
		const context = this.contexts.get(this.key);
		if (this.replacing || !context) return Promise.resolve();
		const limit = context.page.query.limit;
		offset = Math.floor(offset / limit) * limit;
		if (context.pages.has(offset)) {
			const page = context.pages.get(offset)!;
			context.pages.delete(offset);
			context.pages.set(offset, page);
			return Promise.resolve();
		}
		const jobKey = `${this.generation}:${this.key}:${offset}`;
		const previous = this.listeners.get(jobKey);
		if (previous) return previous;
		const promise = new Promise<void>((resolve) =>
			this.queue.push({ key: jobKey, offset, planned, resolve })
		);
		this.listeners.set(jobKey, promise);
		this.pump();
		return promise;
	}
	private pump() {
		while (this.active.size < 3 && this.queue.length && this.priorityWaiters === 0) {
			const job = this.queue.shift()!;
			void this.execute(job);
		}
	}
	private async execute(job: Job) {
		const currentLease = this.publication();
		const generation = this.generation,
			key = this.key,
			context = this.contexts.get(key)!;
		const controller = new AbortController();
		this.active.set(job.key, {
			controller,
			offset: job.offset,
			planned: job.planned,
			done: this.listeners.get(job.key)!
		});
		this.changed();
		try {
			const result = await this.transport(
				{ ...context.page.query, offset: job.offset },
				context.page.revision,
				controller.signal
			);
			if (!currentLease() || controller.signal.aborted || generation !== this.generation) return;
			if (result.kind === 'RevisionChanged') {
				this.beforeRevisionReset();
				const first = await this.transport(
					{ ...context.page.query, offset: context.page.query.offset },
					undefined,
					controller.signal
				);
				if (
					currentLease() &&
					first.kind === 'Page' &&
					!controller.signal.aborted &&
					generation === this.generation
				)
					this.seed(this.account, first, currentLease, true);
			} else if (
				result.queryKey === context.page.queryKey &&
				result.query.limit === context.page.query.limit &&
				result.query.offset === job.offset &&
				result.revision === context.page.revision
			) {
				context.pages.set(job.offset, result);
				context.maxPageBytes = Math.max(context.maxPageBytes, this.bytes(result));
				context.used = ++this.clock;
				this.evict();
				this.error = '';
				this.changed();
			}
		} catch (cause) {
			if (currentLease() && !controller.signal.aborted && generation === this.generation) {
				this.error =
					cause instanceof Error ? cause.message : 'Could not load inventory. Try again.';
				this.changed();
			}
		} finally {
			this.active.delete(job.key);
			this.listeners.delete(job.key);
			job.resolve();
			this.changed();
			this.pump();
		}
	}
	plan(start: number, end: number) {
		if (this.replacing) return;
		const total = this.current?.matching.entryCount ?? 0;
		const limit = this.current?.query.limit ?? 200;
		const visible = Math.floor(Math.max(0, start) / limit);
		this.activeOffset =
			this.mode === 'numeric' ? (this.current?.query.offset ?? 0) : visible * limit;
		if (this.mode === 'lazy') {
			const context = this.contexts.get(this.key);
			if (context && context.page.query.offset !== this.activeOffset) {
				context.page = {
					...context.page,
					query: { ...context.page.query, offset: this.activeOffset }
				};
				this.changed();
			}
		}
		const pinRecords = this.serverPage ? this.serverPage.entries.length : 0;
		const capacity = Math.max(
			1,
			Math.min(20 - (this.serverPage ? 1 : 0), Math.floor((1000 - pinRecords) / limit))
		);
		const lastVisible = Math.min(
			Math.ceil(total / limit) - 1,
			Math.floor(Math.max(start, end - 1) / limit),
			visible + capacity - 1
		);
		this.visibleOffsets =
			this.mode === 'numeric'
				? new Set([this.activeOffset])
				: new Set(
						Array.from(
							{ length: Math.max(0, lastVisible - visible + 1) },
							(_, i) => (visible + i) * limit
						)
					);
		const context = this.contexts.get(this.key);
		const largest = context?.maxPageBytes ?? 0;
		const metadataBytes = [...this.contexts.values()].reduce((n, c) => n + this.bytes(c.page), 0);
		const pinBytes = this.serverPage ? this.bytes(this.serverPage) : 0;
		const byteCapacity = largest
			? Math.max(
					this.visibleOffsets.size,
					Math.floor(Math.max(0, this.byteTarget - metadataBytes - pinBytes) / largest)
				)
			: capacity;
		const plannedCapacity = Math.min(capacity, byteCapacity);
		const extra = Math.max(0, plannedCapacity - this.visibleOffsets.size);
		const first =
			this.mode === 'numeric'
				? Math.floor(this.activeOffset / limit)
				: Math.max(0, visible - Math.min(1, extra));
		const last =
			this.mode === 'numeric'
				? first
				: Math.min(
						Math.ceil(total / limit) - 1,
						lastVisible + (extra > 1 ? 1 : 0),
						first + plannedCapacity - 1
					);
		const wanted = new Set(
			Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => (first + i) * limit)
		);
		this.evict();
		this.queue = this.queue.filter((job) => {
			if (!job.planned || wanted.has(job.offset)) return true;
			this.listeners.delete(job.key);
			job.resolve();
			return false;
		});
		// Finish active reads: fetch abort can settle before network/server work stops.
		// Only queued plans are replaced when scrolling within the same query.
		for (let index = first; index <= last; index++) void this.request(index * limit, true);
	}
	at(index: number): InventoryEntry | undefined {
		const limit = this.current?.query.limit ?? 200;
		const page = this.contexts.get(this.key)?.pages.get(Math.floor(index / limit) * limit);
		return page?.entries[index % limit];
	}
	loaded() {
		const result: Array<{ index: number; entry: InventoryEntry }> = [];
		for (const [offset, page] of this.contexts.get(this.key)?.pages ?? [])
			for (const [index, entry] of page.entries.entries())
				result.push({ index: offset + index, entry });
		return result.sort((a, b) => a.index - b.index);
	}
	memberships() {
		return [...(this.contexts.get(this.key)?.pages.values() ?? [])].flatMap(
			(page) => page.memberships
		);
	}
	metrics() {
		return {
			contexts: this.contexts.size,
			serializedBytes: this.serializedBytes(),
			byteTarget: this.byteTarget,
			byteOverflow: Math.max(0, this.serializedBytes() - this.byteTarget),
			metadataOverflow: Math.max(
				0,
				[...this.contexts.values()].reduce((n, c) => n + this.bytes(c.page), 0) - this.byteTarget
			),
			pages: this.residentPages().size,
			entries: this.residentRecords(),
			pinnedSSRPages: this.serverPage ? 1 : 0,
			pinnedSSREntries: this.serverPage?.entries.length ?? 0,
			requests: this.active.size,
			queued: this.queue.length
		};
	}
}
export function inventoryUrl(query: InventoryQuery, revision?: string) {
	const params = new URLSearchParams({
		q: query.q,
		finish: query.finish,
		condition: query.condition,
		sort: query.sort,
		dir: query.dir,
		variantDir: query.variantDir,
		view: query.view
	});
	for (const set of query.sets) params.append('set', set);
	if (query.variant) params.set('variant', query.variant);
	if (query.group) params.set('group', query.group);
	params.set('offset', String(query.offset));
	params.set('limit', String(query.limit));
	if (revision !== undefined) params.set('revision', revision);
	return params;
}

/** Native offsets remain selected only while the visible controls retain that query. */
export function matchingNativeInventoryQuery(
	native: InventoryQuery | null,
	controls: InventoryQuery
): InventoryQuery | null {
	return native &&
		inventoryUrl({ ...native, offset: 0 }).toString() ===
			inventoryUrl({ ...controls, offset: 0 }).toString()
		? native
		: null;
}
