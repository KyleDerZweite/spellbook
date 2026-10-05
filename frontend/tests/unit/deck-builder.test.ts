import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeckCard } from '../../src/lib/server/data/types';

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), mutate: vi.fn(), snapshot: vi.fn() }));
vi.mock('../../src/lib/server/catalog/search.ts', () => ({
	getCatalogPrinting: mocks.lookup,
	searchCatalog: vi.fn()
}));
vi.mock('../../src/lib/server/data/decks', () => ({
	bulkMutateDeckCards: mocks.mutate,
	getDeckSnapshot: mocks.snapshot
}));
import {
	addCatalogCardToDeck,
	changeDeckPrinting,
	exportDecklist
} from '../../src/lib/server/mtg/deck-builder';

const id = '11111111-1111-4111-8111-111111111111';
const stored: DeckCard = {
	id: 'entry',
	deckId: 'deck',
	accountId: 'account',
	game: 'mtg',
	catalogCardId: id,
	canonicalCardId: 'oracle',
	name: 'Opt',
	setCode: 'sta',
	imageUri: '',
	quantity: 2,
	role: 'main',
	createdAt: new Date(),
	updatedAt: new Date()
};
beforeEach(() => {
	vi.clearAllMocks();
	mocks.lookup.mockResolvedValue({
		id,
		oracle_id: 'oracle',
		name: 'Opt',
		set_code: 'sta',
		collector_number: '19',
		image_uri: 'trusted-image'
	});
});

describe('deck builder catalog boundaries', () => {
	it('adds identity from the catalog and preserves the request ID', async () => {
		await addCatalogCardToDeck('account', {
			deckId: 'deck',
			catalogCardId: id,
			quantity: 2,
			role: 'main',
			requestId: 'retry-key'
		});
		expect(mocks.lookup).toHaveBeenCalledWith(id);
		expect(mocks.mutate).toHaveBeenCalledWith(
			'account',
			expect.objectContaining({
				requestId: 'retry-key',
				operations: [
					expect.objectContaining({
						card: {
							catalogCardId: id,
							canonicalCardId: 'oracle',
							name: 'Opt',
							setCode: 'sta',
							imageUri: 'trusted-image'
						},
						quantity: 2
					})
				]
			})
		);
	});
	it('exports exact collector numbers and retains a working export when catalog is unavailable', async () => {
		expect(await exportDecklist([stored])).toBe('Deck\n2 Opt (STA) 19\n');
		mocks.lookup.mockRejectedValue(new Error('Catalog unavailable'));
		expect(await exportDecklist([stored])).toBe('Deck\n2 Opt (STA)\n');
	});
});

describe('printing changes', () => {
	const input = {
		entryId: 'entry',
		catalogCardId: id,
		quantity: 3,
		role: 'sideboard',
		requestId: 'retry'
	};
	it('checks account ownership before changing an entry', async () => {
		mocks.snapshot.mockResolvedValue({ deckCards: [] });
		await expect(changeDeckPrinting('account', input)).rejects.toThrow('Deck entry not found');
		expect(mocks.mutate).not.toHaveBeenCalled();
	});
	it('rejects a different canonical card', async () => {
		mocks.snapshot.mockResolvedValue({ deckCards: [stored] });
		mocks.lookup.mockResolvedValue({ id, oracle_id: 'other' });
		await expect(changeDeckPrinting('account', input)).rejects.toThrow('same card');
		expect(mocks.mutate).not.toHaveBeenCalled();
	});
	it('replaces a printing in one atomic mutation with trusted identity', async () => {
		mocks.snapshot.mockResolvedValue({ deckCards: [stored] });
		await changeDeckPrinting('account', input);
		expect(mocks.mutate).toHaveBeenCalledWith(
			'account',
			expect.objectContaining({
				deckId: 'deck',
				requestId: 'retry',
				operations: [
					{ op: 'remove', target: { entryId: 'entry' } },
					expect.objectContaining({
						op: 'add',
						quantity: 3,
						role: 'sideboard',
						card: expect.objectContaining({ canonicalCardId: 'oracle' })
					})
				]
			})
		);
	});
});
