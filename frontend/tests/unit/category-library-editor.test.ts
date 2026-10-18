import { afterEach, expect, it } from 'vitest';
import type {
	CategoryEditorReply,
	CategoryEditorSeed
} from '../../src/lib/categories/library-editor.svelte.ts';
import type { ActionResult } from '$app/forms';
import { readCategoryLibraryPage } from '../../src/lib/categories/library-read.ts';
import { WorkspaceSavedState } from '../../src/lib/saved-state/workspace.ts';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { compileModule } from 'svelte/compiler';

// The Node project compiles Svelte for SSR. Compile the complete production
// module for the client and share its real runtime with the external-input fixture.
const clientUrl = import.meta.resolve('svelte/internal/client');
const svelteUrl = new URL('../../index-client.js', clientUrl).href;
async function clientModule(source: string, filename: string) {
	const code = compileModule(source, { filename, generate: 'client', dev: false })
		.js.code.replaceAll("from 'svelte/internal/client'", `from ${JSON.stringify(clientUrl)}`)
		.replaceAll("from 'svelte'", `from ${JSON.stringify(svelteUrl)}`);
	return import(
		/* @vite-ignore */ 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
	);
}
const production: typeof import('../../src/lib/categories/library-editor.svelte.ts') =
	await clientModule(
		stripTypeScriptTypes(
			await readFile(
				new URL('../../src/lib/categories/library-editor.svelte.ts', import.meta.url),
				'utf8'
			)
		),
		'library-editor.svelte.js'
	);
const fixture: {
	flush(): void;
	effect_root(callback: () => void): () => void;
	observe(read: () => unknown): { values: unknown[]; stop(): void };
	external(initial: CategoryEditorSeed): {
		seed(): CategoryEditorSeed;
		activeAccount(): string | null;
		replace(value: CategoryEditorSeed): void;
		activate(account: string | null): void;
		reads(): number;
	};
} = await clientModule(
	`export { flush, effect_root } from 'svelte/internal/client';
	 export function observe(read) {
		const values = [];
		const stop = $effect.root(() => { $effect(() => { values.push(read()); }); });
		return { values, stop };
	 }
	 export function external(initial) {
		let seed = $state.raw(initial), account = $state(initial.accountId), reads = 0;
		return {
			seed: () => { reads++; return seed; }, activeAccount: () => account,
			replace: (value) => { seed = value; }, activate: (value) => { account = value; },
			reads: () => reads
		};
	 }`,
	'category-editor-inputs.svelte.js'
);
const { flush } = fixture;
type Editor = ReturnType<typeof production.createCategoryLibraryEditor>;
const mounted: (() => void)[] = [];
afterEach(() => {
	for (const destroy of mounted.splice(0)) destroy();
});

