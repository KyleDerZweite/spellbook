import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock('#lib/server/composition.ts', () => ({
	application: {
		inventory: { add: mocks.add },
		catalog: {}
	}
}));
vi.mock('#lib/server/data/decks.ts', async () => {
	const actual = await vi.importActual('@spellbook/backend/decks/application.ts');
	return { DeckNotFoundError: actual.DeckNotFoundError };
});
import { actions } from '../../src/routes/mtg/search/+page.server';

function event(accountId: string | null, fields: Record<string, string> = {}) {
	return {
		locals: { user: accountId ? { accountId } : null },
		request: new Request('https://spellbook.test/mtg/search?/addToInventory', {
			method: 'POST',
			body: new URLSearchParams(fields)
		})
	};
}
const identity = { catalogCardId: 'printing', canonicalCardId: 'canonical', name: 'Opt' };
describe('Search inventory action', () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});
	it('requires an authenticated account before accessing inventory', async () => {
		await expect(actions.addToInventory(event(null, identity) as never)).rejects.toMatchObject({
			status: 303
		});
		expect(mocks.add).not.toHaveBeenCalled();
	});
	it('rejects incomplete printing identity without any inventory mutation', async () => {
		expect(await actions.addToInventory(event('owner', { name: 'Opt' }) as never)).toMatchObject({
			status: 400
		});
		expect(mocks.add).not.toHaveBeenCalled();
	});
	it('takes ownership only from the authenticated account and forwards entered inventory attributes', async () => {
		const fields = {
			...identity,
			accountId: 'other',
			quantity: '3',
			finish: 'foil',
			condition: 'LP',
			game: 'mtg',
			requestId: '11111111-1111-4111-8111-111111111111'
		};
		const acknowledgement = { requestId: fields.requestId, revision: '8', changes: [] };
		mocks.add.mockResolvedValue(acknowledgement);
		expect(await actions.addToInventory(event('owner', fields) as never)).toEqual({
			action: 'addToInventory',
			inventoryAdditionDraft: {
				requestId: fields.requestId,
				catalogCardId: identity.catalogCardId,
				quantity: '3',
				finish: 'foil',
				condition: 'LP'
			},
			success: true,
			acknowledgement
		});
		expect(mocks.add).toHaveBeenCalledExactlyOnceWith(
			{ accountId: 'owner' },
			{
				catalogCardId: identity.catalogCardId,
				quantity: 3,
				finish: 'foil',
				condition: 'LP',
				source: 'web',
				requestId: fields.requestId
			}
		);
	});
});
