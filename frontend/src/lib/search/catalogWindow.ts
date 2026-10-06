import { browseCards, searchCards } from './catalog.ts';
import { buildSearchContextKey, type SearchContextInput } from './requestContext.ts';
import type { CardDocument, FacetResponse, SearchResult } from './types.ts';

export const CATALOG_PAGE_SIZE = 50;
const MAX_OFFSET = 1_000_000;
const MAX_PAGES = 20;
const MAX_CONTEXTS = 4;
const MAX_REQUESTS = 3;
const MAX_WINDOW_PAGES = 12;

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

export function planCatalogPages(
	range: CatalogRange,
	total: number,
	limit = CATALOG_PAGE_SIZE
): number[] {
	if (total <= 0 || range.end <= range.start) return [];
	const lastPage = Math.floor(Math.min(total - 1, MAX_OFFSET) / limit);
	const first = Math.min(lastPage, Math.max(0, Math.floor(range.start / limit)));
	const last = Math.min(lastPage, Math.max(first, Math.floor((range.end - 1) / limit)));
	const visible = Array.from(
		{ length: Math.min(last - first + 1, MAX_WINDOW_PAGES - 2) },
		(_, i) => first + i
	);
	const adjacent = range.direction === 1 ? [last + 1, first - 1] : [first - 1, last + 1];
	return [...visible, ...adjacent.filter((page) => page >= 0 && page <= lastPage)].map(
		(page) => page * limit
	);
}

export function cardAt(
	snapshot: CatalogWindowSnapshot,
	index: number,
	limit = CATALOG_PAGE_SIZE
): CardDocument | undefined {
	return snapshot.pages.get(Math.floor(index / limit) * limit)?.[index % limit];
}

const loadPage: PageLoader = (input, offset, signal) => {
	const options = { ...input, offset, signal, facets: offset === 0 };
	return input.query.trim().length < 2 ? browseCards(options) : searchCards(input.query, options);
};

/** Owns addressable pages and publication coherence; geometry stays in VirtualCardGrid. */
export class CatalogWindow {
	private contexts = new Map<string, CachedContext>();
	private recency = new Map<string, { context: CachedContext; offset: number }>();
	private pending = new Map<number, AbortController>();
	private failures = new Set<number>();
	private active: CachedContext | null = null;
	private session = 0;
	private reset = 0;
	private validated = false;
	private started = false;
	private error: string | null = null;
	private range: CatalogRange = { start: 0, end: CATALOG_PAGE_SIZE, direction: 1 };

	constructor(
		private changed: (snapshot: CatalogWindowSnapshot) => void,
		private loader: PageLoader = loadPage
	) {}

	activate(input: SearchContextInput): void {
		input = {
			...input,
			limit: Math.min(100, Math.max(1, Math.floor(input.limit ?? CATALOG_PAGE_SIZE)))
		};
		this.cancel();
		this.started = false;
		this.validated = false;
		this.error = null;
		this.failures.clear();
		this.range = { start: 0, end: input.limit ?? CATALOG_PAGE_SIZE, direction: 1 };
		const key = buildSearchContextKey(input);
		let context = this.contexts.get(key);
		if (!context)
			context = {
				key,
				input: { ...input, limit: input.limit ?? CATALOG_PAGE_SIZE },
				pages: new Map(),
				total: 0,
				generation: undefined,
				facets: null
			};
		this.contexts.delete(key);
		this.contexts.set(key, context);
		this.active = context;
		while (this.contexts.size > MAX_CONTEXTS) {
			const oldest = this.contexts.values().next().value!;
			this.contexts.delete(oldest.key);
			this.dropPages(oldest);
		}
		this.reset++;
		this.publish();
	}

	start(): void {
		this.started = true;
		this.pump();
	}

	/** Revalidate publication after a hidden workspace resumes without resetting its position. */
	resume(): void {
		this.validated = false;
		this.started = true;
		this.pump();
	}

	setRange(range: CatalogRange): void {
		this.range = range;
		if (!this.started || !this.validated || !this.active) return;
		const wanted = new Set(this.planned());
		for (const [offset, controller] of this.pending) {
			if (!wanted.has(offset)) {
				controller.abort();
				this.pending.delete(offset);
			}
		}
		for (const offset of wanted) this.touch(this.active, offset);
		this.pump();
	}

	retry(): void {
		this.failures.clear();
		this.error = null;
		this.started = true;
		this.pump();
	}

	dispose(): void {
		this.started = false;
		this.cancel();
	}

	private planned(): number[] {
		return this.active
			? planCatalogPages(this.range, this.active.total, this.active.input.limit)
			: [];
	}

	private cancel(): void {
		this.session++;
		for (const controller of this.pending.values()) controller.abort();
		this.pending.clear();
	}

	private touch(context: CachedContext, offset: number): void {
		if (!context.pages.has(offset)) return;
		const key = JSON.stringify([context.key, context.generation, offset]);
		this.recency.delete(key);
		this.recency.set(key, { context, offset });
	}

	private dropPages(context: CachedContext): void {
		context.pages.clear();
		for (const [key, entry] of this.recency)
			if (entry.context === context) this.recency.delete(key);
	}

	private pump(): void {
		if (!this.active || !this.started) return;
		const offsets = this.validated ? this.planned() : [0];
		for (const offset of offsets) {
			if (this.pending.size >= MAX_REQUESTS) break;
			if (
				this.pending.has(offset) ||
				this.failures.has(offset) ||
				(this.validated && this.active.pages.has(offset))
			)
				continue;
			void this.request(this.active, offset);
		}
		this.publish();
	}

	private async request(context: CachedContext, offset: number): Promise<void> {
		const session = this.session;
		const controller = new AbortController();
		this.pending.set(offset, controller);
		try {
			const result = await this.loader(context.input, offset, controller.signal);
			if (controller.signal.aborted || session !== this.session) return;
			if (context.generation !== undefined && context.generation !== result.generationId) {
				// An observed publication invalidates every cached context before another page is exposed.
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
				this.range = { start: 0, end: context.input.limit!, direction: 1 };
				this.reset++;
				if (offset !== 0) {
					this.pump();
					return;
				}
			}
			context.generation = result.generationId;
			context.total = result.estimatedTotalHits;
			if (offset === 0) {
				context.facets = result.facets ?? null;
				this.validated = true;
			}
			if (!result.hits.length && offset < context.total)
				throw new Error('This card range could not be loaded. Retry search.');
			context.pages.set(offset, result.hits);
			this.touch(context, offset);
			while (this.recency.size > MAX_PAGES) {
				const [key, oldest] = this.recency.entries().next().value!;
				oldest.context.pages.delete(oldest.offset);
				this.recency.delete(key);
			}
		} catch (error) {
			if (!controller.signal.aborted && session === this.session) {
				this.failures.add(offset);
				this.error = error instanceof Error ? error.message : 'Catalog search failed. Try again.';
			}
		} finally {
			if (this.pending.get(offset) === controller) this.pending.delete(offset);
			if (session === this.session || (offset === 0 && this.active === context && this.validated))
				this.pump();
		}
	}

	private publish(): void {
		this.changed({
			pages: new Map(this.active?.pages),
			total: this.active?.total ?? 0,
			generation: this.active?.generation,
			facets: this.active?.facets ?? null,
			loading: !this.started || (!this.validated && !this.error) || this.pending.size > 0,
			error: this.error,
			reset: this.reset
		});
	}
}
