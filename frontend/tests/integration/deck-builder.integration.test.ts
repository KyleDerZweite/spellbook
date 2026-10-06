import type { AuthUser } from '@spellbook/contracts/auth.ts';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

run('deck builder transactions', () => {
	let modules: Awaited<ReturnType<typeof loadModules>>;
	let accountId: string;
	let actor: AuthUser;
	beforeAll(async () => {
		modules = await loadModules();
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
		const deck = await modules.createDeckRecord(actor, deckInput);
		await modules.bulkMutateDeckCards(actor, {
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
			locals: { user: actor },
			request: new Request(`http://localhost/api/mobile/v1/mtg/decks/${deck.id}/availability`)
		} as Parameters<typeof GET>[0];
		const response = await GET(request);
		expect(await response.json()).toMatchObject({
			deckId: deck.id,
			entries: expect.any(Array),
			totals: { required: 2, exact: 1, alternate: 0, missing: 1 }
		});
		expect((await modules.getInventorySnapshot(accountId)).cards[0].quantity).toBe(1);
		request.locals.user = { ...actor, accountId: 'foreign-account' };
		await expect(GET(request)).rejects.toMatchObject({ status: 401 });
	});

	it('rejects changed bulk payloads without changing the deck', async () => {
		const deck = await modules.createDeckRecord(actor, deckInput);
		const input = {
			requestId: crypto.randomUUID(),
			source: 'web',
			game: 'mtg',
			deckId: deck.id,
			operations: [operation(2)]
		};
		await modules.bulkMutateDeckCards(actor, input);
		await expect(
			modules.bulkMutateDeckCards(actor, { ...input, operations: [operation(3)] })
		).rejects.toMatchObject({ name: 'RequestConflictError' });
		await expect(
			modules.bulkMutateDeckCards(actor, { ...input, source: 'mobile' })
		).rejects.toMatchObject({ name: 'RequestConflictError' });
		expect(await modules.getDeckCardsForDeck(actor, deck.id)).toMatchObject([{ quantity: 2 }]);
	});

	it('binds import retries to normalized metadata and rejects keys used by bulk mutations', async () => {
		const input = {
			...deckInput,
			requestId: crypto.randomUUID(),
			source: 'import',
			operations: [operation(2)]
		};
		const deck = await modules.importDeck(actor, input);
		expect(
			(
				await modules.importDeck(actor, {
					...input,
					name: ` ${input.name} `,
					description: ' ',
					format: ` ${input.format} `
				})
			).deckId
		).toBe(deck.deckId);
		for (const change of [
			{ name: 'Different' },
			{ description: 'Different' },
			{ format: 'Legacy' },
			{ operations: [operation(3)] }
		]) {
			await expect(modules.importDeck(actor, { ...input, ...change })).rejects.toMatchObject({
				name: 'RequestConflictError'
			});
		}
		const requestId = crypto.randomUUID();
		await modules.bulkMutateDeckCards(actor, {
			requestId,
			source: 'import',
			game: 'mtg',
			deckId: deck.deckId,
			operations: [operation()]
		});
		await expect(modules.importDeck(actor, { ...input, requestId })).rejects.toMatchObject({
			name: 'RequestConflictError'
		});
		const snapshot = await modules.getDeckSnapshot(
			actor,
			'mtg',
			(await modules.getDeckSnapshot(actor)).decks[0].id
		);
		expect(snapshot.decks).toHaveLength(1);
		expect(snapshot.deckCards).toMatchObject([{ quantity: 3 }]);
	});

	it('preserves legacy request deduplication for null fingerprints', async () => {
		const deck = await modules.createDeckRecord(actor, deckInput);
		const input = {
			requestId: crypto.randomUUID(),
			source: 'web',
			game: 'mtg',
			deckId: deck.id,
			operations: [operation(2)]
		};
		await modules.bulkMutateDeckCards(actor, input);
		await modules.db
			.update(modules.deckMutationRequests)
			.set({ requestHash: null })
			.where(eq(modules.deckMutationRequests.requestId, input.requestId));
		await modules.bulkMutateDeckCards(actor, { ...input, operations: [operation(3)] });
		expect(await modules.getDeckCardsForDeck(actor, deck.id)).toMatchObject([{ quantity: 2 }]);
	});

	it('claims concurrent duplicate requests exactly once', async () => {
		const deck = await modules.createDeckRecord(actor, deckInput);
		const input = {
			requestId: crypto.randomUUID(),
			source: 'web',
			game: 'mtg',
			deckId: deck.id,
			operations: [operation(2)]
		};
		await Promise.all(Array.from({ length: 8 }, () => modules.bulkMutateDeckCards(actor, input)));
		expect(await modules.getDeckCardsForDeck(actor, deck.id)).toMatchObject([{ quantity: 2 }]);
	});

	it('serializes concurrent decrements without losing updates', async () => {
		const deck = await modules.createDeckRecord(actor, deckInput);
		const acknowledgement = await modules.bulkMutateDeckCards(actor, {
			requestId: crypto.randomUUID(),
			source: 'web',
			game: 'mtg',
			deckId: deck.id,
			operations: [operation(10)]
		});
		await Promise.all(
			Array.from({ length: 8 }, () =>
				modules.bulkMutateDeckCards(actor, {
					requestId: crypto.randomUUID(),
					source: 'web',
					game: 'mtg',
					deckId: deck.id,
					operations: [
						{
							op: 'decrement',
							target: { entryId: acknowledgement.changes[0].entryId },
							quantity: 1
						}
					]
				})
			)
		);
		expect(await modules.getDeckCardsForDeck(actor, deck.id)).toMatchObject([{ quantity: 2 }]);
	});

	it('merges destination role quantities atomically', async () => {
		const deck = await modules.createDeckRecord(actor, deckInput);
		const cards = await modules.bulkMutateDeckCards(actor, {
			requestId: crypto.randomUUID(),
			source: 'web',
			game: 'mtg',
			deckId: deck.id,
			operations: [operation(2), operation(3, 'sideboard')]
		});
		const main = cards.changes.find((card) => card.role === 'main')!;
		await modules.updateDeckCard(actor, main.entryId, 4, 'sideboard', crypto.randomUUID());
		expect(await modules.getDeckCardsForDeck(actor, deck.id)).toMatchObject([
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
			Array.from({ length: 8 }, () => modules.importDeck(actor, input))
		);
		expect(new Set(result.map((deck) => deck.deckId)).size).toBe(1);
		const snapshot = await modules.getDeckSnapshot(
			actor,
			'mtg',
			(await modules.getDeckSnapshot(actor)).decks[0].id
		);
		expect(snapshot.decks).toHaveLength(1);
		expect(snapshot.deckCards).toMatchObject([{ quantity: 4 }]);
	});

	it('rolls back new deck and request when a later imported card fails', async () => {
		const requestId = crypto.randomUUID();
		await expect(
			modules.importDeck(actor, {
				...deckInput,
				requestId,
				source: 'import',
				operations: [operation(2147483647), operation()]
			})
		).rejects.toThrow();
		const snapshot = await modules.getDeckSnapshot(actor);
		expect(snapshot.decks).toEqual([]);
		expect(snapshot.deckCards).toEqual([]);
		await modules.importDeck(actor, {
			...deckInput,
			requestId,
			source: 'import',
			operations: [operation()]
		});
		expect((await modules.getDeckSnapshot(actor)).decks).toHaveLength(1);
	});

	it('rejects request reuse for another deck and cross-account mutations', async () => {
		const first = await modules.createDeckRecord(actor, deckInput);
		const second = await modules.createDeckRecord(actor, deckInput);
		const input = {
			requestId: crypto.randomUUID(),
			source: 'web',
			game: 'mtg',
			deckId: first.id,
			operations: [operation()]
		};
		await modules.bulkMutateDeckCards(actor, input);
		await expect(
			modules.bulkMutateDeckCards(actor, { ...input, deckId: second.id })
		).rejects.toThrow('different mutation');
		await expect(
			modules.bulkMutateDeckCards(
				{ ...actor, accountId: 'other' },
				{ ...input, requestId: crypto.randomUUID() }
			)
		).rejects.toMatchObject({ kind: 'Unauthenticated' });
		expect(await modules.getDeckCardsForDeck(actor, second.id)).toEqual([]);
	});
	it('keeps Description revision independent of quantity and unchanged text', async () => {
		const deck = await modules.createDeckRecord(actor, deckInput);
		await modules.updateDeck(actor, { deckId: deck.id, name: 'Renamed' });
		const described = await modules.updateDeck(actor, {
			deckId: deck.id,
			description: 'My description',
			descriptionRevision: deck.descriptionRevision
		});
		expect(described).toMatchObject({ name: 'Renamed', descriptionRevision: '1' });
		await modules.bulkMutateDeckCards(actor, {
			requestId: crypto.randomUUID(),
			source: 'web',
			game: 'mtg',
			deckId: deck.id,
			operations: [operation()]
		});
		const unchanged = await modules.updateDeck(actor, {
			deckId: deck.id,
			description: 'My description',
			descriptionRevision: '1'
		});
		expect(unchanged?.descriptionRevision).toBe('1');
		await expect(
			modules.updateDeck(actor, {
				deckId: deck.id,
				description: 'Old draft',
				descriptionRevision: '0'
			})
		).rejects.toMatchObject({
			latest: { description: 'My description', descriptionRevision: '1' }
		});
	});
	it('does not advance Deck composition revision for a quantity no-op', async () => {
		const deck = await modules.createDeckRecord(actor, deckInput);
		const first = await modules.bulkMutateDeckCards(actor, {
			requestId: crypto.randomUUID(),
			source: 'web',
			game: 'mtg',
			deckId: deck.id,
			operations: [operation(2)]
		});
		const noop = await modules.bulkMutateDeckCards(actor, {
			requestId: crypto.randomUUID(),
			source: 'web',
			game: 'mtg',
			deckId: deck.id,
			operations: [{ op: 'set', target: { entryId: first.changes[0].entryId }, quantity: 2 }]
		});
		expect(noop.revision).toBe(first.revision);
	});
});

async function loadModules() {
	const [{ db, pool }, schema, decks, inventory] = await Promise.all([
		import('../../src/lib/server/db/client'),
		import('../../src/lib/server/db/schema'),
		import('../../src/lib/server/data/decks'),
		import('../../src/lib/server/data/inventory')
	]);
	const { application } = await import('../../src/lib/server/composition.ts');
	return { db, pool, application, ...schema, ...decks, ...inventory };
}
