import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { deckCards, deckMutationRequests, decks, inventoryCards } from '$lib/server/db/schema';
import {
	assertDeckOperation,
	assertDeckRole,
	assertRequestId,
	normalizeQuantity,
	normalizeSource,
	DECK_SOURCES,
	ValidationError,
	type DeckBulkOperation,
	type DeckBulkOperationInput
} from '$lib/server/mtg/validation';
import type { Deck, DeckCard, DeckSnapshot } from './types';
import { mutationFingerprint, RequestConflictError } from './request-fingerprint';

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
				quantity: input.quantity,
				role: assertDeckRole(input.role.trim() || 'main')
			}
		]
	});
}

export async function updateDeckCard(
	accountId: string,
	entryId: string,
	quantity: number,
	role?: string
): Promise<DeckCard | null> {
	const [existing] = await db
		.select()
		.from(deckCards)
		.where(and(eq(deckCards.id, entryId), eq(deckCards.accountId, accountId)))
		.limit(1);
	if (!existing) {
		return null;
	}

	const targetRole = role === undefined ? undefined : assertDeckRole(role);
	const operation =
		Math.trunc(quantity) <= 0
			? { op: 'remove' as const, target: { entryId } }
			: { op: 'set' as const, target: { entryId }, quantity };
	const cards = await bulkMutateDeckCards(accountId, {
		requestId: crypto.randomUUID(),
		source: 'web',
		game: existing.game,
		deckId: existing.deckId,
		operations: [
			operation,
			...(targetRole && operation.op !== 'remove'
				? [{ op: 'move' as const, target: { entryId }, role: targetRole }]
				: [])
		]
	});
	if (operation.op === 'remove') return null;
	return (
		cards.find(
			(card) =>
				card.id === entryId ||
				(targetRole && card.catalogCardId === existing.catalogCardId && card.role === targetRole)
		) ?? null
	);
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
	const source = normalizeSource(input.source, DECK_SOURCES, 'web');
	const requestHash = mutationFingerprint({
		kind: 'deck.bulk',
		deckId: input.deckId.toLowerCase(),
		game: input.game,
		source,
		operations
	});
	await db.transaction(async (tx) => {
		await lockMutationRequest(tx, accountId, requestId);
		const [deck] = await tx
			.select()
			.from(decks)
			.where(
				and(eq(decks.id, input.deckId), eq(decks.accountId, accountId), eq(decks.game, input.game))
			)
			.limit(1)
			.for('update');
		if (!deck) throw new ValidationError(`Deck not found: ${input.deckId}`);
		const [existingRequest] = await tx
			.select()
			.from(deckMutationRequests)
			.where(
				and(
					eq(deckMutationRequests.accountId, accountId),
					eq(deckMutationRequests.requestId, requestId)
				)
			)
			.limit(1);
		if (existingRequest) {
			if (existingRequest.deckId !== deck.id)
				throw new RequestConflictError('requestId already belongs to another deck');
			if (existingRequest.requestHash !== null && existingRequest.requestHash !== requestHash)
				throw new RequestConflictError('requestId was already used with a different request');
			return;
		}

		const now = new Date();
		await tx.insert(deckMutationRequests).values({
			accountId,
			requestId,
			requestHash,
			deckId: deck.id,
			source,
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
		.where(and(eq(deckCards.deckId, input.deckId), eq(deckCards.accountId, accountId)))
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

	if (operation.op === 'move') {
		if (existing.role === operation.role) return;
		await tx.delete(deckCards).where(eq(deckCards.id, existing.id));
		await tx
			.insert(deckCards)
			.values({ ...existing, role: operation.role, updatedAt: now })
			.onConflictDoUpdate({
				target: [deckCards.deckId, deckCards.catalogCardId, deckCards.role],
				set: { quantity: sql`${deckCards.quantity} + ${existing.quantity}`, updatedAt: now }
			});
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

async function lockMutationRequest(tx: Tx, accountId: string, requestId: string): Promise<void> {
	await tx.execute(
		sql`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify([accountId, requestId])}, 0))`
	);
}

export async function importDeck(
	accountId: string,
	input: {
		requestId: string;
		source: string;
		game: string;
		name: string;
		description: string;
		format: string;
		operations: DeckBulkOperationInput[];
	}
): Promise<Deck> {
	const requestId = assertRequestId(input.requestId);
	const source = normalizeSource(input.source, DECK_SOURCES, 'import');
	const name = input.name.trim();
	if (!name) throw new ValidationError('Deck name is required');
	if (!Array.isArray(input.operations) || !input.operations.length)
		throw new ValidationError('No resolved deck lines to commit');
	const operations = input.operations.map(assertDeckOperation);
	if (operations.some((operation) => operation.op !== 'add'))
		throw new ValidationError('Deck import accepts only add operations');
	const description = input.description.trim();
	const format = input.format.trim() || 'Commander';
	const requestHash = mutationFingerprint({
		kind: 'deck.import',
		name,
		description,
		format,
		game: input.game,
		source,
		operations
	});
	return db.transaction(async (tx) => {
		await lockMutationRequest(tx, accountId, requestId);
		const [existing] = await tx
			.select({ deck: decks, requestHash: deckMutationRequests.requestHash })
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
		if (existing) {
			if (existing.requestHash !== null && existing.requestHash !== requestHash)
				throw new RequestConflictError('requestId was already used with a different request');
			return existing.deck;
		}
		const [deck] = await tx
			.insert(decks)
			.values({
				id: crypto.randomUUID(),
				accountId,
				game: input.game,
				name,
				description,
				format
			})
			.returning();
		const now = new Date();
		await tx.insert(deckMutationRequests).values({
			accountId,
			requestId,
			requestHash,
			deckId: deck.id,
			source,
			status: 'applied',
			createdAt: now,
			updatedAt: now
		});
		for (const operation of operations)
			await applyDeckOperation(tx, accountId, deck.id, deck.game, operation, now);
		return deck;
	});
}