function initial(): CategoryEditorSeed {
	return {
		accountId: 'account',
		scope: 'entry',
		routeOriginId: null,
		libraryRevision: '4',
		draft: {
			requestId: 'fresh-request',
			originId: null,
			expectedLibraryRevision: '4',
			scope: 'entry',
			name: 'Server name',
			meaning: '',
			priority: 0,
			displayOrder: 0,
			roles: ['main'],
			rule: { op: 'all', children: [] },
			confirmRetainedRule: false
		},
		choices: { tags: [], cards: [] }
	};
}
function mount(seed = initial(), initialAction?: CategoryEditorReply) {
	const inputs = fixture.external(seed);
	let editor!: Editor;
	const stop = fixture.effect_root(() => {
		editor = production.createCategoryLibraryEditor({ ...inputs, initialAction });
	});
	mounted.push(() => {
		editor.dispose();
		stop();
	});
	flush();
	return { editor, inputs };
}
// These represent captured browser fields. They deliberately differ from the
// reactive draft, as unchecked roles, pending DOM edits and named submitters can.
function fields(name = 'Submitted A', ruleAction?: string) {
	const form = new FormData();
	for (const [key, value] of [
		['requestId', 'native-request'],
		['originId', ''],
		['expectedLibraryRevision', '4'],
		['scope', 'entry'],
		['name', name],
		['meaning', 'Submitted meaning'],
		['priority', '7'],
		['displayOrder', '9'],
		['roles', 'main'],
		['roles', 'commander'],
		['rule', '{"op":"type","value":"Creature"}'],
		['confirmRetainedRule', 'on']
	])
		form.append(key, value);
	if (ruleAction) form.append('ruleAction', ruleAction);
	return form;
}
function begin(editor: Editor, submitted = fields(), editorFields = submitted, action = '?/save') {
	const attempt = editor.beginSubmission(action, submitted, editorFields);
	expect(attempt).not.toBeNull();
	return attempt!;
}
function reply(
	data: CategoryEditorReply,
	status = 200
): ActionResult<CategoryEditorReply, CategoryEditorReply> {
	return { type: status >= 400 ? 'failure' : 'success', status, data, location: '/mtg/categories' };
}
function acknowledged(requestId = 'saved-request', originId = 'saved-origin') {
	return { requestId, originId, libraryRevision: '5', versionId: 'version-A', changed: true };
}
function editB(editor: Editor) {
	editor.draft.name = 'New B';
	editor.draft.meaning = 'Newer meaning';
	editor.draft.rule = { op: 'keyword', value: 'Flying' };
	editor.edit();
}

it('hydrates native action draft, choices and message without a self-dependent adoption loop', () => {
	const seed = initial();
	const { editor, inputs } = mount(seed, {
		draft: { ...seed.draft, name: 'Retained native action' },
		choices: { tags: [{ id: 'tag', name: 'Native choice' }], cards: [] },
		message: 'Review native criteria'
	});
	expect(editor.draft.name).toBe('Retained native action');
	expect(editor.choices.tags[0]?.name).toBe('Native choice');
	expect(editor.message).toBe('Review native criteria');
	expect(editor.busy).toBe(false);
	const reads = inputs.reads();
	flush();
	expect(inputs.reads()).toBe(reads);
	editB(editor);
	const afterEdit = inputs.reads();
	flush();
	expect(inputs.reads()).toBe(afterEdit);
	expect(editor.draft.name).toBe('New B');
});

it('adopts clean external seeds reactively and retains dirty controls through later reads', () => {
	const { editor, inputs } = mount();
	const incoming = initial();
	incoming.draft.name = 'Fresh server controls';
	inputs.replace(incoming);
	flush();
	expect(editor.draft.name).toBe('Fresh server controls');
	editB(editor);
	inputs.replace({ ...initial(), libraryRevision: '6' });
	flush();
	expect(editor.draft.name).toBe('New B');
	expect(editor.draft.expectedLibraryRevision).toBe('4');
	expect(editor.dirty).toBe(true);
});

it('publishes controls and feedback to Svelte client consumers without rescheduling adoption', () => {
	const { editor, inputs } = mount();
	const view = fixture.observe(() => ({
		name: editor.draft.name,
		dirty: editor.dirty,
		busy: editor.busy,
		message: editor.message,
		choices: editor.choices.tags.map((tag) => tag.name),
		confirmation: editor.confirmation?.originId,
		retry: editor.originalRetry?.action
	}));
	mounted.push(view.stop);
	flush();
	expect(view.values).toHaveLength(1);
	editB(editor);
	const attempt = begin(editor);
	const reads = inputs.reads();
	flush();
	expect(inputs.reads()).toBe(reads);
	expect(view.values.at(-1)).toMatchObject({ name: 'New B', dirty: true, busy: true });
	attempt.complete({ type: 'error', error: { status: 500, message: 'Unavailable' } }, fields());
	attempt.finish();
	flush();
	expect(view.values.at(-1)).toMatchObject({
		name: 'New B',
		dirty: true,
		busy: false,
		retry: '?/save'
	});
	editor.reopen();
	const confirmed = begin(editor);
	confirmed.complete(reply({ acknowledgement: acknowledged() }), fields());
	confirmed.finish();
	flush();
	expect(view.values.at(-1)).toMatchObject({
		dirty: false,
		confirmation: 'saved-origin',
		retry: undefined
	});
});

