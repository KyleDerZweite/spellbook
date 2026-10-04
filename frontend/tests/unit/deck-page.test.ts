import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	snapshot: vi.fn(),
	search: vi.fn(),
	legality: vi.fn(),
	add: vi.fn()
}));
vi.mock('../../src/lib/server/data/decks', () => ({
	getDeckSnapshot: mocks.snapshot,
	createDeckRecord: vi.fn(),
	deleteDeck: vi.fn(),
	removeDeckCard: vi.fn(),
	updateDeck: vi.fn(),
	updateDeckCard: vi.fn()
}));
vi.mock('../../src/lib/server/mtg/deck-builder', () => ({
	searchDeckCatalog: mocks.search,
	getDeckLegality: mocks.legality,
	addCatalogCardToDeck: mocks.add,
	importIntoDeck: vi.fn()
}));
vi.mock('../../src/lib/server/catalog/search', () => ({ getPrintings: vi.fn() }));
vi.mock('../../src/lib/server/mtg/import', () => ({ previewMtgImport: vi.fn() }));
import { actions, load } from '../../src/routes/decks/+page.server';

function event(url = 'http://localhost/decks', fields: Record<string, string> = {}) {
	return {
		locals: { user: { accountId: 'owner', username: 'Owner', email: 'owner@example.test' } },
		url: new URL(url),
		request: new Request(url, { method: 'POST', body: new URLSearchParams(fields) })
	} as Parameters<typeof actions.addCard>[0];
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.snapshot.mockResolvedValue({
		decks: [{ id: 'owned', format: 'Modern' }],
		deckCards: [],
		inventoryCards: []
	});
	mocks.legality.mockResolvedValue([]);
});

describe('web deck boundaries', () => {
	it('requires a session for every action before reading or mutating data', async () => {
		for (const action of Object.values(actions)) {
			const request = event();
			request.locals.user = null;
			await expect(action(request)).rejects.toMatchObject({
				status: 303,
				location: '/auth/login?returnTo=/decks'
			});
		}
		expect(mocks.snapshot).not.toHaveBeenCalled();
		expect(mocks.add).not.toHaveBeenCalled();
	});
	it('rejects selecting a deck absent from the account snapshot', async () => {
		await expect(
			load(event('http://localhost/decks?deck=someone-elses') as Parameters<typeof load>[0])
		).rejects.toMatchObject({ status: 404 });
		expect(mocks.snapshot).toHaveBeenCalledWith('owner', 'mtg');
	});
	it('preserves editable deck data when catalog search and legality checks fail', async () => {
		mocks.search.mockRejectedValue(new Error('offline'));
		mocks.legality.mockRejectedValue(new Error('offline'));
		const result = await load(event('http://localhost/decks?q=Opt') as Parameters<typeof load>[0]);
		expect(result).toMatchObject({
			selectedDeckId: 'owned',
			catalogCards: [],
			catalogError: expect.any(String),
			legalityError: expect.any(String),
			decks: [{ id: 'owned' }]
		});
	});
	it('sends only the selected printing ID to the trusted catalog helper', async () => {
		await actions.addCard(
			event('http://localhost/decks?/addCard', {
				deckId: 'owned',
				catalogCardId: 'printing',
				canonicalCardId: 'forged',
				name: 'forged',
				quantity: '2',
				role: 'main',
				requestId: 'retry'
			})
		);
		expect(mocks.add).toHaveBeenCalledWith('owner', {
			deckId: 'owned',
			catalogCardId: 'printing',
			quantity: 2,
			role: 'main',
			requestId: 'retry'
		});
	});
});
