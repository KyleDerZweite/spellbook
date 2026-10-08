import {
	readCategoryLibraryPage,
	captureCategoryLibraryQuery
} from '../../src/lib/categories/library-read.ts';
import { expect, it } from 'vitest';
import {
	CategoryEditorLifetime,
	categoryFormIdentity
} from '../../src/lib/categories/editor-lifetime.ts';
function held() {
	let release!: () => void;
	const promise = new Promise<void>((resolve) => {
		release = resolve;
	});
	return { promise, release };
}
function fields(name: string, meaning = 'Meaning', rule = 'type Creature') {
	const form = new FormData();
	form.set('name', name);
	form.set('meaning', meaning);
	form.set('rule', rule);
	return form;
}
it.each(['criteria success', 'save failure'])(
	'a held %s cannot replace Name, Meaning or Rules typed after submission',
	async () => {
		const life = new CategoryEditorLifetime('account:entry:origin');
		const original = fields('Submitted A');
		const submission = life.capture('save A', categoryFormIdentity(original), () => 'request A');
		const response = held();
		let draft = { name: 'Submitted A', meaning: 'Meaning', rule: 'type Creature' };
		const completion = (async () => {
			await response.promise;
			if (
				life.unchanged(
					submission,
					'account:entry:origin',
					categoryFormIdentity(fields(draft.name, draft.meaning, draft.rule))
				)
			)
				draft = { name: 'Submitted A', meaning: 'Meaning', rule: 'type Creature' };
		})();
		draft = { name: 'New B', meaning: 'New meaning', rule: 'not keyword Flying' };
		life.edit();
		response.release();
		await completion;
		expect(draft).toEqual({ name: 'New B', meaning: 'New meaning', rule: 'not keyword Flying' });
	}
);
it('confirmed A stays separate from editable B while uncertain A retains its original immutable retry ID', async () => {
	const life = new CategoryEditorLifetime('account:entry:origin');
	const original = fields('A');
	const a = life.capture(
		categoryFormIdentity(original),
		categoryFormIdentity(original),
		() => 'request A'
	);
	original.set('name', 'B');
	life.edit();
	const b = life.capture(
		categoryFormIdentity(original),
		categoryFormIdentity(original),
		() => 'request B'
	);
	expect(life.unchanged(a, 'account:entry:origin', categoryFormIdentity(original))).toBe(false);
	expect(life.capture(a.payload, a.draftIdentity, () => 'must not replace A').requestId).toBe(
		'request A'
	);
	expect(b.requestId).toBe('request B');
	const confirmed = { requestId: a.requestId, savedName: 'A' };
	life.confirmed(a);
	expect(confirmed).toEqual({ requestId: 'request A', savedName: 'A' });
	expect(original.get('name')).toBe('B');
	expect(life.capture(b.payload, b.draftIdentity, () => 'must not replace B').requestId).toBe(
		'request B'
	);
});
it.each(['account:deck:origin', 'other:entry:origin', 'account:entry:other'])(
	'route/account/editor reuse %s rejects held callbacks even after returning to the old editor',
	async (key) => {
		const life = new CategoryEditorLifetime('account:entry:origin');
		const a = life.capture('payload', 'draft', () => 'request A'),
			response = held();
		let applied = false;
		const completion = (async () => {
			await response.promise;
			if (life.current(a, 'account:entry:origin')) applied = true;
		})();
		life.setKey(key);
		life.setKey('account:entry:origin');
		response.release();
		await completion;
		expect(applied).toBe(false);
		const fresh = life.capture('payload', 'draft', () => 'fresh');
		life.destroy();
		expect(life.current(fresh, 'account:entry:origin')).toBe(false);
	}
);
it('returned original values still require the same edit lifetime and submitted field identity', () => {
	const life = new CategoryEditorLifetime('account:entry:origin');
	const a = life.capture('payload', 'draft A', () => 'request A');
	expect(life.unchanged(a, 'account:entry:origin', 'draft B')).toBe(false);
	life.edit();
	expect(life.unchanged(a, 'account:entry:origin', 'draft A')).toBe(false);
});

it('reopening the same editor rejects an older held response before navigation completes', async () => {
	const life = new CategoryEditorLifetime('account:entry:origin');
	const submitted = life.capture('A', 'A', () => 'request A'),
		response = held();
	let applied = false;
	const completion = (async () => {
		await response.promise;
		applied = life.current(submitted, 'account:entry:origin');
	})();
	life.reopen();
	response.release();
	await completion;
	expect(applied).toBe(false);
});

it('a held Library refresh cannot replace another page and leaves the distinct editor draft live', async () => {
	const editor = new CategoryEditorLifetime('account:entry:origin');
	const list = new CategoryEditorLifetime('account:entry:0:50');
	const draft = editor.capture('save draft', 'newer draft', () => 'draft request');
	const read = list.capture('Library-read', '', () => 'read request');
	const response = held();
	let query = 'account:entry:0:50';
	let page = { offset: 0, name: 'old page' };
	const completion = readCategoryLibraryPage(
		{ scope: 'entry', offset: 0, limit: 50 },
		async (url) => {
			expect(url).toBe('/api/mobile/v1/mtg/category-definitions?scope=entry&offset=0&limit=50');
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
	expect(editor.unchanged(draft, 'account:entry:origin', 'newer draft')).toBe(true);
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
	const editor = new CategoryEditorLifetime('account:entry:origin');
	const draft = editor.capture('draft', 'unsaved newer meaning', () => 'draft request');
	let retained = { offset: 0, limit: 50, revision: '10', definitions: [], total: 100 };
	const incoming = { ...retained, offset: 50, revision: '11' };
	const list = new CategoryEditorLifetime('account:entry:0:50');
	const query = captureCategoryLibraryQuery('account', 'entry', incoming);
	list.setKey(query.key);
	const capture = list.capture('Library-read', '', () => 'read request');
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
	expect(requested).toBe('/api/mobile/v1/mtg/category-definitions?scope=entry&offset=50&limit=50');
	expect(query.key).toBe('account:entry:50:50');
	expect(read?.offset).toBe(50);
	expect(read?.revision).toBe('12');
	expect(retained.offset).toBe(50);
	expect(editor.unchanged(draft, 'account:entry:origin', 'unsaved newer meaning')).toBe(true);
});