it('confirms Save A while preserving B and advancing only acknowledged origin and base', () => {
	const seed = initial();
	const { editor, inputs } = mount(seed);
	const submitted = fields();
	const attempt = begin(editor, submitted);
	editB(editor);
	const receipt = acknowledged(String(submitted.get('requestId')));
	const completed = attempt.complete(
		reply({ acknowledgement: receipt, draft: seed.draft }),
		fields('New B')
	);
	expect(editor.confirmation).toEqual(receipt);
	expect(editor.draft.name).toBe('New B');
	expect(editor.draft.meaning).toBe('Newer meaning');
	expect(editor.draft.rule).toEqual({ op: 'keyword', value: 'Flying' });
	expect(editor.draft.originId).toBe('saved-origin');
	expect(editor.draft.expectedLibraryRevision).toBe('5');
	expect(editor.dirty).toBe(true);
	expect(editor.message).toContain('newer edits remain unsaved');
	expect(completed?.refresh?.current()).toBe(true);
	// Acknowledgement must not mutate the server's ROUTE-origin seed.
	expect(seed.draft.originId).toBeNull();
	expect(inputs.seed().routeOriginId).toBeNull();
	attempt.finish();
	expect(editor.busy).toBe(false);
});

it.each([200, 400, 503])(
	'a held criteria reply with status %s cannot replace newer controls or choices',
	(status) => {
		const { editor } = mount();
		const submitted = fields('Submitted A', 'update');
		const attempt = begin(editor, submitted);
		editB(editor);
		attempt.complete(
			reply(
				{
					draft: { ...initial().draft, name: 'Held A' },
					choices: { tags: [{ id: 'old', name: 'Held choices' }], cards: [] },
					message: 'Earlier response'
				},
				status
			),
			fields('New B')
		);
		attempt.finish();
		expect(editor.draft.name).toBe('New B');
		expect(editor.draft.rule).toEqual({ op: 'keyword', value: 'Flying' });
		expect(editor.choices.tags).toEqual([]);
		expect(editor.dirty).toBe(true);
		expect(editor.message).toContain('newer edits are retained');
		expect(editor.originalRetry !== null).toBe(status >= 500);
	}
);

it('adopts unchanged criteria but does not treat a named criteria submitter as a saved version', () => {
	const { editor } = mount();
	const submitted = fields('Submitted A', 'update');
	const attempt = begin(editor, submitted);
	attempt.complete(
		reply({
			draft: { ...initial().draft, name: 'Criteria draft' },
			choices: { tags: [{ id: 'tag', name: 'Choice' }], cards: [] }
		}),
		fields()
	);
	attempt.finish();
	expect(editor.draft.name).toBe('Criteria draft');
	expect(editor.choices.tags[0]?.name).toBe('Choice');
	expect(editor.confirmation).toBeNull();
	expect(editor.dirty).toBe(true);
});

it('changed and restored controls still count as newer edits', () => {
	const { editor } = mount();
	const submitted = fields();
	const attempt = begin(editor, submitted);
	editor.edit();
	editor.edit();
	attempt.complete(
		reply({ draft: { ...initial().draft, name: 'Must not replace restored fields' } }),
		fields()
	);
	attempt.finish();
	expect(editor.draft.name).toBe('Server name');
	expect(editor.message).toContain('earlier draft');
	expect(editor.dirty).toBe(true);
});

it('actual captured fields protect edits even without a control event', () => {
	const { editor } = mount();
	const attempt = begin(editor);
	editor.draft.name = 'Unreported DOM change';
	attempt.complete(
		reply({ draft: { ...initial().draft, name: 'Held A' } }),
		fields('Different DOM fields')
	);
	attempt.finish();
	expect(editor.draft.name).toBe('Unreported DOM change');
});

