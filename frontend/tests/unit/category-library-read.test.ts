import {
	readCategoryLibraryPage,
	captureCategoryLibraryQuery
} from '../../src/lib/categories/library-read.ts';
import { expect, it } from 'vitest';
import { CategoryLibraryReadLifetime } from '../../src/lib/categories/library-read-lifetime.ts';
function held() {
	let release!: () => void;
	const promise = new Promise<void>((resolve) => {
		release = resolve;
	});
	return { promise, release };
}
it('a held Library refresh cannot replace another page, including after returning', async () => {
	const list = new CategoryLibraryReadLifetime('account:entry:0:50');
	const read = list.capture();
	const response = held();
	let query = 'account:entry:0:50';
	let page = { offset: 0, name: 'old page' };
	const completion = readCategoryLibraryPage(
		{ scope: 'entry', offset: 0, limit: 50 },
		async (url) => {
			expect(url).toBe('/api/v1/mtg/category-definitions?scope=entry&offset=0&limit=50');
			await response.promise;
			return new Response(JSON.stringify({ offset: 0, limit: 50, revision: '9', definitions: [] }));
		},
		() => list.current(read, query)
	).then((result) => {
		if (result) page = { offset: result.offset, name: 'delayed refresh' };
	});
	query = 'account:entry:50:50';
	list.setKey(query);
	page = { offset: 50, name: 'next page' };
	response.release();
	await completion;
	expect(page).toEqual({ offset: 50, name: 'next page' });
	query = 'account:entry:0:50';
	list.setKey(query);
	expect(list.current(read, query)).toBe(false);
});

it('shared Library lease discards a held response on write and expiry without restoring private drafts', async () => {
	const { WorkspaceSavedState } = await import('../../src/lib/saved-state/workspace.ts');
	const listeners = new Map<string, (event: { data: string }) => void>();
	let transports = 0,
		reads = 0;
	const response = held();
	let snapshot = 'initial',
		draft = 'unsaved meaning';
	const workspace = new WorkspaceSavedState({
		source: () => {
			transports++;
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
	workspace.start({ accountId: 'account', activation: 'one' });
	const resource = workspace.subscribe({
		topics: ['decks'],
		clear() {
			snapshot = '';
			draft = '';
		},
		refresh: async (lease) => {
			reads++;
			const page = await readCategoryLibraryPage(
				{ scope: 'entry', offset: 0, limit: 50, signal: lease.signal },
				async (_url, options) => {
					expect(options?.signal).toBe(lease.signal);
					await response.promise;
					return new Response(
						JSON.stringify({ offset: 0, limit: 50, revision: '9', definitions: [] })
					);
				},
				lease.current
			);
			if (page) snapshot = page.revision;
		}
	});
	listeners.get('reset')!({ data: '{}' });
	await Promise.resolve();
	const write = resource.beginWrite();
	expect(write.current()).toBe(true);
	expect(draft).toBe('unsaved meaning');
	listeners.get('auth-expired')!({ data: '{}' });
	expect(write.current()).toBe(false);
	response.release();
	write.complete();
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(snapshot).toBe('');
	expect(draft).toBe('');
	expect(reads).toBe(1);
	expect(transports).toBe(1);
	resource.dispose();
	workspace.stop();
});

it('incoming pagination before retained-page adoption captures one page for request and ownership even with a newer held response', async () => {
	let retained = { offset: 0, limit: 50, revision: '10', definitions: [], total: 100 };
	const incoming = { ...retained, offset: 50, revision: '11' };
	const list = new CategoryLibraryReadLifetime('account:entry:0:50');
	const query = captureCategoryLibraryQuery('account', 'entry', incoming);
	list.setKey(query.key);
	const capture = list.capture();
	const response = held();
	let requested = '';
	const completion = readCategoryLibraryPage(
		query,
		async (url) => {
			requested = String(url);
			const offset = Number(new URL(requested, 'http://local.test').searchParams.get('offset'));
			await response.promise;
			return new Response(JSON.stringify({ ...incoming, offset, revision: '12' }));
		},
		() => list.current(capture, captureCategoryLibraryQuery('account', 'entry', incoming).key)
	);
	// The synchronous invalidation above starts before the later UI effect adopts this page.
	expect(retained.offset).toBe(0);
	retained = incoming;
	response.release();
	const read = await completion;
	expect(requested).toBe('/api/v1/mtg/category-definitions?scope=entry&offset=50&limit=50');
	expect(query.key).toBe('account:entry:50:50');
	expect(read?.offset).toBe(50);
	expect(read?.revision).toBe('12');
	expect(retained.offset).toBe(50);
});
