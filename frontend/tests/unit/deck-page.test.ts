import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	snapshot: vi.fn(),
	deck: vi.fn(),
	library: vi.fn(),
	discover: vi.fn(),
	copyReferenceDeck: vi.fn(),
	search: vi.fn(),
	legality: vi.fn(),
	add: vi.fn(),
	updateDeck: vi.fn(),
	createDeckRecord: vi.fn()
}));
vi.mock('../../src/lib/server/data/decks', async () => ({
	...(await vi.importActual<typeof import('../../src/lib/server/data/decks')>(
		'#lib/server/remote/errors.ts'
	)),
	getDeckSnapshot: mocks.snapshot,
	createDeckRecord: mocks.createDeckRecord,
	deleteDeck: vi.fn(),
	removeDeckCard: vi.fn(),
	updateDeck: mocks.updateDeck,
	updateDeckCard: vi.fn()
}));
vi.mock('../../src/lib/server/mtg/deck-builder', () => ({
	searchDeckCatalog: mocks.search,
	getDeckLegality: mocks.legality,
	addCatalogCardToDeck: mocks.add,
	changeDeckPrinting: vi.fn(),
	importIntoDeck: vi.fn()
}));
vi.mock('../../src/lib/server/catalog/search', () => ({ getPrintings: vi.fn() }));
vi.mock('../../src/lib/server/composition.ts', async () => {
	return {
		application: {
			decks: {
				search: mocks.search,
				ownership: vi.fn().mockResolvedValue([]),
				getDeck: mocks.deck,
				getDeckLibrary: mocks.library,
				discoverReferenceDecks: mocks.discover,
				copyReferenceDeck: mocks.copyReferenceDeck
			}
		}
	};
});
import { actions, load } from '../../src/routes/mtg/decks/+page.server';

function event(url = 'http://localhost/mtg/decks', fields: Record<string, string> = {}) {
	return {
		locals: { user: { accountId: 'owner', username: 'Owner', email: 'owner@example.test' } },
		url: new URL(url),
		request: new Request(url, { method: 'POST', body: new URLSearchParams(fields) })
	} as Parameters<typeof actions.addCard>[0];
}

beforeEach(() => {
	vi.resetAllMocks();
	mocks.deck.mockResolvedValue({
		relatedTokens: { status: 'unavailable', items: [], unresolved: [], unavailableEntryIds: [] },
		decks: [
			{
				id: 'owned',
				format: 'Modern',
				accountId: 'owner',
				game: 'mtg',
				name: 'Owned Deck',
				description: '',
				assembled: false,
				descriptionRevision: '0',
				compositionRevision: '0',
				createdAt: '2026-10-08T00:00:00Z',
				updatedAt: '2026-10-08T00:00:00Z'
			}
		],
		deckCards: [],
		ownedByCanonical: {},
		ownedPrintings: [],
		deckTotals: {},
		deckCovers: {},
		availability: {},
		valueEstimates: null,
		valuationError: null
	});
	mocks.library.mockResolvedValue({
		query: { query: '', format: '', sort: 'updated:desc' },
		queryKey: 'query',
		revision: '0',
		offset: 0,
		limit: 200,
		matchingTotal: 1001,
		globalTotal: 1001,
		items: []
	});

	mocks.legality.mockResolvedValue({ warnings: [], deckDocuments: {} });
});

