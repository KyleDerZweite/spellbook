import { ensureDeckCatalogFixture } from '../deck-catalog-fixture.ts';
import type { AuthUser } from '@spellbook/contracts/auth.ts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

run('MTG repository bulk operations', () => {
	let modules: Awaited<ReturnType<typeof loadModules>>;
	let accountId: string;
	let actor: AuthUser;

	beforeAll(async () => {
		modules = await loadModules();
		deckFixture = await ensureDeckCatalogFixture(modules.pool);
	});

	beforeEach(async () => {
		const account = await modules.application.auth.authenticate(
			'register',
			`deck_${crypto.randomUUID().slice(0, 8)}`,
			'deck-integration-fixture-password'
		);
		if (!account) throw new Error('Fixture registration failed');
		actor = account.user;
		accountId = actor.accountId;
	});

	afterAll(async () => {
		await modules?.pool.end();
	});

	it('inventory bulk add is idempotent by requestId', async () => {
		const input = {
			requestId: crypto.randomUUID(),
			source: 'mobile' as const,
			game: 'mtg' as const,
			operations: [inventoryAddOperation('card-1', 2)]
		};

		await modules.bulkMutateInventory(actor, input);
		const snapshot = await modules.bulkMutateInventory(actor, input);

		expect(snapshot.changes).toHaveLength(1);
		expect(snapshot.changes[0].quantity).toBe(2);
	});

	it('inventory bulk set, decrement, and remove update safely', async () => {
		const added = await modules.bulkMutateInventory(actor, {
			requestId: crypto.randomUUID(),
			source: 'mobile' as const,
			game: 'mtg' as const,
			operations: [inventoryAddOperation('card-2', 4)]
		});
		const entryId = added.changes[0].entryId;

		let snapshot = await modules.bulkMutateInventory(actor, {
			requestId: crypto.randomUUID(),
			source: 'mobile' as const,
			game: 'mtg' as const,
			operations: [{ op: 'set', target: { entryId }, quantity: 3, notes: 'binder 1', notesRevision: '0' }]
		});
		expect(snapshot.cards[0]).toMatchObject({ quantity: 3, notes: 'binder 1', notesRevision: '0' });

		snapshot = await modules.bulkMutateInventory(actor, {
			requestId: crypto.randomUUID(),
			source: 'mobile' as const,
			game: 'mtg' as const,
			operations: [{ op: 'decrement', target: { entryId }, quantity: 3 }]
		});
		expect(snapshot.removedEntryIds).toEqual([entryId]);

		await expect(modules.bulkMutateInventory(actor, {requestId:crypto.randomUUID(),source:'mobile',operations:[{op:'remove',target:{entryId}}]})).rejects.toThrow('not found');
	});

	it('deck bulk add merges same card and role', async () => {
		const [deck] = await modules.createDeck(actor, {
			game: 'mtg' as const,
			name: 'Test Deck',
			description: '',
			format: 'Standard'
		});

		const cards = await modules.bulkMutateDeckCards(actor, {
			requestId: crypto.randomUUID(),
			source: 'mobile' as const,
			game: 'mtg' as const,
			deckId: deck.id,
			operations: [deckAddOperation(2), deckAddOperation(3)]
		});

		expect(await modules.getDeckCardsForDeck(actor, deck.id)).toMatchObject([{ quantity: 5 }]);
	});

	it('deck bulk set and remove are scoped to the authenticated account', async () => {
		const [deck] = await modules.createDeck(actor, {
			game: 'mtg' as const,
			name: 'Scoped Deck',
			description: '',
			format: 'Standard'
		});
		const cards = await modules.bulkMutateDeckCards(actor, {
			requestId: crypto.randomUUID(),
			source: 'mobile' as const,
			game: 'mtg' as const,
			deckId: deck.id,
			operations: [deckAddOperation(2)]
		});
		const entryId = cards.changes[0].entryId;

		await modules.bulkMutateDeckCards(actor, {
			requestId: crypto.randomUUID(),
			source: 'mobile' as const,
			game: 'mtg' as const,
			deckId: deck.id,
			operations: [{ op: 'set', target: { entryId }, quantity: 1 }]
		});
		expect((await modules.getDeckCardsForDeck(actor, deck.id))[0].quantity).toBe(1);

		await expect(
			modules.removeDeckCard(
				{ ...actor, accountId: `other-${accountId}` },
				entryId,
				crypto.randomUUID()
			)
		).rejects.toMatchObject({ kind: 'Unauthenticated' });
		expect(await modules.getDeckCardsForDeck(actor, deck.id)).toHaveLength(1);
	});
});

async function loadModules() {
	const [{ db, pool }, schema, inventory, decks] = await Promise.all([
		import('../../src/lib/server/db/client'),
		import('../../src/lib/server/db/schema'),
		import('../../src/lib/server/data/inventory'),
		import('../../src/lib/server/data/decks')
	]);
	const { application } = await import('../../src/lib/server/composition.ts');
	return { db, pool, application, ...schema, ...inventory, ...decks };
}

function inventoryAddOperation(cardId: string, quantity: number) {
	return {
		op: 'add' as const,
		card: deckFixture,
		finish: 'nonfoil',
		condition: 'NM',
		quantity
	};
}

let deckFixture: Awaited<ReturnType<typeof ensureDeckCatalogFixture>>;

function deckAddOperation(quantity: number) {
	return {
		op: 'add' as const,
		card: deckFixture,
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