it('retains immutable original action, repeated fields, rule JSON and request identity through B and a transport retry', () => {
	const { editor } = mount();
	const original = fields('Submitted A', 'update');
	const attempt = begin(editor, original);
	const requestId = original.get('requestId');
	attempt.complete(reply({ message: 'Unavailable' }, 503), original);
	attempt.finish();
	const retry = editor.originalRetry!;
	editB(editor);
	original.set('name', 'Mutated external form');
	expect(retry.action).toBe('?/save');
	expect(retry.fields.filter(([name]) => name === 'roles')).toEqual([
		['roles', 'main'],
		['roles', 'commander']
	]);
	expect(retry.fields).toContainEqual(['name', 'Submitted A']);
	expect(retry.fields).toContainEqual(['rule', '{"op":"type","value":"Creature"}']);
	expect(retry.fields).toContainEqual(['ruleAction', 'update']);
	expect(Object.isFrozen(retry.fields[0])).toBe(true);
	const retryFields = new FormData();
	for (const [name, value] of retry.fields) retryFields.append(name, value);
	const retried = begin(editor, retryFields, fields('New B'), retry.action);
	expect(retryFields.get('requestId')).toBe(requestId);
	retried.complete(
		{ type: 'error', error: { message: 'Network lost', status: 500 } },
		fields('New B')
	);
	retried.finish();
	expect(editor.originalRetry).toEqual(retry);
	expect(editor.draft.name).toBe('New B');
});

it('payload identity excludes requestId but distinguishes actions, named submitters and repeated fields', () => {
	const { editor } = mount();
	function uncertain(action: string, submitted: FormData) {
		const attempt = begin(editor, submitted, fields(), action);
		attempt.complete({ type: 'error', error: { message: 'Unconfirmed', status: 500 } }, fields());
		attempt.finish();
		return submitted.get('requestId');
	}
	const a = uncertain('?/save', fields('A', 'update'));
	const same = fields('A', 'update');
	same.set('requestId', 'different-native-id');
	expect(uncertain('?/save', same)).toBe(a);
	expect(uncertain('?/save', fields('A', 'choices'))).not.toBe(a);
	expect(uncertain('?/archive', fields('A', 'update'))).not.toBe(a);
	const roles = fields('A', 'update');
	roles.delete('roles');
	roles.append('roles', 'main');
	expect(uncertain('?/save', roles)).not.toBe(a);
});

it('unrelated receipts and successful criteria cannot discard the uncertain original request', () => {
	const { editor } = mount();
	const original = fields('Uncertain A');
	const uncertain = begin(editor, original);
	uncertain.complete(
		{ type: 'error', error: { status: 500, message: 'Lost acknowledgement' } },
		original
	);
	uncertain.finish();
	const retry = editor.originalRetry;
	editB(editor);
	const archive = new FormData();
	archive.set('originId', 'other-definition');
	const archived = begin(editor, archive, fields('New B'), '?/archive');
	archived.complete(
		reply({ acknowledgement: acknowledged('archive-request', 'other-definition') }),
		fields('New B')
	);
	archived.finish();
	expect(editor.originalRetry).toBe(retry);
	expect(editor.confirmation?.originId).toBe('other-definition');
	const criteriaFields = fields('New B', 'choices');
	const criteria = begin(editor, criteriaFields);
	criteria.complete(reply({ choices: { tags: [], cards: [] } }), fields('New B'));
	criteria.finish();
	expect(editor.originalRetry).toBe(retry);
	const repeated = new FormData();
	for (const [name, value] of retry!.fields) repeated.append(name, value);
	const originalAttempt = begin(editor, repeated, fields('New B'));
	expect(repeated.get('requestId')).toBe(original.get('requestId'));
	originalAttempt.complete(
		reply({ acknowledgement: acknowledged(String(repeated.get('requestId'))) }),
		fields('New B')
	);
	originalAttempt.finish();
	expect(editor.originalRetry).toBeNull();
	expect(editor.draft.name).toBe('New B');
});

