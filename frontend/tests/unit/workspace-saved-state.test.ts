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
