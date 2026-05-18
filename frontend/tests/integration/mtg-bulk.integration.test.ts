import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

run('MTG repository bulk operations', () => {
	let modules: Awaited<ReturnType<typeof loadModules>>;
	let accountId: string;

	beforeAll(async () => {
		modules = await loadModules();
	});

	beforeEach(async () => {
		accountId = `test-${crypto.randomUUID()}`;
		await modules.db.insert(modules.userProfiles).values({
			accountId,
			username: accountId,
			email: `${accountId}@example.test`
		});
	});

	afterAll(async () => {
		await modules?.pool.end();
	});

	it('inventory bulk add is idempotent by requestId', async () => {
		const input = {
			requestId: crypto.randomUUID(),
			source: 'mobile',
			game: 'mtg',
			operations: [inventoryAddOperation('card-1', 2)]
		};

		await modules.bulkMutateInventory(accountId, input);
		const snapshot = await modules.bulkMutateInventory(accountId, input);

		expect(snapshot.cards).toHaveLength(1);
		expect(snapshot.cards[0].quantity).toBe(2);
	});

	it('inventory bulk set, decrement, and remove update safely', async () => {
		const added = await modules.bulkMutateInventory(accountId, {
			requestId: crypto.randomUUID(),
			source: 'mobile',
			game: 'mtg',
			operations: [inventoryAddOperation('card-2', 4)]
		});
		const entryId = added.cards[0].id;

		let snapshot = await modules.bulkMutateInventory(accountId, {
			requestId: crypto.randomUUID(),
			source: 'mobile',
			game: 'mtg',
			operations: [{ op: 'set', target: { entryId }, quantity: 3, notes: 'binder 1' }]
		});
		expect(snapshot.cards[0]).toMatchObject({ quantity: 3, notes: 'binder 1' });

		snapshot = await modules.bulkMutateInventory(accountId, {
			requestId: crypto.randomUUID(),
			source: 'mobile',
			game: 'mtg',
			operations: [{ op: 'decrement', target: { entryId }, quantity: 3 }]
		});
		expect(snapshot.cards).toHaveLength(0);

		snapshot = await modules.bulkMutateInventory(accountId, {
			requestId: crypto.randomUUID(),
			source: 'mobile',
			game: 'mtg',
			operations: [{ op: 'remove', target: { entryId } }]
		});
		expect(snapshot.cards).toHaveLength(0);
	});

	it('deck bulk add merges same card and role', async () => {
		const [deck] = await modules.createDeck(accountId, {
			game: 'mtg',
			name: 'Test Deck',
			description: '',
			format: 'Standard'
		});

		const cards = await modules.bulkMutateDeckCards(accountId, {
			requestId: crypto.randomUUID(),
			source: 'mobile',
			game: 'mtg',
			deckId: deck.id,
			operations: [deckAddOperation('card-3', 2), deckAddOperation('card-3', 3)]
		});

		expect(cards).toHaveLength(1);
		expect(cards[0].quantity).toBe(5);
	});

	it('deck bulk set and remove are scoped to the authenticated account', async () => {
		const [deck] = await modules.createDeck(accountId, {
			game: 'mtg',
			name: 'Scoped Deck',
			description: '',
			format: 'Standard'
		});
		const cards = await modules.bulkMutateDeckCards(accountId, {
			requestId: crypto.randomUUID(),
			source: 'mobile',
			game: 'mtg',
			deckId: deck.id,
			operations: [deckAddOperation('card-4', 2)]
		});
		const entryId = cards[0].id;

		await modules.bulkMutateDeckCards(accountId, {
			requestId: crypto.randomUUID(),
			source: 'mobile',
			game: 'mtg',
			deckId: deck.id,
			operations: [{ op: 'set', target: { entryId }, quantity: 1 }]
		});
		expect((await modules.getDeckCardsForDeck(accountId, deck.id))[0].quantity).toBe(1);

		await modules.removeDeckCard(`other-${accountId}`, entryId);
		expect(await modules.getDeckCardsForDeck(accountId, deck.id)).toHaveLength(1);
	});
});

async function loadModules() {
	const [{ db, pool }, schema, inventory, decks] = await Promise.all([
		import('../../src/lib/server/db/client'),
		import('../../src/lib/server/db/schema'),
		import('../../src/lib/server/data/inventory'),
		import('../../src/lib/server/data/decks')
	]);
	return { db, pool, ...schema, ...inventory, ...decks };
}

function inventoryAddOperation(cardId: string, quantity: number) {
	return {
		op: 'add' as const,
		card: cardIdentity(cardId),
		finish: 'nonfoil',
		condition: 'NM',
		quantity
	};
}

function deckAddOperation(cardId: string, quantity: number) {
	return {
		op: 'add' as const,
		card: cardIdentity(cardId),
		quantity,
		role: 'main' as const
	};
}

function cardIdentity(cardId: string) {
	return {
		catalogCardId: cardId,
		canonicalCardId: `oracle-${cardId}`,
		name: `Card ${cardId}`,
		setCode: 'tst',
		imageUri: ''
	};
}