it('successful original criteria retry clears its retry while retaining newer controls', () => {
	const { editor } = mount();
	const original = fields('Criteria A', 'update');
	const attempt = begin(editor, original);
	attempt.complete(reply({ message: 'Unavailable' }, 503), original);
	attempt.finish();
	const retry = editor.originalRetry!;
	editB(editor);
	const repeated = new FormData();
	for (const [name, value] of retry.fields) repeated.append(name, value);
	const retried = begin(editor, repeated, fields('New B'));
	expect(repeated.get('requestId')).toBe(original.get('requestId'));
	retried.complete(reply({ draft: initial().draft }), fields('New B'));
	retried.finish();
	expect(editor.originalRetry).toBeNull();
	expect(editor.draft.name).toBe('New B');
	expect(editor.dirty).toBe(true);
});

it('retains the uncertain original and current retry identities through repeated edited validation failures', () => {
	const { editor } = mount();
	const original = fields('Uncertain A');
	const attempt = begin(editor, original);
	attempt.complete({ type: 'error', error: { status: 500, message: 'Lost' } }, original);
	attempt.finish();
	const retry = editor.originalRetry!;
	let lastId: FormDataEntryValue | null = null;
	for (let index = 0; index < 100; index++) {
		const rejected = fields(`Rejected ${index}`);
		const current = begin(editor, rejected);
		current.complete(reply({ message: 'Invalid criteria' }, 400), rejected);
		current.finish();
		lastId = rejected.get('requestId');
	}
	const last = fields('Rejected 99');
	const lastAttempt = begin(editor, last);
	expect(last.get('requestId')).toBe(lastId);
	lastAttempt.complete(reply({ message: 'Unavailable' }, 503), last);
	lastAttempt.finish();
	expect(editor.originalRetry).toBe(retry);
	const repeated = new FormData();
	for (const [name, value] of retry.fields) repeated.append(name, value);
	const originalAttempt = begin(editor, repeated);
	expect(repeated.get('requestId')).toBe(original.get('requestId'));
	originalAttempt.finish();
	const currentFields = fields('Rejected 99');
	const currentAttempt = begin(editor, currentFields);
	expect(currentFields.get('requestId')).toBe(lastId);
	currentAttempt.finish();
});

it.each(['scope', 'account', 'route origin'])(
	'synchronously rejects %s replacement before effects and after returning',
	(change) => {
		const { editor, inputs } = mount();
		const attempt = begin(editor);
		const read = editor.authority();
		const replacement = initial();
		if (change === 'scope') replacement.scope = 'deck';
		if (change === 'account') replacement.accountId = 'other';
		if (change === 'route origin') replacement.routeOriginId = 'other-origin';
		inputs.replace(replacement);
		expect(read.current()).toBe(false);
		inputs.replace(initial());
		attempt.complete(reply({ acknowledgement: acknowledged() }), fields());
		attempt.finish();
		flush();
		expect(read.current()).toBe(false);
		expect(editor.confirmation).toBeNull();
		expect(editor.busy).toBe(false);
	}
);

it('navigation reopen rejects away/back callbacks even when no authority read or effect observes the intermediate route', () => {
	const { editor, inputs } = mount();
	const attempt = begin(editor);
	const read = editor.authority();
	// The page's beforeNavigate adapter calls reopen when leaving the context.
	editor.reopen();
	inputs.replace({ ...initial(), scope: 'deck' });
	inputs.replace(initial());
	attempt.complete(reply({ acknowledgement: acknowledged() }), fields());
	attempt.finish();
	expect(read.current()).toBe(false);
	expect(editor.confirmation).toBeNull();
});

