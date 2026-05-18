import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { deckCards, deckMutationRequests, decks, inventoryCards } from '$lib/server/db/schema';
import {
	assertDeckOperation,
	assertDeckRole,
	assertRequestId,
	normalizeQuantity,
	ValidationError,
	type DeckBulkOperation,
	type DeckBulkOperationInput
} from '$lib/server/mtg/validation';
import type { Deck, DeckCard, DeckSnapshot } from './types';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function getDeckSnapshot(accountId: string, game = 'mtg'): Promise<DeckSnapshot> {
	const [userDecks, userDeckCards, ownedCards, mutationRequests] = await Promise.all([
		db
			.select()
			.from(decks)
			.where(and(eq(decks.accountId, accountId), eq(decks.game, game)))
			.orderBy(desc(decks.updatedAt), asc(decks.name)),
		db
			.select()
			.from(deckCards)
			.where(and(eq(deckCards.accountId, accountId), eq(deckCards.game, game)))
			.orderBy(asc(deckCards.name)),
		db
			.select()
			.from(inventoryCards)
			.where(and(eq(inventoryCards.accountId, accountId), eq(inventoryCards.game, game)))
			.orderBy(asc(inventoryCards.name)),
		db
			.select()
			.from(deckMutationRequests)
			.where(eq(deckMutationRequests.accountId, accountId))
			.orderBy(desc(deckMutationRequests.updatedAt))
	]);

	return {
		decks: userDecks,
		deckCards: userDeckCards,
		inventoryCards: ownedCards,
		mutationRequests
	};
}

export async function createDeck(
	accountId: string,
	input: { game: string; name: string; description: string; format: string }
): Promise<Deck[]> {
	await createDeckRecord(accountId, input);
	return (await getDeckSnapshot(accountId, input.game)).decks;
}

export async function createDeckRecord(
	accountId: string,
	input: { game: string; name: string; description: string; format: string }
): Promise<Deck> {
	const name = input.name.trim();
	if (!name) {
		throw new ValidationError('Deck name is required');
	}

	const [created] = await db
		.insert(decks)
		.values({
			id: crypto.randomUUID(),
			accountId,
			game: input.game,
			name,
			description: input.description.trim(),
			format: input.format.trim() || 'Commander'
		})
		.returning();

	return created;
}

export async function updateDeck(
	accountId: string,
	input: { deckId: string; name: string; description: string; format: string }
): Promise<Deck | null> {
	const name = input.name.trim();
	if (!name) {
		throw new ValidationError('Deck name is required');
	}

	const [updated] = await db
		.update(decks)
		.set({
			name,
			description: input.description.trim(),
			format: input.format.trim() || 'Commander',
			updatedAt: new Date()
		})
		.where(and(eq(decks.id, input.deckId), eq(decks.accountId, accountId)))
		.returning();

	return updated ?? null;
}

export async function deleteDeck(accountId: string, deckId: string): Promise<void> {
	await db.delete(decks).where(and(eq(decks.id, deckId), eq(decks.accountId, accountId)));
}

export async function getDeckByMutationRequest(
	accountId: string,
	requestId: string
): Promise<Deck | null> {
	const [row] = await db
		.select({ deck: decks })
		.from(deckMutationRequests)
		.innerJoin(decks, eq(deckMutationRequests.deckId, decks.id))
		.where(
			and(
				eq(deckMutationRequests.accountId, accountId),
				eq(deckMutationRequests.requestId, requestId),
				eq(decks.accountId, accountId)
			)
		)
		.limit(1);
	return row?.deck ?? null;
}

export async function addDeckCard(
	accountId: string,
	input: {
		deckId: string;
		catalogCardId: string;
		canonicalCardId: string;
		name: string;
		setCode: string;
		imageUri: string;
		quantity: number;
		role: string;
	}
): Promise<DeckCard[]> {
	return bulkMutateDeckCards(accountId, {
		requestId: crypto.randomUUID(),
		source: 'web',
		game: 'mtg',
		deckId: input.deckId,
		operations: [
			{
				op: 'add',
				card: {
					catalogCardId: input.catalogCardId,
					canonicalCardId: input.canonicalCardId,
					name: input.name,
					setCode: input.setCode,
					imageUri: input.imageUri
				},
				quantity: Math.max(1, Math.trunc(input.quantity)),
				role: assertDeckRole(input.role.trim() || 'main')
			}
		]
	});
}

export async function updateDeckCard(
	accountId: string,
	entryId: string,
	quantity: number
): Promise<DeckCard | null> {
	const [existing] = await db
		.select()
		.from(deckCards)
		.where(and(eq(deckCards.id, entryId), eq(deckCards.accountId, accountId)))
		.limit(1);
	if (!existing) {
		return null;
	}

	const operation =
		Math.trunc(quantity) <= 0
			? { op: 'remove' as const, target: { entryId } }
			: { op: 'set' as const, target: { entryId }, quantity };
	const cards = await bulkMutateDeckCards(accountId, {
		requestId: crypto.randomUUID(),
		source: 'web',
		game: existing.game,
		deckId: existing.deckId,
		operations: [operation]
	});
	return cards.find((card) => card.id === entryId) ?? null;
}

