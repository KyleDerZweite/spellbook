import { describe, expect, it } from 'vitest';
import { WorkspaceSavedState } from '#lib/saved-state/workspace.ts';

it('discards a read invalidated while pending and coalesces one current follow-up', async () => {
	let resolve!: () => void;
	let reads = 0;
	const applied: number[] = [];
	const listeners = new Map<string, (event: { data: string }) => void>();
	const workspace = new WorkspaceSavedState({
		source: () => ({
			readyState: 1,
			close() {},
			addEventListener(name, listener) {
				listeners.set(name, listener);
			},
			onerror: null
		}),
		session: async () => 200,
		visible: () => true,
		listen: () => () => {},
		changed: () => {}
	});
	workspace.start({ accountId: 'a', activation: 'one' });
	workspace.subscribe({
		topics: ['inventory'],
		clear() {},
		refresh: async (lease) => {
			const number = ++reads;
			if (number === 1) await new Promise<void>((r) => (resolve = r));
			if (lease.current()) applied.push(number);
		}
	});
	listeners.get('reset')!({ data: '{}' });
	await Promise.resolve();
	for (let i = 0; i < 10; i++) listeners.get('invalidate')!({ data: '{"topics":["inventory"]}' });
	expect(reads).toBe(1);
	resolve();
	await new Promise((r) => setTimeout(r, 0));
	expect(applied).toEqual([2]);
	expect(reads).toBe(2);
	workspace.stop();
});

it('keeps expiry terminal for old same-account activation and rejects late write handles', async () => {
	const sources: Array<Map<string, (event: { data: string }) => void>> = [];
	let clears = 0,
		reads = 0;
	const workspace = new WorkspaceSavedState({
		source: () => {
			const listeners = new Map<string, (event: { data: string }) => void>();
			sources.push(listeners);
			return {
				readyState: 1,
				close() {},
				addEventListener(name, listener) {
					listeners.set(name, listener);
				},
				onerror: null
			};
		},
		session: async () => 200,
		visible: () => true,
		listen: () => () => {},
		changed() {}
	});
	workspace.start({ accountId: 'a', activation: 'old' });
	const resource = workspace.subscribe({
		topics: ['inventory'],
		clear() {
			clears++;
		},
		refresh: async () => {
			reads++;
		}
	});
	const first = resource.beginWrite(),
		second = resource.beginWrite();
	sources[0].get('reset')!({ data: '{}' });
	await Promise.resolve();
	expect(reads).toBe(0);
	first.complete();
	first.complete();
	await Promise.resolve();
	expect(reads).toBe(0);
	sources[0].get('auth-expired')!({ data: '{}' });
	expect(workspace.getState()).toBe('expired');
	expect(clears).toBe(1);
	workspace.start({ accountId: 'a', activation: 'old' });
	expect(sources).toHaveLength(1);
	workspace.start({ accountId: 'a', activation: 'new' });
	const newWrite = resource.beginWrite();
	sources[1].get('reset')!({ data: '{}' });
	second.complete();
	await Promise.resolve();
	expect(reads).toBe(0);
	newWrite.complete();
	await new Promise((r) => setTimeout(r, 0));
	expect(reads).toBe(1);
	workspace.stop();
});

it('keeps hidden signals bounded, resumes current reads, and distinguishes recovery from successful reads', async () => {
	const listeners = new Map<string, (event: { data: string }) => void>();
	let visible = true,
		resume = () => {},
		reads = 0;
	const workspace = new WorkspaceSavedState({
		source: () => ({
			readyState: 1,
			close() {},
			addEventListener(name, listener) {
				listeners.set(name, listener);
			},
			onerror: null
		}),
		session: async () => 200,
		visible: () => visible,
		listen: (listener) => {
			resume = listener;
			return () => {};
		},
		changed() {}
	});
	workspace.start({ accountId: 'a', activation: 'one' });
	const resource = workspace.subscribe({
		topics: ['inventory'],
		clear() {},
		refresh: async () => {
			reads++;
		}
	});
	listeners.get('reset')!({ data: '{}' });
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(reads).toBe(1);
	expect(resource.getState().stale).toBe(false);
	visible = false;
	for (let i = 0; i < 100; i++) listeners.get('invalidate')!({ data: '{"topics":["inventory"]}' });
	expect(reads).toBe(1);
	expect(resource.getState().stale).toBe(true);
	visible = true;
	resume();
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(reads).toBe(2);
	listeners.get('recovering')!({ data: '{}' });
	resource.invalidate();
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(workspace.getState()).toBe('recovering');
	expect(resource.getState().stale).toBe(true);
	listeners.get('reset')!({ data: '{}' });
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(workspace.getState()).toBe('live');
	expect(resource.getState().stale).toBe(false);
	workspace.stop();
});

