import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ add: vi.fn(), inventory: vi.fn() }));
vi.mock('#lib/server/composition.ts', () => ({
	application: { decks: { addCatalogCardToDeck: mocks.add }, inventory: { add: mocks.inventory } }
}));
vi.mock('#lib/server/data/decks.ts', async () => {
	const actual = await vi.importActual('@spellbook/backend/decks/application.ts');
	return { DeckNotFoundError: actual.DeckNotFoundError };
});
import { addToDeck, addBrowsingToInventory } from '#lib/server/card-browsing-actions.ts';
import { ValidationError } from '#lib/server/mtg/validation.ts';
import { RequestConflictError } from '#lib/server/data/request-fingerprint.ts';
import { DeckNotFoundError } from '@spellbook/backend/decks/application.ts';
const draft = {
	requestId: 'original',
	deckId: 'owned',
	catalogCardId: 'printing',
	role: 'sideboard',
	quantity: '3'
};
function event(user: string | null, fields: Record<string, string> = draft) {
	return {
		locals: { user: user ? { accountId: user } : null },
		request: new Request('https://spellbook.test/mtg/search?/addToDeck', {
			method: 'POST',
			body: new URLSearchParams(fields)
		})
	} as never;
}
beforeEach(() => vi.clearAllMocks());
it('anonymous POST never writes', async () => {
	await expect(addToDeck(event(null))).rejects.toMatchObject({ status: 303 });
	expect(mocks.add).not.toHaveBeenCalled();
});
it('uses authenticated actor and authoritative catalog identity, returning the original receipt without another read', async () => {
	const acknowledgement = {
		requestId: 'original',
		deckId: 'owned',
		revision: '7',
		changes: [],
		removedEntryIds: []
	};
	mocks.add.mockResolvedValue(acknowledgement);
	expect(
		await addToDeck(
			event('owner', { ...draft, accountId: 'foreign', name: 'forged', canonicalCardId: 'forged' })
		)
	).toEqual({ action: 'addToDeck', deckAdditionDraft: draft, success: true, acknowledgement });
	expect(mocks.add).toHaveBeenCalledWith({ accountId: 'owner' }, { ...draft, quantity: 3 });
});
it.each([
	['', '3'],
	['owned', '1e2'],
	['owned', '3.1']
])('rejects incomplete target or malformed integer without mutation', async (deckId, quantity) => {
	expect(await addToDeck(event('owner', { ...draft, deckId, quantity }))).toMatchObject({
		status: 400
	});
	expect(mocks.add).not.toHaveBeenCalled();
});
it.each([
	[new ValidationError('invalid'), 400],
	[new RequestConflictError(), 409],
	[new DeckNotFoundError(), 404]
])('retains exact submitted draft on controlled errors', async (cause, status) => {
	mocks.add.mockRejectedValue(cause);
	expect(await addToDeck(event('owner'))).toMatchObject({
		status,
		data: { deckAdditionDraft: draft, uncertain: false }
	});
});
it('a lost response retains immutable original intent and safe503, never exposing infrastructure details', async () => {
	mocks.add.mockRejectedValue(Error('private connection secret'));
	expect(await addToDeck(event('owner'))).toMatchObject({
		status: 503,
		data: { deckAdditionDraft: draft, uncertain: true }
	});
	expect(JSON.stringify(await addToDeck(event('owner')))).not.toContain('secret');
});
it('authoritative expiry returns401 with no inferred confirmation', async () => {
	mocks.add.mockRejectedValue({ kind: 'Unauthenticated' });
	expect(await addToDeck(event('owner'))).toMatchObject({
		status: 401,
		data: { uncertain: false }
	});
});

it('Inventory failure retains original finish/condition/quantity/request and uses authoritative actor', async () => {
	const original = {
		requestId: 'inventory-original',
		catalogCardId: 'printing',
		finish: 'foil',
		condition: 'LP',
		quantity: '4'
	};
	mocks.inventory.mockRejectedValue(new ValidationError('unavailable finish'));
	expect(
		await addBrowsingToInventory(
			event('owner', { ...original, accountId: 'foreign', name: 'forged' })
		)
	).toMatchObject({ status: 400, data: { inventoryAdditionDraft: original, uncertain: false } });
	expect(mocks.inventory).toHaveBeenCalledWith(
		{ accountId: 'owner' },
		{ ...original, quantity: 4, source: 'web' }
	);
});
it('Inventory lost response retains safe original retry instead of dropping the submitted draft', async () => {
	const original = {
		requestId: 'inventory-original',
		catalogCardId: 'printing',
		finish: 'nonfoil',
		condition: 'NM',
		quantity: '2'
	};
	mocks.inventory.mockRejectedValue(Error('private database detail'));
	expect(await addBrowsingToInventory(event('owner', original))).toMatchObject({
		status: 503,
		data: { inventoryAdditionDraft: original, uncertain: true }
	});
});

it('unchanged native uncertain primary submit reuses original nonce, while edited details retain a fresh nonce', async () => {
	mocks.add.mockResolvedValue({ requestId: 'original' });
	const snapshot = {
		deckRetryRequestId: 'original',
		deckRetryDeckId: 'owned',
		deckRetryCatalogCardId: 'printing',
		deckRetryRole: 'sideboard',
		deckRetryQuantity: '3',
		originalUncertain: 'true'
	};
	await addToDeck(event('owner', { ...draft, requestId: 'new', ...snapshot }));
	expect(mocks.add).toHaveBeenLastCalledWith({ accountId: 'owner' }, { ...draft, quantity: 3 });
	await addToDeck(event('owner', { ...draft, requestId: 'new', quantity: '4', ...snapshot }));
	expect(mocks.add).toHaveBeenLastCalledWith(
		{ accountId: 'owner' },
		{ ...draft, requestId: 'new', quantity: 4 }
	);
});