export async function removeDeckCard(accountId: string, entryId: string): Promise<void> {
	const [existing] = await db
		.select()
		.from(deckCards)
		.where(and(eq(deckCards.id, entryId), eq(deckCards.accountId, accountId)))
		.limit(1);
	if (!existing) {
		return;
	}

	await bulkMutateDeckCards(accountId, {
		requestId: crypto.randomUUID(),
		source: 'web',
		game: existing.game,
		deckId: existing.deckId,
		operations: [{ op: 'remove', target: { entryId } }]
	});
}

export async function bulkMutateDeckCards(
	accountId: string,
	input: {
		requestId: string;
		source: string;
		game: string;
		deckId: string;
		operations: DeckBulkOperationInput[];
	}
): Promise<DeckCard[]> {
	const requestId = assertRequestId(input.requestId);
	if (!Array.isArray(input.operations) || input.operations.length === 0) {
		throw new ValidationError('operations must contain at least one operation');
	}
	const operations = input.operations.map(assertDeckOperation);
	const [deck] = await db
		.select()
		.from(decks)
		.where(
			and(eq(decks.id, input.deckId), eq(decks.accountId, accountId), eq(decks.game, input.game))
		)
		.limit(1);

	if (!deck) {
		throw new ValidationError(`Deck not found: ${input.deckId}`);
	}

	await db.transaction(async (tx) => {
		const existingRequest = await tx
			.select()
			.from(deckMutationRequests)
			.where(
				and(
					eq(deckMutationRequests.accountId, accountId),
					eq(deckMutationRequests.requestId, requestId)
				)
			)
			.limit(1);

		if (existingRequest[0]) {
			return;
		}

		const now = new Date();
		await tx.insert(deckMutationRequests).values({
			accountId,
			requestId,
			deckId: deck.id,
			source: input.source,
			status: 'applied',
			createdAt: now,
			updatedAt: now
		});

		for (const operation of operations) {
			await applyDeckOperation(tx, accountId, deck.id, deck.game, operation, now);
		}

		await tx.update(decks).set({ updatedAt: now }).where(eq(decks.id, deck.id));
	});

	return db
		.select()
		.from(deckCards)
		.where(and(eq(deckCards.deckId, deck.id), eq(deckCards.accountId, accountId)))
		.orderBy(asc(deckCards.name));
}

async function applyDeckOperation(
	tx: Tx,
	accountId: string,
	deckId: string,
	game: string,
	operation: DeckBulkOperation,
	now: Date
): Promise<void> {
	if (operation.op === 'add') {
		const quantity = normalizeQuantity(operation.quantity);
		await tx
			.insert(deckCards)
			.values({
				id: crypto.randomUUID(),
				deckId,
				accountId,
				game,
				catalogCardId: operation.card.catalogCardId,
				canonicalCardId: operation.card.canonicalCardId,
				name: operation.card.name,
				setCode: operation.card.setCode,
				imageUri: operation.card.imageUri,
				quantity,
				role: operation.role,
				createdAt: now,
				updatedAt: now
			})
			.onConflictDoUpdate({
				target: [deckCards.deckId, deckCards.catalogCardId, deckCards.role],
				set: {
					canonicalCardId: operation.card.canonicalCardId,
					name: operation.card.name,
					setCode: operation.card.setCode,
					imageUri: operation.card.imageUri,
					quantity: sql`${deckCards.quantity} + ${quantity}`,
					updatedAt: now
				}
			});
		return;
	}

	const entryId = operation.target.entryId;
	if (operation.op === 'remove') {
		await tx
			.delete(deckCards)
			.where(
				and(
					eq(deckCards.id, entryId),
					eq(deckCards.accountId, accountId),
					eq(deckCards.deckId, deckId)
				)
			);
		return;
	}

	const [existing] = await tx
		.select()
		.from(deckCards)
		.where(
			and(
				eq(deckCards.id, entryId),
				eq(deckCards.accountId, accountId),
				eq(deckCards.deckId, deckId)
			)
		)
		.limit(1);
	if (!existing) {
		return;
	}

	const quantity = normalizeQuantity(operation.quantity);
	const nextQuantity = operation.op === 'decrement' ? existing.quantity - quantity : quantity;
	if (nextQuantity <= 0) {
		await tx
			.delete(deckCards)
			.where(
				and(
					eq(deckCards.id, entryId),
					eq(deckCards.accountId, accountId),
					eq(deckCards.deckId, deckId)
				)
			);
	} else {
		await tx
			.update(deckCards)
			.set({ quantity: nextQuantity, updatedAt: now })
			.where(
				and(
					eq(deckCards.id, entryId),
					eq(deckCards.accountId, accountId),
					eq(deckCards.deckId, deckId)
				)
			);
	}
}

export async function getDeckCardsForDeck(accountId: string, deckId: string): Promise<DeckCard[]> {
	return db
		.select()
		.from(deckCards)
		.where(and(eq(deckCards.deckId, deckId), eq(deckCards.accountId, accountId)))
		.orderBy(asc(deckCards.role), asc(deckCards.name));
}