it('coalesces session probes, retains infrastructure failures, and ignores stale 401 after account switch', async () => {
	const sources: Array<{
		readyState: number;
		close(): void;
		addEventListener(name: string, listener: (event: { data: string }) => void): void;
		onerror: (() => void) | null;
	}> = [];
	const probes: Array<(status: number) => void> = [];
	const workspace = new WorkspaceSavedState({
		source: () => {
			const source = {
				readyState: 1,
				close() {},
				addEventListener() {},
				onerror: null as (() => void) | null
			};
			sources.push(source);
			return source;
		},
		session: () => new Promise((resolve) => probes.push(resolve)),
		visible: () => true,
		listen: () => () => {},
		changed() {}
	});
	workspace.start({ accountId: 'a', activation: 'one' });
	for (let i = 0; i < 100; i++) sources[0].onerror!();
	expect(probes).toHaveLength(1);
	probes[0](503);
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(probes).toHaveLength(2);
	expect(workspace.getState()).toBe('offline');
	workspace.start({ accountId: 'b', activation: 'two' });
	probes[1](401);
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(workspace.isActive('b')).toBe(true);
	sources[1].onerror!();
	probes[2](401);
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(workspace.getState()).toBe('expired');
});

it('guards deferred body publication, registration disposal and pre-write reads without abort replacements', async () => {
	const listeners = new Map<string, (event: { data: string }) => void>();
	const pending: Array<{ finish(): void; signal: AbortSignal; current(): boolean }> = [];
	const applied: number[] = [];
	const workspace = new WorkspaceSavedState({
		source: () => ({
			readyState: 1,
			close() {},
			addEventListener(name, listener) {
				listeners.set(name, listener);
			},
			onerror: null
		}),
		session: async () => 200,
		visible: () => true,
		listen: () => () => {},
		changed() {}
	});
	workspace.start({ accountId: 'a', activation: 'one' });
	const resource = workspace.subscribe({
		topics: ['decks'],
		clear() {},
		refresh: (lease) =>
			new Promise<void>((resolve) => {
				const index = pending.length;
				pending.push({
					signal: lease.signal,
					current: lease.current,
					finish() {
						if (lease.current()) applied.push(index);
						resolve();
					}
				});
			})
	});
	listeners.get('reset')!({ data: '{}' });
	expect(pending).toHaveLength(1);
	const write = resource.beginWrite();
	expect(pending[0].signal.aborted).toBe(false);
	expect(pending[0].current()).toBe(false);
	pending[0].finish();
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(pending).toHaveLength(1);
	write.complete();
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(pending).toHaveLength(2);
	resource.dispose();
	expect(pending[1].signal.aborted).toBe(true);
	pending[1].finish();
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(applied).toEqual([]);
	workspace.stop();
});

it('retains a freshly hydrated selected Scan context when its subscription mounts before layout activation', async () => {
	const listeners = new Map<string, (event: { data: string }) => void>();
	const workspace = new WorkspaceSavedState({
		source: () => ({
			readyState: 1,
			close() {},
			addEventListener(name, listener) {
				listeners.set(name, listener);
			},
			onerror: null
		}),
		session: async () => 200,
		visible: () => true,
		listen: () => () => {},
		changed() {}
	});
	let selectedSession: string | null = 'fresh-owned-session';
	let recentSessions = ['fresh-owned-session'];
	const readTargets: Array<string | null> = [];
	const subscription = workspace.subscribe({
		topics: ['scan'],
		clear() {
			selectedSession = null;
			recentSessions = [];
		},
		async refresh(lease) {
			const id = selectedSession;
			readTargets.push(id);
			await Promise.resolve();
			if (lease.current()) recentSessions = ['fresh-owned-session'];
		}
	});
	subscription.invalidate();
	workspace.start({ accountId: 'account', activation: 'initial' });
	listeners.get('reset')!({ data: '{}' });
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(selectedSession).toBe('fresh-owned-session');
	expect(readTargets).toEqual(['fresh-owned-session']);
	expect(recentSessions).toEqual(['fresh-owned-session']);
	workspace.expire();
	expect(selectedSession).toBeNull();
	workspace.start({ accountId: 'account', activation: 'initial' });
	expect(workspace.getState()).toBe('expired');
	expect(selectedSession).toBeNull();
});

