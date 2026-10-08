import type {
	DeckLibraryPage,
	DeckLibraryQuery,
	DeckLibraryItem
} from '@spellbook/contracts/deck-library.ts';
import { initialLoadedSpan, admitLoadedSpan, type LoadedSpan } from '#lib/browsing/loadedSpan.ts';

export type DeckLibraryRevisionChanged = { kind: 'RevisionChanged'; revision: string };
export type DeckLibraryTransport = (
	query: DeckLibraryQuery,
	offset: number,
	limit: number,
	revision: string | undefined,
	signal: AbortSignal
) => Promise<DeckLibraryPage | DeckLibraryRevisionChanged>;
type Context = {
	page: DeckLibraryPage;
	pages: Map<number, DeckLibraryPage>;
	span: LoadedSpan;
	used: number;
};
type Job = {
	key: string;
	context: string;
	generation: number;
	offset: number;
	explicit: boolean;
	refresh: boolean;
	current: () => boolean;
	resolve: () => void;
	promise: Promise<void>;
};
/** Directory records and physical transport occupancy are independent of editor drafts. */
export class DeckLibraryWindow {
	private contexts = new Map<string, Context>();
	private active = new Map<string, AbortController>();
	private queue: Job[] = [];
	private pending = new Map<string, Job>();
	private key = '';
	private account = '';
	private generation = 0;
	private clock = 0;
	private seedPage: DeckLibraryPage | null = null;
	private retained: DeckLibraryItem | null = null;
	private waiters = new Set<() => void>();
	private visible = new Set<number>();
	private failed: { offset: number; explicit: boolean; refresh: boolean } | null = null;
	error = '';
	constructor(
		private transport: DeckLibraryTransport,
		private changed: () => void,
		private beforeChange: () => void = () => {}
	) {}
	get current() {
		return this.contexts.get(this.key)?.page;
	}
	get span(): LoadedSpan {
		return this.contexts.get(this.key)?.span ?? { start: 0, end: 0 };
	}
	get identity() {
		return this.generation;
	}
	private contextKey(account: string, page: DeckLibraryPage) {
		return JSON.stringify([account, page.queryKey, page.revision, page.limit]);
	}
	private cancel() {
		this.generation++;
		for (const wake of this.waiters) wake();
		for (const controller of this.active.values()) controller.abort();
		for (const job of this.queue) {
			this.pending.delete(job.key);
			job.resolve();
		}
		this.queue = [];
	}
	clear() {
		this.cancel();
		this.contexts.clear();
		this.seedPage = null;
		this.retained = null;
		this.key = '';
		this.account = '';
		this.visible.clear();
		this.error = '';
		this.changed();
	}
	seed(account: string, page: DeckLibraryPage, pinServerPage = true) {
		this.beforeChange();
		if (account !== this.account) this.clear();
		else this.cancel();
		this.account = account;
		if (pinServerPage) {
			this.seedPage = page;
			this.retained = null;
		}
		this.key = this.contextKey(account, page);
		for (const [key, context] of this.contexts)
			if (context.page.revision !== page.revision) this.contexts.delete(key);
		let context = this.contexts.get(this.key);
		if (!context) {
			context = {
				page: { ...page, items: [] },
				pages: new Map(),
				span: initialLoadedSpan(page.offset, page.items.length, page.matchingTotal),
				used: ++this.clock
			};
			this.contexts.set(this.key, context);
		}
		context.page = { ...page, items: [] };
		context.pages.set(page.offset, page);
		context.used = ++this.clock;
		// Navigation addresses a segment even when this query has an older cached visited span.
		context.span = initialLoadedSpan(page.offset, page.items.length, page.matchingTotal);
		this.visible = new Set([page.offset]);
		this.error = '';
		this.failed = null;
		this.evict();
		this.changed();
		this.pump();
	}
	private pages() {
		const pages = new Set(
			[...this.contexts.values()].flatMap((context) => [...context.pages.values()])
		);
		if (this.seedPage) pages.add(this.seedPage);
		return pages;
	}
	private records() {
		const pages = [...this.pages()];
		return (
			pages.reduce((n, page) => n + page.items.length, 0) +
			(this.retained && !pages.some((page) => page.items.includes(this.retained!)) ? 1 : 0)
		);
	}
	retain(item: DeckLibraryItem | null) {
		this.retained = item;
		this.evict();
	}
	private evict() {
		while (this.contexts.size > 4) {
			const victim = [...this.contexts]
				.filter(([key]) => key !== this.key)
				.sort((a, b) => a[1].used - b[1].used)[0];
			if (!victim) break;
			this.contexts.delete(victim[0]);
		}
		const records = () => this.records();
		while (this.pages().size > 20 || records() > 1000) {
			const victims = [...this.contexts]
				.flatMap(([key, context]) =>
					[...context.pages]
						.filter(
							([offset, page]) =>
								page !== this.seedPage && (key !== this.key || !this.visible.has(offset))
						)
						.map(([offset, page]) => ({ key, context, offset, page }))
				)
				.sort(
					(a, b) =>
						a.context.used - b.context.used ||
						Math.abs(b.offset - (this.current?.offset ?? 0)) -
							Math.abs(a.offset - (this.current?.offset ?? 0))
				);
			let victim = victims[0];
			if (!victim) {
				// A very tall viewport cannot pin more records than the hard budget.
				const context = this.contexts.get(this.key);
				const entry = [...(context?.pages ?? [])].find(([, page]) => page !== this.seedPage);
				if (!context || !entry) break;
				victim = { key: this.key, context, offset: entry[0], page: entry[1] };
			}
			victim.context.pages.delete(victim.offset);
		}
	}
	at(index: number) {
		const context = this.contexts.get(this.key);
		if (!context) return undefined;
		const offset = Math.floor(index / context.page.limit) * context.page.limit;
		return context.pages.get(offset)?.items[index - offset];
	}
	loaded() {
		return [...(this.contexts.get(this.key)?.pages ?? [])].flatMap(([offset, page]) =>
			page.items.map((item, index) => ({ index: offset + index, item }))
		);
	}
	setVisible(start: number, end: number, anchor = start) {
		const page = this.current;
		if (!page) return;
		const first = Math.floor(start / page.limit) * page.limit;
		this.visible = new Set(
			Array.from(
				{ length: Math.min(4, Math.max(1, Math.ceil((end - first) / page.limit))) },
				(_, i) => first + i * page.limit
			)
		);
		this.current!.offset = Math.floor(anchor / page.limit) * page.limit;
		this.evict();
		for (const offset of this.visible)
			if (offset >= this.span.start && offset < this.span.end) void this.request(offset, false);
	}
	request(offset: number, explicit = true): Promise<void> {
		return this.enqueue(offset, explicit, false, () => true);
	}
	retry() {
		return this.failed
			? this.enqueue(this.failed.offset, this.failed.explicit, this.failed.refresh, () => true)
			: Promise.resolve();
	}
	loadEarlier() {
		const page = this.current;
		if (page && this.span.start > 0) return this.request(Math.max(0, this.span.start - page.limit));
		return Promise.resolve();
	}
	loadLater() {
		const page = this.current;
		if (page && this.span.end < page.matchingTotal) return this.request(this.span.end);
		return Promise.resolve();
	}
	refresh(current: () => boolean = () => true) {
		return this.enqueue(this.current?.offset ?? 0, true, true, current);
	}
	private enqueue(offset: number, explicit: boolean, refresh: boolean, current: () => boolean) {
		const context = this.contexts.get(this.key);
		if (!context || offset < 0 || offset > 1_000_000 || !current()) return Promise.resolve();
		const cached = context.pages.get(offset);
		if (cached && !refresh) {
			if (explicit) {
				this.beforeChange();
				context.span = admitLoadedSpan(
					context.span,
					offset,
					cached.items.length,
					context.page.matchingTotal
				);
				this.changed();
			}
			return Promise.resolve();
		}
		const key = JSON.stringify([this.generation, this.key, offset, refresh]);
		const pending = this.pending.get(key);
		if (pending) {
			pending.explicit ||= explicit;
			return pending.promise;
		}
		let resolve!: () => void;
		const promise = new Promise<void>((done) => (resolve = done));
		const job = {
			key,
			context: this.key,
			generation: this.generation,
			offset,
			explicit,
			refresh,
			current,
			resolve,
			promise
		};
		this.pending.set(key, job);
		this.queue.push(job);
		this.pump();
		return promise;
	}
	async read<T>(
		operation: (signal: AbortSignal) => Promise<T>,
		signal: AbortSignal,
		current: () => boolean = () => true
	): Promise<T | null> {
		const generation = this.generation;
		while (this.active.size >= 3) {
			if (signal.aborted || generation !== this.generation || !current()) return null;
			let wake!: () => void;
			const settled = new Promise<void>((done) => (wake = done));
			this.waiters.add(wake);
			signal.addEventListener('abort', wake, { once: true });
			await settled;
			this.waiters.delete(wake);
			signal.removeEventListener('abort', wake);
		}
		if (signal.aborted || generation !== this.generation || !current()) return null;
		const key = `external:${++this.clock}`,
			controller = new AbortController();
		const abort = () => controller.abort();
		signal.addEventListener('abort', abort, { once: true });
		this.active.set(key, controller);
		this.changed();
		try {
			const result = await operation(controller.signal);
			return !controller.signal.aborted && generation === this.generation && current()
				? result
				: null;
		} finally {
			signal.removeEventListener('abort', abort);
			this.active.delete(key);
			for (const wake of this.waiters) wake();
			this.changed();
			this.pump();
		}
	}
	private pump() {
		while (this.active.size < 3 && this.queue.length) {
			const job = this.queue.shift()!;
			const context = this.contexts.get(job.context);
			if (!context || job.generation !== this.generation || !job.current()) {
				this.pending.delete(job.key);
				job.resolve();
				continue;
			}
			const controller = new AbortController();
			this.active.set(job.key, controller);
			this.changed();
			void this.perform(job, context, controller).finally(() => {
				this.active.delete(job.key);
				for (const wake of this.waiters) wake();
				this.pending.delete(job.key);
				job.resolve();
				this.changed();
				this.pump();
			});
		}
	}
	private async perform(job: Job, context: Context, controller: AbortController) {
		try {
			const result = await this.transport(
				context.page.query,
				job.offset,
				context.page.limit,
				job.refresh ? undefined : context.page.revision,
				controller.signal
			);
			if (
				controller.signal.aborted ||
				job.generation !== this.generation ||
				job.context !== this.key ||
				!job.current()
			)
				return;
			if ('kind' in result) {
				if (result.kind === 'RevisionChanged') {
					this.beforeChange();
					void this.refresh(job.current);
				}
				return;
			}
			if (
				result.queryKey !== context.page.queryKey ||
				result.offset !== job.offset ||
				result.limit !== context.page.limit ||
				result.items.length > result.limit
			)
				throw new Error('Invalid Deck Library range');
			if (job.refresh && result.offset > 0 && result.offset >= result.matchingTotal) {
				void this.enqueue(
					Math.max(0, Math.ceil(result.matchingTotal / result.limit) - 1) * result.limit,
					true,
					true,
					job.current
				);
				return;
			}
			this.beforeChange();
			if (job.refresh) {
				const account = this.account;
				// Invalidate older physical responses without relinquishing their occupied slots.
				this.seed(account, result, false);
				return;
			}
			if (result.revision !== context.page.revision) return;
			context.pages.set(result.offset, result);
			context.used = ++this.clock;
			if (job.explicit)
				context.span = admitLoadedSpan(
					context.span,
					result.offset,
					result.items.length,
					result.matchingTotal
				);
			this.error = '';
			this.evict();
			this.changed();
		} catch (cause) {
			if (!controller.signal.aborted && job.generation === this.generation && job.current()) {
				this.failed = { offset: job.offset, explicit: job.explicit, refresh: job.refresh };
				this.error = cause instanceof Error ? cause.message : 'Deck Library could not be loaded.';
				this.changed();
			}
		}
	}
	metrics() {
		return {
			contexts: this.contexts.size,
			pages: this.pages().size,
			records: this.records(),
			requests: this.active.size,
			queued: this.queue.length
		};
	}
}
export function deckLibraryParams(
	query: DeckLibraryQuery,
	offset: number,
	limit = 200,
	revision?: string
) {
	const params = new URLSearchParams({
		dirQ: query.query,
		dirFormat: query.format,
		dirSort: query.sort,
		offset: String(offset),
		limit: String(limit)
	});
	for (const id of query.categoryVersionIds) params.append('dirCategory', id);
	if (revision !== undefined) params.set('revision', revision);
	return params;
}

