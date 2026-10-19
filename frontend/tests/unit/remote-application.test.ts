import { describe, expect, it, vi } from 'vitest';
import { RemoteClient } from '#lib/server/remote/client.ts';
import { createRemoteApplication } from '#lib/server/remote/application.ts';
import {
	decodeRemoteError,
	NotesConflictError,
	InventoryQuantityChangedError,
	DescriptionConflictError,
	CategoryConflict,
	CategoryMergeConflict,
	RequestConflictError,
	RemoteError,
	RemoteUnavailableError
} from '#lib/server/remote/errors.ts';
import { ValidationError } from '@spellbook/contracts/validation.ts';
import type { WebCommandInputs } from '@spellbook/contracts/web.ts';

const actor = { accountId: 'account', username: 'mage', email: '' };
function setup() {
	const send = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({}));
	const client = new RemoteClient({
		apiUrl: 'http://api.internal:4000',
		publicOrigin: 'https://spellbook.test',
		clientAddress: '192.0.2.10',
		token: 'cookie-session',
		fetch: send
	});
	return { send, client, app: createRemoteApplication(() => client) };
}
function sent(send: ReturnType<typeof setup>['send'], index = 0) {
	const [url, init] = send.mock.calls[index];
	return {
		url: new URL(String(url)),
		headers: new Headers(init?.headers),
		method: init?.method,
		body: init?.body ? JSON.parse(String(init.body)) : undefined
	};
}

describe('flat remote failures', () => {
	it('reconstructs exact Notes, Quantity and Description conflict values', () => {
		const notes = decodeRemoteError(409, {
			kind: 'NotesConflict',
			message: 'notes',
			entryId: 'entry',
			notes: '',
			notesRevision: 'n2'
		});
		expect(notes).toBeInstanceOf(NotesConflictError);
		expect(notes).toMatchObject({
			latest: { entryId: 'entry', notes: '', notesRevision: 'n2' },
			message: 'notes'
		});
		const quantity = decodeRemoteError(409, {
			kind: 'QuantityChanged',
			message: 'deleted',
			latestQuantity: null
		});
		expect(quantity).toBeInstanceOf(InventoryQuantityChangedError);
		expect(quantity).toMatchObject({ latestQuantity: null });
		const description = decodeRemoteError(409, {
			kind: 'DescriptionConflict',
			message: 'description',
			description: '',
			descriptionRevision: 'd2'
		});
		expect(description).toBeInstanceOf(DescriptionConflictError);
		expect(description).toMatchObject({ latest: { description: '', descriptionRevision: 'd2' } });
	});
	it('retains category latest, merge previews, request conflicts and profile fields', () => {
		const latest = { deckId: 'deck', decisionRevision: '2', definitions: [], decisions: [] };
		const preview = { token: 'merge', required: true };
		expect(decodeRemoteError(409, { kind: 'CategoryConflict', latest })).toBeInstanceOf(
			CategoryConflict
		);
		expect(decodeRemoteError(409, { kind: 'CategoryConflict', latest })).toMatchObject({ latest });
		expect(decodeRemoteError(409, { kind: 'CategoryMergeConflict', preview })).toBeInstanceOf(
			CategoryMergeConflict
		);
		expect(decodeRemoteError(409, { kind: 'CategoryMergeConflict', preview })).toMatchObject({
			preview
		});
		expect(decodeRemoteError(409, { kind: 'RequestConflict', message: 'receipt' })).toBeInstanceOf(
			RequestConflictError
		);
		expect(
			decodeRemoteError(400, { kind: 'ValidationFailed', fields: { name: 'changed' } })
		).toMatchObject({ kind: 'ValidationFailed', fields: { name: 'changed' } });
	});
	it.each([
		{ kind: 'NotesConflict', entryId: 'entry', notes: '' },
		{ kind: 'QuantityChanged' },
		{ kind: 'DescriptionConflict', description: '' },
		{ kind: 'CategoryConflict' },
		{ kind: 'CategoryMergeConflict' }
	])('never fills absent conflict fields for $kind', (body) => {
		const error = decodeRemoteError(409, body);
		expect(error).toBeInstanceOf(RemoteError);
		expect(error).not.toBeInstanceOf(ValidationError);
		expect(error).not.toHaveProperty('latest');
		expect(error).not.toHaveProperty('latestQuantity');
		expect(error).not.toHaveProperty('preview');
	});
	it('distinguishes 401 from infrastructure failures and hides internal details', async () => {
		const { app, send } = setup();
		send.mockResolvedValueOnce(Response.json({ message: 'expired' }, { status: 401 }));
		expect(await app.auth.validateSession('old')).toBeNull();
		send.mockRejectedValueOnce(new Error('secret postgres connection'));
		await expect(app.auth.validateSession('valid')).rejects.toBeInstanceOf(RemoteUnavailableError);
		send.mockResolvedValueOnce(
			Response.json({ message: 'SELECT secret FROM internal' }, { status: 500 })
		);
		await expect(app.profile.get(actor)).rejects.toMatchObject({
			status: 503,
			message: 'The API is temporarily unavailable. Try again.'
		});
		send.mockResolvedValueOnce(new Response('invalid upstream html', { status: 502 }));
		await expect(app.profile.get(actor)).rejects.toBeInstanceOf(RemoteUnavailableError);
	});
	it('retains known safe reporting failures while hiding unexpected infrastructure details', () => {
		expect(
			decodeRemoteError(503, {
				message: 'Your collection totals exceed the supported reporting range.'
			})
		).toMatchObject({
			status: 503,
			kind: 'SummaryOutOfRange',
			message: 'Your collection totals exceed the supported reporting range.'
		});
		expect(
			decodeRemoteError(503, { kind: 'PriceReadUnavailable', message: 'private connection' })
		).toMatchObject({
			status: 503,
			kind: 'PriceReadUnavailable',
			message: 'Reference prices are temporarily unavailable.'
		});
		expect(
			decodeRemoteError(500, { message: 'Inventory totals cannot be represented exactly.' })
		).toMatchObject({ status: 500, kind: 'InvalidInventoryCount' });
	});
});