it.each(['profile', 'inventory', 'decks', 'scan'] as const)(
	'preserves a fresh pre-start %s subscriber through reset, but clears it on account replacement',
	async (topic) => {
		const sources: Array<Map<string, (event: { data: string }) => void>> = [];
		const workspace = new WorkspaceSavedState({
			source: () => {
				const listeners = new Map<string, (event: { data: string }) => void>();
				sources.push(listeners);
				return {
					readyState: 1,
					close() {},
					addEventListener(name, listener) {
						listeners.set(name, listener);
					},
					onerror: null
				};
			},
			session: async () => 200,
			visible: () => true,
			listen: () => () => {},
			changed() {}
		});
		let saved: string | null = 'fresh owned data',
			clears = 0;
		let release!: () => void;
		const contexts: Array<string | null> = [];
		const resource = workspace.subscribe({
			topics: [topic],
			clear() {
				saved = null;
				clears++;
			},
			async refresh(lease) {
				contexts.push(saved);
				await new Promise<void>((resolve) => {
					release = resolve;
				});
				if (lease.current()) saved = 'late first-account data';
			}
		});
		const prematureWrite = resource.beginWrite();
		workspace.start({ accountId: 'first', activation: 'initial' });
		expect(prematureWrite.current()).toBe(false);
		sources[0].get('reset')!({ data: '{}' });
		expect(contexts).toEqual(['fresh owned data']);
		expect(clears).toBe(0);
		workspace.start({ accountId: 'second', activation: 'next' });
		expect(clears).toBe(1);
		expect(saved).toBeNull();
		prematureWrite.complete();
		release();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(saved).toBeNull();
		workspace.stop();
	}
);

