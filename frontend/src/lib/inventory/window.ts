import type {
	InventoryEntry,
	InventoryPage,
	InventoryQuery,
	RevisionChanged
} from '@spellbook/contracts/inventory.ts';
export type InventoryTransport = (
	query: InventoryQuery,
	revision: string | undefined,
	signal: AbortSignal
) => Promise<InventoryPage | RevisionChanged>;
interface Context {
	page: InventoryPage;
	pages: Map<number, InventoryPage>;
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
	private generation = 0;
	private active = new Map<
		string,
		{ controller: AbortController; offset: number; planned: boolean }
	>();
	private queue: Job[] = [];
	private replacing = false;
	private listeners = new Map<string, Promise<void>>();
	error = '';
	constructor(
		private transport: InventoryTransport,
		private changed: () => void,
		private beforeRevisionReset: () => void = () => {}
	) {}
	get current() {
		return this.contexts.get(this.key)?.page;
	}
	seed(account: string, page: InventoryPage) {
		if (account !== this.account) {
			this.clear();
			this.account = account;
		}
		this.cancel();
		this.generation++;
		this.key = page.queryKey;
		this.error = '';
		this.replacing = false;
		const metadata = { ...page, entries: [], memberships: [] };
		let context = this.contexts.get(this.key);
		if (!context || context.page.revision !== page.revision)
			context = { page: metadata, pages: new Map(), used: ++this.clock };
		context.page = metadata;
		context.pages.set(page.query.offset, page);
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
	async open(account: string, query: InventoryQuery, signal: AbortSignal) {
		const pending = [...this.listeners.values()];
		this.cancel();
		const generation = ++this.generation;
		this.replacing = true;
		// Aborted transports release their slots before the new query starts.
		await Promise.all(pending);
		if (signal.aborted || generation !== this.generation) {
			if (generation === this.generation) {
				this.replacing = false;
				this.changed();
				this.pump();
			}
			return;
		}
		const controller = new AbortController(),
			key = `query:${generation}`;
		const abort = () => controller.abort();
		signal.addEventListener('abort', abort, { once: true });
		let complete!: () => void;
		this.listeners.set(
			key,
			new Promise<void>((resolve) => {
				complete = resolve;
			})
		);
		this.active.set(key, { controller, offset: 0, planned: false });
		this.changed();
		try {
			const page = await this.transport(
				{ ...query, offset: 0, limit: 50 },
				undefined,
				controller.signal
			);
			if (page.kind === 'Page' && !controller.signal.aborted && generation === this.generation)
				this.seed(account, page);
		} finally {
			signal.removeEventListener('abort', abort);
			this.active.delete(key);
			this.listeners.delete(key);
			complete();
			if (generation === this.generation) this.replacing = false;
			this.changed();
			this.pump();
		}
	}

	clear() {
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
		for (const active of this.active.values()) active.controller.abort();
		for (const job of this.queue) job.resolve();
		this.queue = [];
		this.listeners.clear();
	}
	private evict() {
		while ([...this.contexts.values()].reduce((n, c) => n + c.pages.size, 0) > 20) {
			const contexts = [...this.contexts.values()].sort((a, b) => a.used - b.used);
			const candidate =
				contexts.find((c) => c !== this.contexts.get(this.key) && c.pages.size) ||
				contexts.find((c) => c.pages.size > 1);
			if (!candidate) break;
			candidate.pages.delete(candidate.pages.keys().next().value!);
		}
	}
	request(offset: number, planned = false): Promise<void> {
		const context = this.contexts.get(this.key);
		if (this.replacing || !context) return Promise.resolve();
		offset = Math.floor(offset / 50) * 50;
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
		while (this.active.size < 3 && this.queue.length) {
			const job = this.queue.shift()!;
			void this.execute(job);
		}
	}
	private async execute(job: Job) {
		const generation = this.generation,
			key = this.key,
			context = this.contexts.get(key)!;
		const controller = new AbortController();
		this.active.set(job.key, { controller, offset: job.offset, planned: job.planned });
		this.changed();
		try {
			const result = await this.transport(
				{ ...context.page.query, offset: job.offset, limit: 50 },
				context.page.revision,
				controller.signal
			);
			if (controller.signal.aborted || generation !== this.generation) return;
			if (result.kind === 'RevisionChanged') {
				this.beforeRevisionReset();
				const first = await this.transport(
					{ ...context.page.query, offset: 0, limit: 50 },
					undefined,
					controller.signal
				);
				if (first.kind === 'Page' && !controller.signal.aborted && generation === this.generation)
					this.seed(this.account, first);
			} else if (result.queryKey === key && result.revision === context.page.revision) {
				context.pages.set(job.offset, result);
				context.used = ++this.clock;
				this.evict();
				this.error = '';
				this.changed();
			}
		} catch (cause) {
			if (!controller.signal.aborted && generation === this.generation) {
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
		const first = Math.max(0, Math.floor(start / 50) - 1),
			last = Math.min(Math.ceil(total / 50) - 1, Math.floor(end / 50) + 1, first + 11);
		const wanted = new Set(
			Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => (first + i) * 50)
		);
		this.queue = this.queue.filter((job) => {
			if (!job.planned || wanted.has(job.offset)) return true;
			this.listeners.delete(job.key);
			job.resolve();
			return false;
		});
		for (const active of this.active.values())
			if (active.planned && !wanted.has(active.offset)) active.controller.abort();
		for (let index = first; index <= last; index++) void this.request(index * 50, true);
	}
	at(index: number): InventoryEntry | undefined {
		const page = this.contexts.get(this.key)?.pages.get(Math.floor(index / 50) * 50);
		return page?.entries[index % 50];
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
			pages: [...this.contexts.values()].reduce((n, c) => n + c.pages.size, 0),
			entries: [...this.contexts.values()].reduce(
				(n, c) => n + [...c.pages.values()].reduce((m, p) => m + p.entries.length, 0),
				0
			),
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
