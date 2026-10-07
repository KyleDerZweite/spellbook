import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
	createDatabase,
	createLocalAuth,
	createCatalog,
	createDecks,
	createCategories
} from '@spellbook/backend';
import type { AuthUser } from '@spellbook/contracts/auth.ts';
import { ensureDeckCatalogFixture } from '../deck-catalog-fixture.ts';
const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;
run('primary category decisions through authorized applications', () => {
	let database: ReturnType<typeof createDatabase>,
		auth: ReturnType<typeof createLocalAuth>,
		decks: ReturnType<typeof createDecks>,
		categories: ReturnType<typeof createCategories>,
		actor: AuthUser,
		card: Awaited<ReturnType<typeof ensureDeckCatalogFixture>>;
	beforeAll(async () => {
		database = createDatabase(process.env.TEST_DATABASE_URL!);
		auth = createLocalAuth(database.db, { demoMode: false });
		decks = createDecks(database.db, createCatalog(database.pool), auth);
		categories = createCategories(database.db, auth);
		card = await ensureDeckCatalogFixture(database.pool);
		const account = await auth.authenticate(
			'register',
			'categories_' + randomUUID().slice(0, 8),
			'category-integration-password'
		);
		if (!account) throw Error('Fixture registration');
		actor = account.user;
	});
	afterAll(async () => {
		await database.pool.query('DELETE FROM user_profiles WHERE account_id=$1', [actor.accountId]);
		await database.pool.end();
	});
	it('retains explicit Manual Uncategorized across quantity/import additions and replay', async () => {
		const deck = await decks.createDeckRecord(actor, {
			game: 'mtg',
			name: 'Categories',
			description: '',
			format: 'Modern'
		});
		const added = await decks.bulkMutateDeckCards(actor, {
			deckId: deck.id,
			requestId: randomUUID(),
			source: 'web',
			game: 'mtg',
			operations: [{ op: 'add', card, quantity: 1, role: 'main' }]
		});
		const entryId = added.changes[0].entryId;
		const initial = await categories.getDeckEntryCategories(actor, deck.id);
		expect(initial.definitions).toHaveLength(8);
		expect(initial.decisions[0].state).toBe('Pending');
		const input = {
			deckId: deck.id,
			entryId,
			categoryId: null,
			expectedDecisionRevision: initial.decisionRevision,
			requestId: randomUUID()
		};
		const ack = await categories.setEntryCategory(actor, input);
		await decks.bulkMutateDeckCards(actor, {
			deckId: deck.id,
			requestId: randomUUID(),
			source: 'import',
			game: 'mtg',
			operations: [{ op: 'add', card, quantity: 2, role: 'main' }]
		});
		expect(await categories.setEntryCategory(actor, input)).toEqual(ack);
		const latest = await categories.getDeckEntryCategories(actor, deck.id);
		expect(latest.decisions[0]).toMatchObject({ state: 'Manual', categoryId: null });
		expect((await decks.getDeckCardsForDeck(actor, deck.id))[0].quantity).toBe(3);
		await expect(
			categories.setEntryCategory(actor, { ...input, requestId: randomUUID() })
		).rejects.toMatchObject({ kind: 'CategoryConflict' });
	});
});
