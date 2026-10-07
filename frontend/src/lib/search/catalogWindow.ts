import { browseCards, searchCards } from './catalog.ts';
import { buildSearchContextKey, type SearchContextInput } from './requestContext.ts';
import type { CardDocument, FacetResponse, SearchResult } from './types.ts';

export const CATALOG_PAGE_SIZE = 200;
const MAX_OFFSET = 1_000_000;
const MAX_PAGES = 20;
const MAX_CONTEXTS = 4;
const MAX_REQUESTS = 3;
const MAX_RECORDS = 1000;
const TARGET_BYTES = 8 * 1024 * 1024;

export interface CatalogRange {
	start: number;
	end: number;
	direction: 1 | -1;
}
export interface CatalogWindowSnapshot {
	pages: ReadonlyMap<number, CardDocument[]>;
	total: number;
	generation: string | null | undefined;
	facets: FacetResponse | null;
	loading: boolean;
	error: string | null;
	reset: number;
	publicationReset?: number;
	anchor?: number;
	validated?: boolean;
	resources?: {
		records: number;
		bytes: number;
		pages: number;
		contexts: number;
		physicalRequests: number;
		byteOverflow: number;
		retainedSeedRecords: number;
	};
}
interface CachedContext {
	key: string;
	input: SearchContextInput;
	pages: Map<number, CardDocument[]>;
	total: number;
	generation: string | null | undefined;
	facets: FacetResponse | null;
}
type PageLoader = (
	input: SearchContextInput,
	offset: number,
	signal: AbortSignal
) => Promise<SearchResult>;
interface Flight {
	session: number;
	offset: number;
	controller: AbortController;
}

/** At most three visible ranges and two adjacent ranges fit the 1,000-record cache. */
export function planCatalogPages(
	range: CatalogRange,
	total: number,
	limit = CATALOG_PAGE_SIZE
): number[] {
	if (total <= 0 || range.end <= range.start) return [];
	const lastPage = Math.floor(Math.min(total - 1, MAX_OFFSET) / limit);
	const first = Math.min(lastPage, Math.max(0, Math.floor(range.start / limit)));
	const last = Math.min(lastPage, Math.max(first, Math.floor((range.end - 1) / limit)));
	const capacity = Math.max(1, Math.floor(MAX_RECORDS / limit));
	const visible = Array.from(
		{ length: Math.min(last - first + 1, Math.max(1, capacity - 2)) },
		(_, i) => first + i
	);
	const adjacent =
		range.direction === 1 ? [visible.at(-1)! + 1, first - 1] : [first - 1, visible.at(-1)! + 1];
	return [...visible, ...adjacent.filter((page) => page >= 0 && page <= lastPage)]
		.slice(0, capacity)
		.map((page) => page * limit);
}
export function cardAt(
	snapshot: CatalogWindowSnapshot,
	index: number,
	limit = CATALOG_PAGE_SIZE
): CardDocument | undefined {
	return snapshot.pages.get(Math.floor(index / limit) * limit)?.[index % limit];
}
const loadPage: PageLoader = (input, offset, signal) => {
	const options = { ...input, offset, signal, facets: true };
	return input.query.trim().length < 2 ? browseCards(options) : searchCards(input.query, options);
};

/** Owns publication coherence and physical admission; viewport geometry belongs to the grid. */
export class CatalogWindow {
	private pinned: {
		context: CachedContext;
		offset: number;
		hits: CardDocument[];
		bytes: number;
	} | null = null;
	private contexts = new Map<string, CachedContext>();
	private recency = new Map<
		string,
		{ context: CachedContext; offset: number; records: number; bytes: number }
	>();
	// Aborted transports retain their permit until the loader actually settles.
	private flights = new Set<Flight>();
	private failures = new Set<number>();
	private suppressed = new Set<number>();
	private active: CachedContext | null = null;
	private session = 0;
	private reset = 0;
	private publicationReset = 0;
	private validated = false;
	private started = false;
	private error: string | null = null;
	private anchor = 0;
	private range: CatalogRange = { start: 0, end: CATALOG_PAGE_SIZE, direction: 1 };
	constructor(
		private changed: (snapshot: CatalogWindowSnapshot) => void,
		private loader: PageLoader = loadPage
	) {}