it('synchronously rejects inactive account evidence before effects and after reactivation', () => {
	const { editor, inputs } = mount();
	const attempt = begin(editor);
	const read = editor.authority();
	inputs.activate('other');
	attempt.complete(reply({ acknowledgement: acknowledged() }), fields());
	expect(read.current()).toBe(false);
	inputs.activate('account');
	flush();
	attempt.finish();
	expect(editor.confirmation).toBeNull();
	expect(editor.draft.requestId).toBe('fresh-request');
});

it('workspace activation replacement invalidates the editor and its read before an effect flush', () => {
	const workspace = new WorkspaceSavedState({
		source: () => ({ readyState: 1, close() {}, addEventListener() {}, onerror: null }),
		session: async () => 200,
		visible: () => true,
		listen: () => () => {},
		changed() {}
	});
	workspace.start({ accountId: 'account', activation: 'first' });
	const { editor } = mount();
	const subscription = workspace.subscribe({
		topics: ['decks'],
		clear: editor.clear,
		refresh: async () => {}
	});
	const submitted = fields();
	const attempt = begin(editor, submitted);
	const write = subscription.beginWrite();
	const read = editor.authority();
	try {
		workspace.start({ accountId: 'account', activation: 'replacement' });
		expect(write.current()).toBe(false);
		expect(read.current()).toBe(false);
		attempt.complete(reply({ acknowledgement: acknowledged() }), fields());
		attempt.finish();
		expect(editor.confirmation).toBeNull();
		expect(editor.draft.requestId).toBe('');
	} finally {
		write.complete();
		subscription.dispose();
		workspace.stop();
	}
});

it('same-key reopen immediately invalidates old completion and stale finish cannot release a new busy attempt', () => {
	const { editor } = mount();
	const old = begin(editor);
	const read = editor.authority();
	editor.reopen();
	const current = begin(editor);
	old.complete(reply({ acknowledgement: acknowledged() }), fields());
	old.finish();
	expect(editor.busy).toBe(true);
	expect(editor.confirmation).toBeNull();
	expect(read.current()).toBe(false);
	current.finish();
	expect(editor.busy).toBe(false);
});

it('dispose removes private state and rejects completion, reads and later external seeds', () => {
	const { editor, inputs } = mount();
	const attempt = begin(editor);
	const read = editor.authority();
	editor.dispose();
	inputs.replace({ ...initial(), routeOriginId: 'new-origin' });
	attempt.complete(reply({ acknowledgement: acknowledged() }), fields());
	attempt.finish();
	flush();
	expect(editor.draft.name).toBe('');
	expect(editor.draft.requestId).toBe('');
	expect(editor.confirmation).toBeNull();
	expect(read.current()).toBe(false);
	expect(editor.beginSubmission('?/save', fields(), fields())).toBeNull();
});

it('terminal clear stays empty until matching active-account evidence permits reseeding', () => {
	const { editor, inputs } = mount();
	const attempt = begin(editor);
	attempt.complete({ type: 'error', error: { message: 'Lost', status: 500 } }, fields());
	attempt.finish();
	inputs.activate(null);
	editor.clear();
	inputs.replace(initial());
	flush();
	expect(editor.draft.requestId).toBe('');
	expect(editor.choices).toEqual({ tags: [], cards: [] });
	expect(editor.originalRetry).toBeNull();
	expect(editor.confirmation).toBeNull();
	expect(editor.message).toBe('');
	expect(editor.dirty).toBe(false);
	inputs.activate('other');
	flush();
	expect(editor.draft.requestId).toBe('');
	const other = { ...initial(), accountId: 'other' };
	other.draft.name = 'Other account draft';
	inputs.replace(other);
	flush();
	expect(editor.draft.name).toBe('Other account draft');
	expect(editor.draft.requestId).toBe('fresh-request');
});