describe('web deck boundaries', () => {
	it('opens the library without implicitly selecting a deck', async () => {
		const result = await load(event() as Parameters<typeof load>[0]);
		expect(result).toMatchObject({
			tab: 'library',
			selectedDeckId: null,
			decks: [],
			deckLibrary: { limit: 200, matchingTotal: 1001 }
		});
		expect(mocks.snapshot).not.toHaveBeenCalled();
		expect(mocks.deck).not.toHaveBeenCalled();
		expect(mocks.discover).not.toHaveBeenCalled();
		expect(mocks.library).toHaveBeenCalledWith(
			expect.objectContaining({ accountId: 'owner' }),
			expect.objectContaining({ offset: 0, limit: 200 })
		);
		expect(mocks.legality).not.toHaveBeenCalled();
	});
	it('loads SuperBrew Discovery when tab=discovery is active and copies reference decks in one click', async () => {
		mocks.discover.mockResolvedValue({
			decks: [],
			total: 0,
			limit: 24,
			offset: 0,
			inventoryMode: 'free',
			sort: 'missing_cost:asc',
			assembledDeckCount: 1,
			valuationAvailable: true,
			evaluatedAt: '2026-11-27T10:00:00.000Z',
			availableFormats: ['standard', 'modern'],
			sources: []
		});
		const result = await load(
			event(
				'http://localhost/mtg/decks?tab=discovery&discFormat=modern&discBudget=25&discMode=free'
			) as Parameters<typeof load>[0]
		);
		expect(result).toMatchObject({
			tab: 'discovery',
			selectedDeckId: null,
			discovery: { assembledDeckCount: 1, inventoryMode: 'free' }
		});
		expect(mocks.library).not.toHaveBeenCalled();
		expect(mocks.discover).toHaveBeenCalledWith(
			expect.objectContaining({ accountId: 'owner' }),
			expect.objectContaining({
				format: 'modern',
				maxMissingCost: 25,
				inventoryMode: 'free',
				sort: 'missing_cost:asc'
			})
		);

		mocks.copyReferenceDeck.mockResolvedValue({
			deck: { id: 'new-deck-1' },
			copiedCards: 75,
			skippedCards: 0
		});
		await expect(
			actions.copyReferenceDeck(
				event('http://localhost/mtg/decks?tab=discovery', {
					referenceDeckId: '11111111-1111-4111-8111-111111111111'
				})
			)
		).rejects.toMatchObject({ status: 303, location: '/mtg/decks?deck=new-deck-1' });
	});
	it('keeps the independently selected Deck when directory evidence fails', async () => {
		mocks.library.mockRejectedValue(new Error('Directory unavailable'));
		const result = await load(
			event('http://localhost/mtg/decks?deck=owned') as Parameters<typeof load>[0]
		);
		expect(result).toMatchObject({
			selectedDeckId: 'owned',
			decks: [{ id: 'owned' }],
			deckLibraryReadError: expect.any(String)
		});
		expect(mocks.deck).toHaveBeenCalled();
	});
	it('requires a session for every action before reading or mutating data', async () => {
		for (const action of Object.values(actions)) {
			const request = event();
			request.locals.user = null;
			await expect(action(request)).rejects.toMatchObject({
				status: 303,
				location: '/auth/login?returnTo=/mtg/decks'
			});
		}
		expect(mocks.snapshot).not.toHaveBeenCalled();
		expect(mocks.add).not.toHaveBeenCalled();
	});
	it('rejects selecting a deck absent from the independent authorized read', async () => {
		await expect(
			load(event('http://localhost/mtg/decks?deck=someone-elses') as Parameters<typeof load>[0])
		).rejects.toMatchObject({ status: 404 });
		expect(mocks.deck).toHaveBeenCalledWith(
			{ accountId: 'owner', username: 'Owner', email: 'owner@example.test' },
			'someone-elses'
		);
	});
	it('preserves editable deck data when catalog search and legality checks fail', async () => {
		mocks.search.mockRejectedValue(new Error('offline'));
		mocks.legality.mockRejectedValue(new Error('offline'));
		const result = await load(
			event('http://localhost/mtg/decks?deck=owned&q=Opt') as Parameters<typeof load>[0]
		);
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
			event('http://localhost/mtg/decks?/addCard', {
				deckId: 'owned',
				catalogCardId: 'printing',
				canonicalCardId: 'forged',
				name: 'forged',
				quantity: '2',
				role: 'main',
				requestId: 'retry'
			})
		);
		expect(mocks.add).toHaveBeenCalledWith(
			{ accountId: 'owner', username: 'Owner', email: 'owner@example.test' },
			{
				deckId: 'owned',
				catalogCardId: 'printing',
				quantity: 2,
				role: 'main',
				requestId: 'retry'
			}
		);
	});
	it('toggles assembled status on a deck via toggleAssembled action', async () => {
		mocks.updateDeck.mockResolvedValue({
			id: 'owned',
			assembled: true
		});
		const result = await actions.toggleAssembled(
			event('http://localhost/mtg/decks?/toggleAssembled', {
				deckId: 'owned',
				assembled: 'true'
			})
		);
		expect(mocks.updateDeck).toHaveBeenCalledWith(
			{ accountId: 'owner', username: 'Owner', email: 'owner@example.test' },
			{ deckId: 'owned', assembled: true }
		);
		expect(result).toMatchObject({ success: true, savedDetails: { id: 'owned', assembled: true } });
	});
});