	activate(input: SearchContextInput): void {
		const limit = Math.min(500, Math.max(1, Math.floor(input.limit ?? CATALOG_PAGE_SIZE)));
		input = { ...input, limit };
		this.cancel();
		this.started = false;
		this.validated = false;
		this.error = null;
		this.failures.clear();
		this.suppressed.clear();
		this.anchor = this.checkedOffset(input.offset ?? 0, limit);
		this.range = { start: this.anchor, end: this.anchor + limit, direction: 1 };
		const key = buildSearchContextKey(input);
		let context = this.contexts.get(key);
		if (!context)
			context = { key, input, pages: new Map(), total: 0, generation: undefined, facets: null };
		context.input = input;
		this.contexts.delete(key);
		this.contexts.set(key, context);
		this.active = context;
		while (this.contexts.size > MAX_CONTEXTS) {
			const oldest = [...this.contexts.values()].find(
				(c) => c !== this.pinned?.context && c !== this.active
			)!;
			this.contexts.delete(oldest.key);
			this.dropPages(oldest);
		}
		this.reset++;
		this.publish();
	}
	setAnchor(offset: number): void {
		if (!this.active) return;
		const anchor = this.checkedOffset(offset, this.active.input.limit!);
		if (anchor === this.anchor) return;
		this.anchor = anchor;
		this.range = { start: anchor, end: anchor + this.active.input.limit!, direction: 1 };
		this.cancel();
		this.validated = false;
		this.failures.clear();
		this.suppressed.clear();
		this.error = null;
		this.reset++;
		this.pump();
	}
	/** Adopt the current native page without a duplicate initial read. */
	seed(result: SearchResult): boolean {
		if (!this.active) return false;
		const changedGeneration =
			this.active.generation !== undefined && this.active.generation !== result.generationId;
		this.pinned = {
			context: this.active,
			offset: this.anchor,
			hits: result.hits,
			bytes: new TextEncoder().encode(JSON.stringify(result.hits)).length
		};
		if (changedGeneration) {
			this.cancel();
			for (const context of this.contexts.values()) this.dropPages(context);
			this.contexts.clear();
			this.contexts.set(this.active.key, this.active);
			this.anchor = 0;
			this.range = { start: 0, end: this.active.input.limit!, direction: 1 };
			this.publicationReset++;
			this.reset++;
			this.failures.clear();
			this.suppressed.clear();
			this.error = null;
		}
		this.active.generation = result.generationId;
		this.active.total = result.estimatedTotalHits;
		this.active.facets = result.facets ?? null;
		this.validated = !changedGeneration;
		if (!changedGeneration) this.admit(this.active, this.anchor, result.hits);
		this.publish();
		return !changedGeneration;
	}
	releaseSeed(): void {
		this.pinned = null;
		this.publish();
	}
	start(): void {
		this.started = true;
		this.pump();
	}
	resume(): void {
		this.cancel();
		this.validated = false;
		this.started = true;
		this.pump();
	}
	setRange(range: CatalogRange): void {
		if (range.start !== this.range.start || range.end !== this.range.end) this.suppressed.clear();
		this.range = { ...range, end: Math.min(range.end, range.start + 200) };
		if (this.active?.input.browsingMode === 'lazy' && this.validated)
			this.anchor = this.checkedOffset(range.start, this.active.input.limit!);
		if (!this.started || !this.validated || !this.active) return;
		const wanted = new Set(this.planned());
		for (const flight of this.flights)
			if (flight.session === this.session && !wanted.has(flight.offset)) flight.controller.abort();
		for (const offset of wanted) this.touch(this.active, offset);
		this.pump();
	}
	retry(): void {
		this.failures.clear();
		this.suppressed.clear();
		this.error = null;
		this.started = true;
		this.pump();
	}
	dispose(): void {
		this.started = false;
		this.cancel();
		this.publish();
	}
	private checkedOffset(offset: number, limit: number): number {
		return Number.isSafeInteger(offset) && offset >= 0 && offset <= MAX_OFFSET
			? Math.floor(offset / limit) * limit
			: 0;
	}
	private planned(): number[] {
		if (!this.active) return [];
		if (this.active.input.browsingMode === 'numeric') return [this.anchor];
		const pages = planCatalogPages(this.range, this.active.total, this.active.input.limit);
		const pinIncluded =
			this.pinned &&
			this.pinned.context === this.active &&
			pages.includes(this.pinned.offset) &&
			this.active.pages.get(this.pinned.offset) === this.pinned.hits;
		const available = MAX_RECORDS - (this.pinned && !pinIncluded ? this.pinned.hits.length : 0);
		return pages.slice(0, Math.max(1, Math.floor(available / this.active.input.limit!)));
	}
	private cancel(): void {
		this.session++;
		for (const flight of this.flights) flight.controller.abort();
	}
	private entryKey(context: CachedContext, offset: number): string {
		return JSON.stringify([context.key, context.generation, offset]);
	}
	private touch(context: CachedContext, offset: number): void {
		const key = this.entryKey(context, offset);
		const entry = this.recency.get(key);
		if (entry) {
			this.recency.delete(key);
			this.recency.set(key, entry);
		}
	}
	private dropPages(context: CachedContext): void {
		context.pages.clear();
		for (const [key, entry] of this.recency)
			if (entry.context === context) this.recency.delete(key);
	}
	private totals() {
		let records = 0,
			bytes = new TextEncoder().encode(
				JSON.stringify(
					[...this.contexts.values()].map((context) => ({
						total: context.total,
						generation: context.generation,
						facets: context.facets
					}))
				)
			).length;
		for (const entry of this.recency.values()) {
			records += entry.records;
			bytes += entry.bytes;
		}
		const retained =
			this.pinned &&
			![...this.recency.values()].some(
				(entry) => entry.context.pages.get(entry.offset) === this.pinned!.hits
			)
				? this.pinned
				: null;
		if (retained) {
			records += retained.hits.length;
			bytes += retained.bytes;
		}
		return { records, bytes, pages: this.recency.size + (retained ? 1 : 0) };
	}
	private protectedOffset(offset: number): boolean {
		if (!this.active) return false;
		if (this.active.input.browsingMode === 'numeric') return offset === this.anchor;
		const limit = this.active.input.limit!;
		return offset <= this.range.end - 1 && offset + limit > this.range.start;
	}
	private admit(context: CachedContext, offset: number, hits: CardDocument[]): void {
		const key = this.entryKey(context, offset);
		const entry = {
			context,
			offset,
			records: hits.length,
			bytes: new TextEncoder().encode(JSON.stringify(hits)).length
		};
		this.recency.delete(key);
		context.pages.delete(offset);
		const required = this.protectedOffset(offset);
		let totals = this.totals();
		const incomingPinned = this.pinned?.hits === hits;
		if (incomingPinned)
			totals = {
				records: totals.records - hits.length,
				bytes: totals.bytes - entry.bytes,
				pages: totals.pages - 1
			};
		for (const [oldKey, old] of this.recency) {
			if (
				totals.records + entry.records <= MAX_RECORDS &&
				totals.bytes + entry.bytes <= TARGET_BYTES &&
				totals.pages < MAX_PAGES
			)
				break;
			if (
				(old.context === this.active && this.protectedOffset(old.offset)) ||
				old.context.pages.get(old.offset) === this.pinned?.hits
			)
				continue;
			old.context.pages.delete(old.offset);
			this.recency.delete(oldKey);
			totals = this.totals();
			if (incomingPinned)
				totals = {
					records: totals.records - hits.length,
					bytes: totals.bytes - entry.bytes,
					pages: totals.pages - 1
				};
		}
		// Adjacent prefetch may not evict a visible page or repeatedly reload an unadmittable page.
		if (
			!required &&
			(totals.records + entry.records > MAX_RECORDS ||
				totals.bytes + entry.bytes > TARGET_BYTES ||
				totals.pages >= MAX_PAGES)
		) {
			this.suppressed.add(offset);
			return;
		}
		context.pages.set(offset, hits);
		this.recency.set(key, entry);
	}
	private pump(): void {
		if (!this.active || !this.started) return;
		for (const offset of this.validated ? this.planned() : [this.anchor]) {
			if (this.flights.size >= MAX_REQUESTS) break;
			if (
				this.failures.has(offset) ||
				this.suppressed.has(offset) ||
				(this.validated && this.active.pages.has(offset)) ||
				[...this.flights].some(
					(f) => f.session === this.session && f.offset === offset && !f.controller.signal.aborted
				)
			)
				continue;
			void this.request(this.active, offset);
		}
		this.publish();
	}
	private async request(context: CachedContext, offset: number): Promise<void> {
		const flight: Flight = { session: this.session, offset, controller: new AbortController() };
		this.flights.add(flight);
		try {
			const result = await this.loader(context.input, offset, flight.controller.signal);
			if (result.hits.length > context.input.limit!)
				throw new Error('Catalog returned an oversized page. Retry search.');
			if (flight.controller.signal.aborted || flight.session !== this.session) return;
			if (context.generation !== undefined && context.generation !== result.generationId) {
				this.cancel();
				for (const cached of this.contexts.values()) this.dropPages(cached);
				this.contexts.clear();
				context.total = 0;
				context.generation = undefined;
				context.facets = null;
				this.contexts.set(context.key, context);
				this.validated = false;
				this.error = null;
				this.failures.clear();
				this.suppressed.clear();
				this.anchor = 0;
				this.publicationReset++;
				this.range = { start: 0, end: context.input.limit!, direction: 1 };
				this.reset++;
				if (offset !== 0) return;
			}
			context.generation = result.generationId;
			context.total = result.estimatedTotalHits;
			if (offset === this.anchor) {
				context.facets = result.facets ?? null;
				const last =
					Math.floor(Math.max(0, context.total - 1) / context.input.limit!) * context.input.limit!;
				if (offset > last) {
					this.setAnchor(last);
					return;
				}
				this.validated = true;
			}
			if (!result.hits.length && offset < context.total)
				throw new Error('This card range could not be loaded. Retry search.');
			this.admit(context, offset, result.hits);
		} catch (error) {
			if (!flight.controller.signal.aborted && flight.session === this.session) {
				this.failures.add(offset);
				this.error = error instanceof Error ? error.message : 'Catalog search failed. Try again.';
			}
		} finally {
			this.flights.delete(flight);
			this.pump();
			this.publish();
		}
	}
	private publish(): void {
		const { records, bytes, pages } = this.totals();
		this.changed({
			pages: new Map(this.active?.pages),
			total: this.active?.total ?? 0,
			generation: this.active?.generation,
			facets: this.active?.facets ?? null,
			loading:
				!this.started ||
				(!this.validated && !this.error) ||
				[...this.flights].some((f) => f.session === this.session && !f.controller.signal.aborted),
			error: this.error,
			reset: this.reset,
			publicationReset: this.publicationReset,
			anchor: this.anchor,
			validated: this.validated,
			resources: {
				records,
				bytes,
				pages,
				contexts: this.contexts.size,
				physicalRequests: this.flights.size,
				byteOverflow: Math.max(0, bytes - TARGET_BYTES),
				retainedSeedRecords: this.pinned?.hits.length ?? 0
			}
		});
	}
}