it('an archive receipt for another definition cannot retarget or rebase the editor', () => {
	const { editor } = mount();
	editB(editor);
	const before = structuredClone({
		...editor.draft,
		roles: [...editor.draft.roles],
		rule: { op: 'keyword', value: 'Flying' }
	});
	const archive = new FormData();
	archive.set('originId', 'archived-definition');
	const attempt = begin(editor, archive, fields(), '?/archive');
	const receipt = acknowledged('archive-request', 'archived-definition');
	attempt.complete(
		reply({ acknowledgement: receipt, message: 'Future adoption state saved.' }),
		fields()
	);
	attempt.finish();
	expect(editor.confirmation).toEqual(receipt);
	expect(editor.draft).toEqual(before);
	expect(editor.dirty).toBe(true);
});

it('a confirmed receipt and controls survive a failed optional Library refresh and finish releases busy', async () => {
	const { editor } = mount();
	const attempt = begin(editor);
	const completion = attempt.complete(
		reply({ acknowledgement: acknowledged(), draft: initial().draft }),
		fields()
	);
	try {
		await expect(
			readCategoryLibraryPage(
				{ scope: 'entry', offset: 0, limit: 50 },
				async () => new Response(null, { status: 503 }),
				() => completion?.refresh?.current() ?? false
			)
		).rejects.toThrow('Unavailable Library read');
	} finally {
		attempt.finish();
	}
	expect(editor.confirmation?.originId).toBe('saved-origin');
	expect(editor.draft.originId).toBe('saved-origin');
	expect(editor.draft.expectedLibraryRevision).toBe('5');
	expect(editor.message).toBe('Submitted definition saved.');
	expect(editor.busy).toBe(false);
});

it('pagination leaves an acknowledged new origin and controls live independently of ROUTE-origin', () => {
	const { editor, inputs } = mount();
	const attempt = begin(editor);
	attempt.complete(
		reply({ acknowledgement: acknowledged(), draft: { ...initial().draft, name: 'Saved A' } }),
		fields()
	);
	attempt.finish();
	const authority = editor.authority();
	// Offset/limit belong to the list, so its incoming page supplies a fresh
	// seed for the same account/scope/ROUTE-origin, without changing the editor.
	inputs.replace({ ...initial(), libraryRevision: '5' });
	flush();
	expect(editor.draft.name).toBe('Saved A');
	expect(editor.draft.originId).toBe('saved-origin');
	expect(editor.draft.expectedLibraryRevision).toBe('5');
	expect(authority.current()).toBe(true);
	expect(editor.confirmation?.versionId).toBe('version-A');
});

it('explicitly reopening the same new-definition route adopts its fresh seed after a saved origin', () => {
	const { editor, inputs } = mount();
	const attempt = begin(editor);
	attempt.complete(
		reply({ acknowledgement: acknowledged(), draft: { ...initial().draft, name: 'Saved A' } }),
		fields()
	);
	attempt.finish();
	editor.reopen();
	const fresh = initial();
	fresh.libraryRevision = fresh.draft.expectedLibraryRevision = '5';
	inputs.replace(fresh);
	flush();
	expect(editor.draft.originId).toBeNull();
	expect(editor.draft.name).toBe('Server name');
	expect(editor.confirmation).toBeNull();
	expect(editor.dirty).toBe(false);
});

it('pagination of an existing definition preserves its dirty draft and pending submission', () => {
	const seed = initial();
	seed.routeOriginId = seed.draft.originId = 'route-origin';
	const { editor, inputs } = mount(seed);
	editB(editor);
	const attempt = begin(editor);
	const read = editor.authority();
	const nextPage = initial();
	nextPage.routeOriginId = nextPage.draft.originId = 'route-origin';
	nextPage.libraryRevision = '6';
	inputs.replace(nextPage);
	flush();
	expect(editor.draft.name).toBe('New B');
	expect(editor.dirty).toBe(true);
	expect(editor.busy).toBe(true);
	expect(read.current()).toBe(true);
	attempt.finish();
	expect(editor.busy).toBe(false);
});