// Drive the real workspace scheduler, including a physical read held across bursts.
function causeWorkspace() {
	const listeners = new Map<string, (event: { data: string }) => void>();
	const source = {
		readyState: 1,
		close() {},
		addEventListener(name: string, listener: (event: { data: string }) => void) {
			listeners.set(name, listener);
		},
		onerror: null as (() => void) | null
	};
	let visible = true,
		resume = () => {};
	const workspace = new WorkspaceSavedState({
		source: () => source,
		session: async () => 200,
		visible: () => visible,
		listen: (listener) => {
			resume = listener;
			return () => {};
		},
		changed() {}
	});
	workspace.start({ accountId: 'owner', activation: 'initial' });
	const reads: Array<{
		lease: import('#lib/saved-state/workspace.ts').ReadLease;
		finish(value?: false): void;
		fail(): void;
	}> = [];
	const resource = workspace.subscribe({
		topics: ['decks', 'inventory', 'values'],
		clear() {},
		refresh: (lease) =>
			new Promise<void | false>((resolve, reject) => {
				reads.push({ lease, finish: resolve, fail: () => reject(Error('read failed')) });
			})
	});
	const emit = (topics: string[]) =>
		listeners.get('invalidate')!({ data: JSON.stringify({ topics }) });
	const reset = () => listeners.get('reset')!({ data: '{}' });
	return {
		workspace,
		resource,
		reads,
		emit,
		reset,
		source,
		hide: () => {
			visible = false;
		},
		resume: () => {
			visible = true;
			resume();
		},
		recover: () => listeners.get('recovering')!({ data: '{}' })
	};
}
const settled = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
async function liveCauseWorkspace() {
	const h = causeWorkspace();
	h.reset();
	h.reads[0].finish();
	await settled();
	return h;
}
describe('bounded saved-state causes and publication acknowledgement', () => {
	it('clears a successful full cause independently of stale transport status', async () => {
		const h = await liveCauseWorkspace();
		h.emit(['inventory']);
		expect(h.reads[1].lease.cause).toEqual(['inventory']);
		h.reads[1].finish();
		await settled();
		expect(h.resource.getState().stale).toBe(false);
		h.recover();
		h.resource.invalidate(['values']);
		expect(h.reads).toHaveLength(2);
		h.reset();
		expect(h.reads[2].lease.cause).toBe('full');
		h.reads[2].finish();
		await settled();
		h.emit(['decks']);
		expect(h.reads[3].lease.cause).toEqual(['decks']);
		h.workspace.stop();
	});
	it('does not turn later topic reads into full while a successful connecting read remains stale', async () => {
		const h = causeWorkspace();
		h.emit(['inventory']);
		expect(h.reads[0].lease.cause).toBe('full');
		h.reads[0].finish();
		await settled();
		expect(h.workspace.getState()).toBe('connecting');
		expect(h.resource.getState().stale).toBe(true);
		h.emit(['values']);
		expect(h.reads[1].lease.cause).toEqual(['values']);
		h.reads[1].finish();
		await settled();
		expect(h.workspace.getState()).toBe('connecting');
		h.workspace.stop();
	});
	it('full dominates a later narrow event until current accepted publication', async () => {
		const h = causeWorkspace();
		h.reset();
		h.emit(['values']);
		expect(h.reads[0].lease.current()).toBe(false);
		h.reads[0].finish();
		await settled();
		expect(h.reads).toHaveLength(2);
		expect(h.reads[1].lease.cause).toBe('full');
		h.reads[1].finish();
		await settled();
		h.emit(['values']);
		expect(h.reads[2].lease.cause).toEqual(['values']);
		h.workspace.stop();
	});
	it('unions all in-flight topics into one coalesced follow-up and bounds unrelated topics', async () => {
		const h = await liveCauseWorkspace();
		h.emit(['values']);
		for (let i = 0; i < 100; i++) h.emit(['inventory', 'decks', 'profile']);
		expect(h.reads).toHaveLength(2);
		expect(h.reads[1].lease.current()).toBe(false);
		h.reads[1].finish(false);
		await settled();
		expect(h.reads).toHaveLength(3);
		expect(h.reads[2].lease.cause).toEqual(['values', 'inventory', 'decks']);
		h.reads[2].finish();
		await settled();
		expect(h.reads).toHaveLength(3);
		h.workspace.stop();
	});
	it('false retains stale causes without an error or self retry and preserves queued work', async () => {
		const h = await liveCauseWorkspace();
		h.emit(['values']);
		h.reads[1].finish(false);
		await settled();
		expect(h.reads).toHaveLength(2);
		expect(h.resource.getState()).toEqual({ stale: true, refreshing: false, error: '' });
		h.resource.invalidate(['inventory']);
		expect(h.reads[2].lease.cause).toEqual(['values', 'inventory']);
		h.emit(['decks']);
		h.reads[2].finish(false);
		await settled();
		expect(h.reads).toHaveLength(4);
		expect(h.reads[3].lease.cause).toEqual(['values', 'inventory', 'decks']);
		h.workspace.stop();
	});
	it('failure keeps causes without a loop, explicit retry requests full and void still succeeds', async () => {
		const h = await liveCauseWorkspace();
		h.emit(['inventory']);
		h.reads[1].fail();
		await settled();
		expect(h.resource.getState().error).toBe('read failed');
		expect(h.reads).toHaveLength(2);
		h.emit(['values']);
		expect(h.reads[2].lease.cause).toEqual(['inventory', 'values']);
		h.reads[2].fail();
		await settled();
		h.resource.invalidate();
		expect(h.reads[3].lease.cause).toBe('full');
		h.reads[3].finish();
		await settled();
		expect(h.resource.getState()).toEqual({ stale: false, refreshing: false, error: '' });
		h.workspace.stop();
	});
	it('counted topic writes retain foreign events and complete without SSE exactly once', async () => {
		const h = await liveCauseWorkspace();
		const deck = h.resource.beginWrite(['decks']);
		const category = h.resource.beginWrite(['decks']);
		const inventory = h.workspace.beginWrite(['inventory']);
		h.emit(['values']);
		deck.complete();
		deck.complete();
		category.complete();
		expect(h.reads).toHaveLength(1);
		inventory.complete();
		inventory.complete();
		expect(h.reads).toHaveLength(2);
		expect(h.reads[1].lease.cause).toEqual(['values', 'decks', 'inventory']);
		h.reads[1].finish();
		await settled();
		const legacy = h.resource.beginWrite();
		legacy.complete();
		expect(h.reads[2].lease.cause).toBe('full');
		h.workspace.stop();
	});
	it('all writes fence the whole resource and old/disposed handles cannot release replacements', async () => {
		const h = await liveCauseWorkspace();
		h.emit(['values']);
		const write = h.resource.beginWrite(['decks']);
		expect(h.reads[1].lease.current()).toBe(false);
		h.reads[1].finish();
		await settled();
		h.resource.dispose();
		let reads = 0;
		const replacement = h.workspace.subscribe({
			topics: ['decks'],
			clear() {},
			refresh: async () => {
				reads++;
			}
		});
		const currentWrite = replacement.beginWrite(['decks']);
		write.complete();
		await settled();
		expect(reads).toBe(1);
		currentWrite.complete();
		await settled();
		expect(reads).toBe(2);
		h.workspace.stop();
	});
	it('hidden and offline bursts stay bounded and reset/resume/recovery remain full', async () => {
		const h = await liveCauseWorkspace();
		h.hide();
		for (let i = 0; i < 100; i++) h.emit(['values', 'inventory']);
		expect(h.reads).toHaveLength(1);
		h.resume();
		expect(h.reads[1].lease.cause).toBe('full');
		h.source.onerror!();
		h.reads[1].finish();
		await settled();
		for (let i = 0; i < 100; i++) h.emit(['decks']);
		expect(h.reads).toHaveLength(2);
		expect(h.workspace.getState()).toBe('offline');
		h.reset();
		expect(h.reads[2].lease.cause).toBe('full');
		h.reads[2].finish();
		await settled();
		expect(h.workspace.getState()).toBe('live');
		h.workspace.stop();
	});
});