export function deckLibraryGeometry(
	span: LoadedSpan,
	columns: number,
	estimatedHeight: number,
	heights: ReadonlyMap<string, number>,
	at: (index: number) => { id: string } | undefined,
	gap = 24
) {
	const base = Math.floor(span.start / columns),
		end = Math.ceil(span.end / columns),
		offsets = [0];
	for (let row = base; row < end; row++) {
		let height = 0;
		for (
			let index = Math.max(span.start, row * columns);
			index < Math.min(span.end, (row + 1) * columns);
			index++
		) {
			const item = at(index);
			if (item) height = Math.max(height, heights.get(item.id) ?? estimatedHeight);
		}
		offsets.push(offsets.at(-1)! + (height || estimatedHeight) + gap);
	}
	const rowAt = (top: number) => {
		let low = 0,
			high = Math.max(0, offsets.length - 2);
		while (low < high) {
			const middle = Math.ceil((low + high) / 2);
			if (offsets[middle] <= top) low = middle;
			else high = middle - 1;
		}
		return low;
	};
	return { base, offsets, total: Math.max(0, offsets.at(-1)! - gap), rowAt };
}
export function deckLibraryMountedRows(
	base: number,
	offsets: readonly number[],
	visibleTop: number,
	viewportHeight: number,
	columns: number,
	rowAt: (top: number) => number,
	focusedIndex?: number
) {
	const first = Math.max(0, rowAt(Math.max(0, visibleTop)) - 2);
	const last = Math.min(offsets.length - 2, rowAt(Math.max(0, visibleTop + viewportHeight)) + 2);
	const capacity = Math.max(1, Math.floor(200 / columns));
	const focused =
		focusedIndex === undefined ? undefined : Math.floor(focusedIndex / columns) - base;
	const reserve = focused !== undefined && (focused < first || focused > last) ? 1 : 0;
	const rows = Array.from(
		{ length: Math.max(0, Math.min(last - first + 1, capacity - reserve)) },
		(_, i) => first + i
	);
	if (
		focused !== undefined &&
		focused >= 0 &&
		focused < offsets.length - 1 &&
		!rows.includes(focused)
	) {
		if (rows.length >= capacity) rows.pop();
		rows.push(focused);
		rows.sort((a, b) => a - b);
	}
	return rows;
}
