import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	snapshot: vi.fn(),
	deck: vi.fn(),
	library: vi.fn(),
	libraryCategories: vi.fn(),
	whole: vi.fn(),
	search: vi.fn(),
	legality: vi.fn(),
	add: vi.fn(),
	categories: vi.fn()
}));
vi.mock('../../src/lib/server/data/decks', async () => ({
	...(await vi.importActual<typeof import('../../src/lib/server/data/decks')>(
		'@spellbook/backend/decks/application.ts'
	)),
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
	changeDeckPrinting: vi.fn(),
	importIntoDeck: vi.fn()
}));
vi.mock('../../src/lib/server/catalog/search', () => ({ getPrintings: vi.fn() }));
vi.mock('../../src/lib/server/mtg/import', () => ({ previewMtgImport: vi.fn() }));
vi.mock('../../src/lib/server/composition.ts', async () => {
	const { CategoryNotFound, CategoryConflict, CategoryMergeConflict } =
		await vi.importActual<typeof import('@spellbook/backend')>('@spellbook/backend');
	return {
		CategoryNotFound,
		CategoryConflict,
		CategoryMergeConflict,
		application: {
			decks: {
				search: mocks.search,
				ownership: vi.fn().mockResolvedValue([]),
				getDeck: mocks.deck,
				getDeckLibrary: mocks.library,
				getDeckLibraryCategories: mocks.libraryCategories
			},
			categories: { getDeckEntryCategories: mocks.categories, getDeckWholeCategories: mocks.whole }
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
	vi.clearAllMocks();
	mocks.deck.mockResolvedValue({
		decks: [{ id: 'owned', format: 'Modern' }],
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
		query: { query: '', format: '', categoryVersionIds: [], sort: 'updated:desc' },
		queryKey: 'query',
		revision: '0',
		offset: 0,
		limit: 200,
		matchingTotal: 1001,
		globalTotal: 1001,
		items: []
	});
	mocks.libraryCategories.mockResolvedValue({
		revision: '0',
		items: [],
		selected: [],
		total: 0,
		offset: 0,
		limit: 200
	});
	mocks.whole.mockResolvedValue({ deckId: 'owned', definitions: [], decisions: [] });
	mocks.legality.mockResolvedValue({ warnings: [], deckDocuments: {} });
	mocks.categories.mockResolvedValue({
		deckId: 'owned',
		initialized: false,
		decisionRevision: '0',
		definitions: [],
		decisions: [],
		sourceStatus: { kind: 'NeverAttempted', sourceTime: null }
	});
});

describe('web deck boundaries', () => {
	it('opens the library without implicitly selecting a deck', async () => {
		const result = await load(event() as Parameters<typeof load>[0]);
		expect(result).toMatchObject({
			selectedDeckId: null,
			decks: [],
			deckLibrary: { limit: 200, matchingTotal: 1001 }
		});
		expect(mocks.snapshot).not.toHaveBeenCalled();
		expect(mocks.deck).not.toHaveBeenCalled();
		expect(mocks.library).toHaveBeenCalledWith(
			expect.objectContaining({ accountId: 'owner' }),
			expect.objectContaining({ offset: 0, limit: 200 })
		);
		expect(mocks.legality).not.toHaveBeenCalled();
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
});
