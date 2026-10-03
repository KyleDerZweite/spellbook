import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

run('deck builder transactions', () => {
	let modules: Awaited<ReturnType<typeof loadModules>>;
	let accountId: string;
	beforeAll(async () => {
		modules = await loadModules();
	});
	beforeEach(async () => {
		accountId = `deck-test-${crypto.randomUUID()}`;
		await modules.db
			.insert(modules.userProfiles)
			.values({ accountId, username: accountId, email: `${accountId}@example.test` });
	});
	afterEach(async () => {
		await modules.db
			.delete(modules.userProfiles)
			.where(eq(modules.userProfiles.accountId, accountId));
	});
	afterAll(async () => {
		await modules?.pool.end();
	});

	const deckInput = { game: 'mtg', name: 'Builder', description: '', format: 'Modern' };
	const operation = (quantity = 1, role: 'main' | 'sideboard' = 'main') => ({
		op: 'add' as const,
		quantity,
		role,
		card: {
			catalogCardId: 'printing',
			canonicalCardId: 'oracle',
			name: 'Opt',
			setCode: 'sta',
			imageUri: ''
		}
	});

	it('serves owned availability from real deck and inventory data without reserving copies', async () => {
		const deck = await modules.createDeckRecord(accountId, deckInput);
		await modules.bulkMutateDeckCards(accountId, {
			requestId: crypto.randomUUID(),
			source: 'web',
			game: 'mtg',
			deckId: deck.id,
			operations: [operation(), operation(1, 'sideboard')]
		});
		await modules.bulkMutateInventory(accountId, {
			requestId: crypto.randomUUID(),
			source: 'web',
			game: 'mtg',
			operations: [{ ...operation(), finish: 'nonfoil', condition: 'NM' }]
		});
		const { GET } =
			await import('../../src/routes/api/mobile/v1/mtg/decks/[deckId]/availability/+server');
		const request = {
			params: { deckId: deck.id },
			locals: { user: { accountId, username: accountId, email: `${accountId}@example.test` } },
			request: new Request(`http://localhost/api/mobile/v1/mtg/decks/${deck.id}/availability`)
		} as Parameters<typeof GET>[0];
		const response = await GET(request);
		expect(await response.json()).toMatchObject({
			deckId: deck.id,
			entries: expect.any(Array),
			totals: { required: 2, exact: 1, alternate: 0, missing: 1 }
		});
		expect((await modules.getDeckSnapshot(accountId)).inventoryCards[0].quantity).toBe(1);
		request.locals.user!.accountId = 'foreign-account';
		await expect(GET(request)).rejects.toMatchObject({ status: 404 });
	});

	it('rejects changed bulk payloads without changing the deck', async () => {
		const deck = await modules.createDeckRecord(accountId, deckInput);
		const input = {
			requestId: crypto.randomUUID(),
			source: 'web',
			game: 'mtg',
			deckId: deck.id,
			operations: [operation(2)]
		};
		await modules.bulkMutateDeckCards(accountId, input);
		await expect(
			modules.bulkMutateDeckCards(accountId, { ...input, operations: [operation(3)] })
		).rejects.toMatchObject({ name: 'RequestConflictError' });
		await expect(
			modules.bulkMutateDeckCards(accountId, { ...input, source: 'mobile' })
		).rejects.toMatchObject({ name: 'RequestConflictError' });
		expect(await modules.getDeckCardsForDeck(accountId, deck.id)).toMatchObject([{ quantity: 2 }]);
	});

	it('binds import retries to normalized metadata and rejects keys used by bulk mutations', async () => {
		const input = {
			...deckInput,
			requestId: crypto.randomUUID(),
			source: 'import',
			operations: [operation(2)]
		};
		const deck = await modules.importDeck(accountId, input);
		expect(
			(
				await modules.importDeck(accountId, {
					...input,
					name: ` ${input.name} `,
					description: ' ',
					format: ` ${input.format} `
				})
			).id
		).toBe(deck.id);
		for (const change of [
			{ name: 'Different' },
			{ description: 'Different' },
			{ format: 'Legacy' },
			{ operations: [operation(3)] }
		]) {
			await expect(modules.importDeck(accountId, { ...input, ...change })).rejects.toMatchObject({
				name: 'RequestConflictError'
			});
		}
		const requestId = crypto.randomUUID();
		await modules.bulkMutateDeckCards(accountId, {
			requestId,
			source: 'import',
			game: 'mtg',
			deckId: deck.id,
			operations: [operation()]
		});
		await expect(modules.importDeck(accountId, { ...input, requestId })).rejects.toMatchObject({
			name: 'RequestConflictError'
		});
		const snapshot = await modules.getDeckSnapshot(accountId);
		expect(snapshot.decks).toHaveLength(1);
		expect(snapshot.deckCards).toMatchObject([{ quantity: 3 }]);
	});

	it('preserves legacy request deduplication for null fingerprints', async () => {
		const deck = await modules.createDeckRecord(accountId, deckInput);
		const input = {
			requestId: crypto.randomUUID(),
			source: 'web',
			game: 'mtg',
			deckId: deck.id,
			operations: [operation(2)]
		};
		await modules.bulkMutateDeckCards(accountId, input);
		await modules.db
			.update(modules.deckMutationRequests)
			.set({ requestHash: null })
			.where(eq(modules.deckMutationRequests.requestId, input.requestId));
		await modules.bulkMutateDeckCards(accountId, { ...input, operations: [operation(3)] });
		expect(await modules.getDeckCardsForDeck(accountId, deck.id)).toMatchObject([{ quantity: 2 }]);
	});

	it('claims concurrent duplicate requests exactly once', async () => {
		const deck = await modules.createDeckRecord(accountId, deckInput);
		const input = {
			requestId: crypto.randomUUID(),
			source: 'web',
			game: 'mtg',
			deckId: deck.id,
			operations: [operation(2)]
		};
		await Promise.all(
			Array.from({ length: 8 }, () => modules.bulkMutateDeckCards(accountId, input))
		);
		expect(await modules.getDeckCardsForDeck(accountId, deck.id)).toMatchObject([{ quantity: 2 }]);
	});

	it('serializes concurrent decrements without losing updates', async () => {
		const deck = await modules.createDeckRecord(accountId, deckInput);
		const [entry] = await modules.bulkMutateDeckCards(accountId, {
			requestId: crypto.randomUUID(),
			source: 'web',
			game: 'mtg',
			deckId: deck.id,
			operations: [operation(10)]
		});
		await Promise.all(
			Array.from({ length: 8 }, () =>
				modules.bulkMutateDeckCards(accountId, {
					requestId: crypto.randomUUID(),
					source: 'web',
					game: 'mtg',
					deckId: deck.id,
					operations: [{ op: 'decrement', target: { entryId: entry.id }, quantity: 1 }]
				})
			)
		);
		expect(await modules.getDeckCardsForDeck(accountId, deck.id)).toMatchObject([{ quantity: 2 }]);
	});

	it('merges destination role quantities atomically', async () => {
		const deck = await modules.createDeckRecord(accountId, deckInput);
		const cards = await modules.bulkMutateDeckCards(accountId, {
			requestId: crypto.randomUUID(),
			source: 'web',
			game: 'mtg',
			deckId: deck.id,
			operations: [operation(2), operation(3, 'sideboard')]
		});
		const main = cards.find((card) => card.role === 'main')!;
		await modules.updateDeckCard(accountId, main.id, 4, 'sideboard');
		expect(await modules.getDeckCardsForDeck(accountId, deck.id)).toMatchObject([
			{ quantity: 7, role: 'sideboard' }
		]);
	});

	it('imports one deck for concurrent retries', async () => {
		const input = {
			...deckInput,
			requestId: crypto.randomUUID(),
			source: 'import',
			operations: [operation(4)]
		};
		const result = await Promise.all(
			Array.from({ length: 8 }, () => modules.importDeck(accountId, input))
		);
		expect(new Set(result.map((deck) => deck.id)).size).toBe(1);
		const snapshot = await modules.getDeckSnapshot(accountId);
		expect(snapshot.decks).toHaveLength(1);
		expect(snapshot.deckCards).toMatchObject([{ quantity: 4 }]);
	});

	it('rolls back new deck and request when a later imported card fails', async () => {
		const requestId = crypto.randomUUID();
		await expect(
			modules.importDeck(accountId, {
				...deckInput,
				requestId,
				source: 'import',
				operations: [operation(2147483647), operation()]
			})
		).rejects.toThrow();
		const snapshot = await modules.getDeckSnapshot(accountId);
		expect(snapshot.decks).toEqual([]);
		expect(snapshot.deckCards).toEqual([]);
		expect(snapshot.mutationRequests).toEqual([]);
		await modules.importDeck(accountId, {
			...deckInput,
			requestId,
			source: 'import',
			operations: [operation()]
		});
		expect((await modules.getDeckSnapshot(accountId)).decks).toHaveLength(1);
	});

	it('rejects request reuse for another deck and cross-account mutations', async () => {
		const first = await modules.createDeckRecord(accountId, deckInput);
		const second = await modules.createDeckRecord(accountId, deckInput);
		const input = {
			requestId: crypto.randomUUID(),
			source: 'web',
			game: 'mtg',
			deckId: first.id,
			operations: [operation()]
		};
		await modules.bulkMutateDeckCards(accountId, input);
		await expect(
			modules.bulkMutateDeckCards(accountId, { ...input, deckId: second.id })
		).rejects.toThrow('another deck');
		await expect(
			modules.bulkMutateDeckCards('other', { ...input, requestId: crypto.randomUUID() })
		).rejects.toThrow('Deck not found');
		expect(await modules.getDeckCardsForDeck(accountId, second.id)).toEqual([]);
	});
});

async function loadModules() {
	const [{ db, pool }, schema, decks, inventory] = await Promise.all([
		import('../../src/lib/server/db/client'),
		import('../../src/lib/server/db/schema'),
		import('../../src/lib/server/data/decks'),
		import('../../src/lib/server/data/inventory')
	]);
	return { db, pool, ...schema, ...decks, ...inventory };
}
