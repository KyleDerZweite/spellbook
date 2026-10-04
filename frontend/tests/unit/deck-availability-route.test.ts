import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ snapshot: vi.fn(), session: vi.fn() }));
vi.mock('../../src/lib/server/data/decks', () => ({ getDeckSnapshot: mocks.snapshot }));
vi.mock('../../src/lib/server/auth/session', () => ({
	validateSession: mocks.session,
	getBearerToken: () => ''
}));
vi.mock('../../src/lib/server/auth/local', () => ({ requireSameOrigin: vi.fn() }));
import { GET } from '../../src/routes/api/mobile/v1/mtg/decks/[deckId]/availability/+server';

const deckId = '11111111-1111-4111-8111-111111111111';
const otherDeckId = '22222222-2222-4222-8222-222222222222';
const card = (id: string, printing: string, quantity = 1, selectedDeck = deckId) => ({
	id,
	deckId: selectedDeck,
	catalogCardId: printing,
	canonicalCardId: 'oracle',
	quantity
});
function event(selectedDeck = deckId, authenticated = true) {
	return {
		params: { deckId: selectedDeck },
		locals: {
			user: authenticated
				? { accountId: 'owner', username: 'Owner', email: 'owner@example.test' }
				: null
		},
		request: new Request(`http://localhost/api/mobile/v1/mtg/decks/${selectedDeck}/availability`)
	} as Parameters<typeof GET>[0];
}
beforeEach(() => {
	vi.clearAllMocks();
	mocks.snapshot.mockResolvedValue({ decks: [{ id: deckId }], deckCards: [], inventoryCards: [] });
});

describe('deck availability API', () => {
	it('requires authentication before accessing account data', async () => {
		await expect(GET(event(deckId, false))).rejects.toMatchObject({ status: 401 });
		expect(mocks.snapshot).not.toHaveBeenCalled();
	});
	it('rejects malformed deck identifiers and conceals foreign or missing decks', async () => {
		await expect(GET(event('invalid'))).rejects.toMatchObject({ status: 400 });
		expect(mocks.snapshot).not.toHaveBeenCalled();
		await expect(GET(event(otherDeckId))).rejects.toMatchObject({ status: 404 });
		expect(mocks.snapshot).toHaveBeenCalledWith('owner', 'mtg');
	});
	it('uses one owned copy only once across main and sideboard and ignores other decks', async () => {
		mocks.snapshot.mockResolvedValue({
			decks: [{ id: deckId }],
			deckCards: [
				{ ...card('a', 'printing'), role: 'main' },
				{ ...card('b', 'printing'), role: 'sideboard' },
				card('foreign', 'printing', 5, otherDeckId)
			],
			inventoryCards: [card('owned', 'printing')]
		});
		const response = await GET(event());
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(await response.json()).toEqual({
			deckId,
			entries: [
				{ entryId: 'a', required: 1, exact: 1, alternate: 0, missing: 0 },
				{ entryId: 'b', required: 1, exact: 0, alternate: 0, missing: 1 }
			],
			totals: { required: 2, exact: 1, alternate: 0, missing: 1 }
		});
	});
	it('reserves exact printings across all rows before distributing alternate copies', async () => {
		mocks.snapshot.mockResolvedValue({
			decks: [{ id: deckId }],
			deckCards: [card('a', 'first', 2), card('b', 'second')],
			inventoryCards: [card('owned', 'second', 2)]
		});
		expect(await (await GET(event())).json()).toMatchObject({
			entries: [
				{ entryId: 'a', required: 2, exact: 0, alternate: 1, missing: 1 },
				{ entryId: 'b', required: 1, exact: 1, alternate: 0, missing: 0 }
			],
			totals: { required: 3, exact: 1, alternate: 1, missing: 1 }
		});
	});
	it('returns zero totals for an empty deck and preserves infrastructure failures', async () => {
		expect(await (await GET(event())).json()).toEqual({
			deckId,
			entries: [],
			totals: { required: 0, exact: 0, alternate: 0, missing: 0 }
		});
		mocks.snapshot.mockRejectedValue(new Error('Database unavailable'));
		await expect(GET(event())).rejects.toThrow('Database unavailable');
	});
});