describe('named remote web use cases', () => {
	it('uses all nine closed commands with original bodies and request IDs', async () => {
		const { app, send } = setup();
		const commands: Array<[keyof WebCommandInputs, object]> = [];
		async function check<K extends keyof WebCommandInputs>(
			operation: K,
			input: WebCommandInputs[K],
			action: () => unknown
		) {
			commands.push([operation, input]);
			await action();
		}
		const add = {
			requestId: 'retry',
			catalogCardId: 'printing',
			finish: 'foil',
			condition: 'LP',
			quantity: 2
		};
		await check('inventory.add', add, () => app.inventory.add(actor, { ...add, source: 'web' }));
		const patch = { requestId: 'patch', entryId: 'entry', notes: '', notesRevision: '1' };
		await check('inventory.patchEntry', patch, () => app.inventory.patchEntry(actor, patch));
		const remove = { requestId: 'remove', entryId: 'entry', expectedQuantity: 2 };
		await check('inventory.remove', remove, () => app.inventory.remove(actor, remove));
		const create = { game: 'mtg' as const, name: 'Deck', description: '', format: 'Commander' };
		await check('decks.createRecord', create, () => app.decks.createDeckRecord(actor, create));
		const card = {
			deckId: 'deck',
			catalogCardId: 'printing',
			quantity: 1,
			role: 'main',
			requestId: 'card'
		};
		await check('decks.addCatalogCard', card, () => app.decks.addCatalogCardToDeck(actor, card));
		const replace = {
			entryId: 'entry',
			catalogCardId: 'printing',
			quantity: 1,
			role: 'main',
			requestId: 'replace'
		};
		await check('decks.changePrinting', replace, () =>
			app.decks.changeDeckPrinting(actor, replace)
		);
		const update = { entryId: 'entry', requestId: 'update', delta: -1 };
		await check('decks.updateCard', update, () =>
			app.decks.updateDeckCard(
				actor,
				update.entryId,
				undefined,
				undefined,
				update.requestId,
				update.delta,
				'web'
			)
		);
		await check('decks.removeCard', { entryId: 'entry', requestId: 'remove-card' }, () =>
			app.decks.removeDeckCard(actor, 'entry', 'remove-card')
		);
		const imported = { deckId: 'deck', text: '1 Opt', requestId: 'import' };
		await check('decks.importInto', imported, () => app.decks.importIntoDeck(actor, imported));
		for (const [index, [operation, input]] of commands.entries()) {
			const call = sent(send, index);
			expect(call.url.pathname).toBe('/api/web/v1/commands');
			expect(call.method).toBe('POST');
			expect(call.body).toEqual({ operation, input });
			expect(call.body).not.toHaveProperty('actor');
			expect(call.body.input).not.toHaveProperty('source');
		}
	});
	it('preserves REST query aliases and method/body boundaries', async () => {
		const { app, send } = setup();
		await app.decks.getDeckLibrary(actor, {
			query: 'test',
			format: 'Commander',
			categoryVersionIds: ['one', 'two'],
			sort: 'name:asc',
			offset: 200,
			limit: 200
		});
		expect(Object.fromEntries(sent(send).url.searchParams)).toMatchObject({
			dirQ: 'test',
			dirFormat: 'Commander',
			dirSort: 'name:asc',
			offset: '200',
			limit: '200'
		});
		expect(sent(send).url.searchParams.getAll('dirCategory')).toEqual(['one', 'two']);
		await app.decks.getDeckChoices(actor, { query: 'name', selectedDeckId: 'deck' });
		expect(sent(send, 1).url.searchParams.get('query')).toBe('name');
		const input = {
			entryId: 'entry',
			deckId: 'deck',
			requestId: 'request',
			categoryId: null,
			expectedDecisionRevision: '2'
		};
		await app.categories.setEntryCategory(actor, input);
		expect(sent(send, 2)).toMatchObject({
			method: 'PATCH',
			body: {
				deckId: 'deck',
				requestId: 'request',
				categoryId: null,
				expectedDecisionRevision: '2'
			}
		});
	});
	it('replaces the request credential before subsequent reads after password rotation', async () => {
		const { app, send } = setup();
		send.mockResolvedValueOnce(
			Response.json({ token: 'replacement-session', expiresAt: 'expiry' })
		);
		await app.auth.changePassword(actor, 'current-password', 'new-password');
		await app.profile.get(actor);
		expect(sent(send).headers.get('cookie')).toBe('spellbook_session=cookie-session');
		expect(sent(send, 1).headers.get('cookie')).toBe('spellbook_session=replacement-session');
		expect(sent(send, 1).headers.get('authorization')).toBeNull();
	});
	it('does not retry a mutation after an ambiguous response or later read failure', async () => {
		const { app, send } = setup();
		const input = {
			requestId: 'frozen-retry',
			entryId: 'entry',
			notes: 'draft',
			notesRevision: '1'
		};
		send.mockRejectedValueOnce(new Error('lost response'));
		await expect(app.inventory.patchEntry(actor, input)).rejects.toBeInstanceOf(
			RemoteUnavailableError
		);
		expect(send).toHaveBeenCalledTimes(1);
		await app.inventory.patchEntry(actor, input);
		expect(sent(send).body).toEqual(sent(send, 1).body);
		send.mockRejectedValueOnce(new Error('reload failed'));
		await expect(app.profile.get(actor)).rejects.toBeInstanceOf(RemoteUnavailableError);
		expect(send).toHaveBeenCalledTimes(3);
	});
	it('returns Inventory revision drift as data and missing entries as null', async () => {
		const { app, send } = setup();
		send.mockResolvedValueOnce(
			Response.json({ kind: 'RevisionChanged', revision: '3' }, { status: 409 })
		);
		expect(await app.inventory.page(actor, { sets: ['ABC'], limit: 200 }, '2')).toEqual({
			kind: 'RevisionChanged',
			revision: '3'
		});
		expect(sent(send).url.searchParams.getAll('set')).toEqual(['abc']);
		expect(sent(send).url.searchParams.get('revision')).toBe('2');
		send.mockResolvedValueOnce(Response.json({ message: 'gone' }, { status: 404 }));
		expect(await app.inventory.getEntry(actor, 'entry')).toBeNull();
	});
});
