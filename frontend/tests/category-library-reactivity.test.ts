import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compileModule } from 'svelte/compiler';
import { CategoryEditorLifetime } from '../src/lib/categories/editor-lifetime.ts';

// Execute the production adoption effect and clear callback with Svelte's client scheduler.
// Root owns the separate rendered-browser acceptance.
const source = await readFile(
	new URL('../src/routes/mtg/categories/+page.svelte', import.meta.url),
	'utf8'
);
const adoption = source.slice(
	source.indexOf('\t$effect(() => {\n\t\tlistLifetime'),
	source.indexOf('\n\tconst submit:')
);
const clear = source.slice(
	source.indexOf('\t\t\tclear: () => {') + '\t\t\tclear: () => {'.length,
	source.indexOf('\n\t\t\t},\n\t\t\trefresh:')
);
assert.ok(adoption.startsWith('\t$effect('));
assert.ok(clear.includes('cleared = true'));
const harness = `
export function mount(initial, Lifetime) {
 let data = $state.raw(initial), draft = $state(initial.draft), choices = $state(initial.choices), library = $state(initial.library);
 let cleared = $state(false), dirty = $state(false), busy = $state(false), libraryReadError = $state('');
 let message = $state(''), confirmation = $state(null), uncertain = $state(null);
 let active = $state(initial.user.accountId), version = $state(0);
 let editorKey = initial.user.accountId + ':' + initial.scope + ':' + (initial.draft.originId ?? '');
 const currentKey = () => data.user.accountId + ':' + data.scope + ':' + (data.draft.originId ?? '');
 const currentListKey = () => data.user.accountId + ':' + data.scope + ':' + data.library.offset + ':' + data.library.limit;
 const lifetime = new Lifetime(editorKey), listLifetime = new Lifetime(currentListKey());
 const workspaceSavedState = {getState: () => {version; return active ? 'connecting' : 'expired'}, isActive: (account) => active === account};
 let runs = 0;
 const destroy = $effect.root(() => { ${adoption.replace('$effect(() => {', '$effect(() => { runs++;')} });
 return {
 flush: () => flushClient(), destroy,
 snapshot: () => ({draft: $state.snapshot(draft), library: $state.snapshot(library), dirty, cleared, runs}),
 edit: () => {draft.name = 'Unsaved'; dirty = true; lifetime.edit();},
 replace: (incoming) => {data = incoming},
 clear: () => {active = null; version++; ${clear}},
 activate: (account = data.user.accountId) => {active = account; version++;}
 };
}
`;
const output = compileModule(harness, {
	filename: 'category-library-adoption.svelte.js',
	generate: 'client',
	dev: false
}).js.code;
const client = import.meta.resolve('svelte/internal/client');
const executable =
	output.replace("from 'svelte/internal/client'", `from ${JSON.stringify(client)}`) +
	'\nconst untrack = $.untrack; const flushClient = $.flush;';
const { mount } = await import(
	'data:text/javascript;base64,' + Buffer.from(executable).toString('base64')
);
function initial() {
	return {
		user: { accountId: 'account' },
		scope: 'entry',
		draft: {
			requestId: 'fresh-request',
			originId: null,
			expectedLibraryRevision: '4',
			name: '',
			meaning: ''
		},
		choices: { tags: [], cards: [] },
		library: { revision: '4', offset: 0, limit: 50, definitions: [], total: 0 }
	};
}
test('direct Library hydration settles without a self-dependent adoption loop', () => {
	const page = mount(initial(), CategoryEditorLifetime);
	try {
		page.flush();
		assert.ok(page.snapshot().runs <= 2);
		assert.equal(page.snapshot().draft.expectedLibraryRevision, '4');
		assert.equal(page.snapshot().dirty, false);
	} finally {
		page.destroy();
	}
});
test('fresh authenticated activation restores server draft after child clear while terminal state stays empty', () => {
	const page = mount(initial(), CategoryEditorLifetime);
	try {
		page.clear();
		page.flush();
		assert.equal(page.snapshot().draft.requestId, '');
		assert.equal(page.snapshot().library.revision, '0');
		page.activate();
		page.flush();
		assert.equal(page.snapshot().draft.requestId, 'fresh-request');
		assert.equal(page.snapshot().draft.expectedLibraryRevision, '4');
		assert.equal(page.snapshot().library.revision, '4');
		assert.equal(page.snapshot().dirty, false);
		page.edit();
		page.flush();
		assert.equal(page.snapshot().draft.name, 'Unsaved');
		page.replace({ ...initial(), library: { ...initial().library, revision: '5' } });
		page.flush();
		assert.equal(page.snapshot().draft.name, 'Unsaved');
		assert.equal(page.snapshot().draft.expectedLibraryRevision, '4');
		page.clear();
		page.flush();
		assert.equal(page.snapshot().draft.requestId, '');
		assert.equal(page.snapshot().library.revision, '0');
		page.replace(initial());
		page.flush();
		assert.equal(page.snapshot().draft.requestId, '');
		assert.equal(page.snapshot().library.revision, '0');
		assert.equal(page.snapshot().dirty, false);
	} finally {
		page.destroy();
	}
});

test('account activation cannot restore an old account server page', () => {
	const page = mount(initial(), CategoryEditorLifetime);
	try {
		page.clear();
		page.activate('other');
		page.flush();
		assert.equal(page.snapshot().draft.requestId, '');
		assert.equal(page.snapshot().library.revision, '0');
		const incoming = initial();
		incoming.user.accountId = 'other';
		incoming.draft.requestId = 'other-request';
		page.replace(incoming);
		page.flush();
		assert.equal(page.snapshot().draft.requestId, 'other-request');
		assert.equal(page.snapshot().dirty, false);
	} finally {
		page.destroy();
	}
});
