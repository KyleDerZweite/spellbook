import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { deckCards, decks, inventoryCards } from '$lib/server/db/schema';
import type { Deck, DeckCard, DeckSnapshot } from './types';

function normalizeQuantity(quantity: number): number {
	return Math.max(1, Math.trunc(quantity));
}

export async function getDeckSnapshot(accountId: string, game = 'mtg'): Promise<DeckSnapshot> {
	const [userDecks, userDeckCards, ownedCards] = await Promise.all([
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
			.orderBy(asc(inventoryCards.name))
	]);

	return {
		decks: userDecks,
		deckCards: userDeckCards,
		inventoryCards: ownedCards
	};
}

export async function createDeck(
	accountId: string,
	input: { game: string; name: string; description: string; format: string }
): Promise<Deck[]> {
	const name = input.name.trim();
	if (!name) {
		throw new Error('Deck name is required');
	}

	await db.insert(decks).values({
		id: crypto.randomUUID(),
		accountId,
		game: input.game,
		name,
		description: input.description.trim(),
		format: input.format.trim() || 'Commander'
	});

	return (await getDeckSnapshot(accountId, input.game)).decks;
}

export async function updateDeck(
	accountId: string,
	input: { deckId: string; name: string; description: string; format: string }
): Promise<Deck | null> {
	const name = input.name.trim();
	if (!name) {
		throw new Error('Deck name is required');
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
	const [deck] = await db
		.select()
		.from(decks)
		.where(and(eq(decks.id, input.deckId), eq(decks.accountId, accountId)))
		.limit(1);

	if (!deck) {
		throw new Error(`Deck not found: ${input.deckId}`);
	}

	const quantity = normalizeQuantity(input.quantity);
	const role = input.role.trim() || 'main';
	const now = new Date();

	await db
		.insert(deckCards)
		.values({
			id: crypto.randomUUID(),
			deckId: deck.id,
			accountId,
			game: deck.game,
			catalogCardId: input.catalogCardId,
			canonicalCardId: input.canonicalCardId,
			name: input.name,
			setCode: input.setCode,
			imageUri: input.imageUri,
			quantity,
			role,
			createdAt: now,
			updatedAt: now
		})
		.onConflictDoUpdate({
			target: [deckCards.deckId, deckCards.catalogCardId, deckCards.role],
			set: {
				canonicalCardId: input.canonicalCardId,
				name: input.name,
				setCode: input.setCode,
				imageUri: input.imageUri,
				quantity: sql`${deckCards.quantity} + ${quantity}`,
				updatedAt: now
			}
		});

	await db.update(decks).set({ updatedAt: now }).where(eq(decks.id, deck.id));

	return db
		.select()
		.from(deckCards)
		.where(and(eq(deckCards.deckId, deck.id), eq(deckCards.accountId, accountId)))
		.orderBy(asc(deckCards.name));
}

export async function updateDeckCard(
	accountId: string,
	entryId: string,
	quantity: number
): Promise<DeckCard | null> {
	const [updated] = await db
		.update(deckCards)
		.set({ quantity: normalizeQuantity(quantity), updatedAt: new Date() })
		.where(and(eq(deckCards.id, entryId), eq(deckCards.accountId, accountId)))
		.returning();

	return updated ?? null;
}

export async function removeDeckCard(accountId: string, entryId: string): Promise<void> {
	await db
		.delete(deckCards)
		.where(and(eq(deckCards.id, entryId), eq(deckCards.accountId, accountId)));
}
