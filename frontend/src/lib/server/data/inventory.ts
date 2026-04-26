import { and, asc, desc, eq, max } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { inventories, inventoryCards, inventoryMutationRequests } from '$lib/server/db/schema';
import type {
	AddInventoryInput,
	HomeSummary,
	Inventory,
	InventoryBatchItem,
	InventoryCard,
	InventorySnapshot,
	InventoryStats
} from './types';

export const VALID_CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG'] as const;
export const VALID_FINISHES = ['nonfoil', 'foil'] as const;

function assertValidCardInput(item: InventoryBatchItem): void {
	if (!VALID_FINISHES.includes(item.finish as (typeof VALID_FINISHES)[number])) {
		throw new Error(`Invalid finish: ${item.finish}`);
	}
	if (!VALID_CONDITIONS.includes(item.condition as (typeof VALID_CONDITIONS)[number])) {
		throw new Error(`Invalid condition: ${item.condition}`);
	}
	if (Math.trunc(item.quantity) <= 0) {
		throw new Error('Quantity must be greater than 0');
	}
}

function normalizeQuantity(quantity: number): number {
	return Math.max(1, Math.trunc(quantity));
}

function getStats(cards: InventoryCard[]): InventoryStats {
	const total = cards.reduce((sum, card) => sum + card.quantity, 0);
	const unique = new Set(cards.map((card) => card.canonicalCardId)).size;
	const foils = cards.filter((card) => card.finish === 'foil').length;
	const sets = new Set(cards.map((card) => card.setCode)).size;
	return { total, unique, foils, sets, completedSets: 0 };
}

export async function ensureInventory(accountId: string, game: string): Promise<Inventory> {
	const existing = await db
		.select()
		.from(inventories)
		.where(and(eq(inventories.accountId, accountId), eq(inventories.game, game)))
		.limit(1);

	if (existing[0]) {
		return existing[0];
	}

	const [created] = await db
		.insert(inventories)
		.values({
			id: crypto.randomUUID(),
			accountId,
			game
		})
		.onConflictDoNothing()
		.returning();

	if (created) {
		return created;
	}

	const [afterConflict] = await db
		.select()
		.from(inventories)
		.where(and(eq(inventories.accountId, accountId), eq(inventories.game, game)))
		.limit(1);

	if (!afterConflict) {
		throw new Error(`Inventory not found for ${game}`);
	}

	return afterConflict;
}

export async function getInventorySnapshot(
	accountId: string,
	game = 'mtg'
): Promise<InventorySnapshot> {
	const inventory = await ensureInventory(accountId, game);
	const [cards, mutationRequests] = await Promise.all([
		db
			.select()
			.from(inventoryCards)
			.where(
				and(eq(inventoryCards.accountId, accountId), eq(inventoryCards.inventoryId, inventory.id))
			)
			.orderBy(asc(inventoryCards.spellbookPosition), asc(inventoryCards.name)),
		db
			.select()
			.from(inventoryMutationRequests)
			.where(eq(inventoryMutationRequests.accountId, accountId))
			.orderBy(desc(inventoryMutationRequests.updatedAt))
	]);

	return {
		inventory,
		cards,
		stats: getStats(cards),
		mutationRequests
	};
}

export async function getHomeSummary(accountId: string, game = 'mtg'): Promise<HomeSummary> {
	const snapshot = await getInventorySnapshot(accountId, game);
	const recentCards = [...snapshot.cards]
		.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
		.slice(0, 6);

	return {
		stats: snapshot.stats,
		recentAdditions: recentCards.map((entry) => ({
			id: entry.catalogCardId,
			oracle_id: entry.canonicalCardId,
			name: entry.name,
			set_code: entry.setCode,
			image_uri: entry.imageUri,
			image_uri_small: entry.imageUri,
			lang: 'en',
			released_at: '',
			layout: '',
			mana_cost: '',
			cmc: 0,
			type_line: '',
			oracle_text: '',
			colors: [],
			color_identity: [],
			keywords: [],
			card_types: [],
			rarity: '',
			set_name: '',
			collector_number: '',
			is_foil_available: entry.finish === 'foil',
			is_nonfoil_available: entry.finish !== 'foil',
			legalities: {}
		}))
	};
}

export async function addToInventory(
	accountId: string,
	input: AddInventoryInput
): Promise<InventoryCard> {
	assertValidCardInput(input);
	return db.transaction(async (tx) => {
		const inventory = await ensureInventory(accountId, input.game);
		const now = new Date();
		const [existing] = await tx
			.select()
			.from(inventoryCards)
			.where(
				and(
					eq(inventoryCards.inventoryId, inventory.id),
					eq(inventoryCards.catalogCardId, input.catalogCardId),
					eq(inventoryCards.finish, input.finish),
					eq(inventoryCards.condition, input.condition)
				)
			)
			.limit(1);

		if (existing) {
			const [updated] = await tx
				.update(inventoryCards)
				.set({
					canonicalCardId: input.canonicalCardId,
					name: input.name,
					setCode: input.setCode,
					imageUri: input.imageUri,
					quantity: existing.quantity + normalizeQuantity(input.quantity),
					updatedAt: now
				})
				.where(and(eq(inventoryCards.id, existing.id), eq(inventoryCards.accountId, accountId)))
				.returning();

			await tx.update(inventories).set({ updatedAt: now }).where(eq(inventories.id, inventory.id));
			return updated;
		}

		const [{ maxPosition }] = await tx
			.select({ maxPosition: max(inventoryCards.spellbookPosition) })
			.from(inventoryCards)
			.where(eq(inventoryCards.inventoryId, inventory.id));

		const [created] = await tx
			.insert(inventoryCards)
			.values({
				id: crypto.randomUUID(),
				inventoryId: inventory.id,
				accountId,
				game: input.game,
				catalogCardId: input.catalogCardId,
				canonicalCardId: input.canonicalCardId,
				name: input.name,
				setCode: input.setCode,
				imageUri: input.imageUri,
				quantity: normalizeQuantity(input.quantity),
				finish: input.finish,
				condition: input.condition,
				spellbookPosition: (maxPosition ?? -1) + 1
			})
			.returning();

		await tx.update(inventories).set({ updatedAt: now }).where(eq(inventories.id, inventory.id));
		return created;
	});
}

export async function batchAddInventory(
	accountId: string,
	requestId: string,
	source: string,
	game: string,
	items: InventoryBatchItem[]
): Promise<InventorySnapshot> {
	if (items.length === 0) {
		throw new Error('Batch add requires at least one item');
	}
	for (const item of items) {
		assertValidCardInput(item);
	}

	const shouldApplyItems = await db.transaction(async (tx) => {
		const existingRequest = await tx
			.select()
			.from(inventoryMutationRequests)
			.where(
				and(
					eq(inventoryMutationRequests.accountId, accountId),
					eq(inventoryMutationRequests.requestId, requestId)
				)
			)
			.limit(1);

		if (existingRequest[0]) {
			return false;
		}

		const now = new Date();
		await tx.insert(inventoryMutationRequests).values({
			accountId,
			requestId,
			source,
			status: 'applied',
			createdAt: now,
			updatedAt: now
		});
		return true;
	});

	if (!shouldApplyItems) {
		return getInventorySnapshot(accountId, game);
	}

	for (const item of items) {
		await addToInventory(accountId, { ...item, game });
	}

	return getInventorySnapshot(accountId, game);
}

export async function updateInventoryCard(
	accountId: string,
	entryId: string,
	quantity: number,
	notes = ''
): Promise<InventoryCard | null> {
	const nextQuantity = normalizeQuantity(quantity);
	const [updated] = await db
		.update(inventoryCards)
		.set({ quantity: nextQuantity, notes, updatedAt: new Date() })
		.where(and(eq(inventoryCards.id, entryId), eq(inventoryCards.accountId, accountId)))
		.returning();
	return updated ?? null;
}

export async function removeInventoryCard(accountId: string, entryId: string): Promise<void> {
	await db.transaction(async (tx) => {
		const [card] = await tx
			.select()
			.from(inventoryCards)
			.where(and(eq(inventoryCards.id, entryId), eq(inventoryCards.accountId, accountId)))
			.limit(1);

		if (!card) {
			return;
		}

		await tx
			.delete(inventoryCards)
			.where(and(eq(inventoryCards.id, entryId), eq(inventoryCards.accountId, accountId)));

		const remaining = await tx
			.select()
			.from(inventoryCards)
			.where(eq(inventoryCards.inventoryId, card.inventoryId))
			.orderBy(asc(inventoryCards.spellbookPosition), asc(inventoryCards.name));

		const now = new Date();
		for (let index = 0; index < remaining.length; index += 1) {
			const row = remaining[index];
			if (row.spellbookPosition !== index) {
				await tx
					.update(inventoryCards)
					.set({ spellbookPosition: index, updatedAt: now })
					.where(eq(inventoryCards.id, row.id));
			}
		}

		await tx
			.update(inventories)
			.set({ updatedAt: now })
			.where(eq(inventories.id, card.inventoryId));
	});
}

export async function reorderInventoryCard(
	accountId: string,
	entryId: string,
	targetPosition: number
): Promise<void> {
	await db.transaction(async (tx) => {
		const [moved] = await tx
			.select()
			.from(inventoryCards)
			.where(and(eq(inventoryCards.id, entryId), eq(inventoryCards.accountId, accountId)))
			.limit(1);

		if (!moved) {
			return;
		}

		const ordered = await tx
			.select()
			.from(inventoryCards)
			.where(eq(inventoryCards.inventoryId, moved.inventoryId))
			.orderBy(asc(inventoryCards.spellbookPosition), asc(inventoryCards.name));

		const withoutMoved = ordered.filter((row) => row.id !== moved.id);
		const boundedPosition = Math.max(0, Math.min(Math.trunc(targetPosition), withoutMoved.length));
		withoutMoved.splice(boundedPosition, 0, moved);

		const now = new Date();
		for (let index = 0; index < withoutMoved.length; index += 1) {
			const row = withoutMoved[index];
			if (row.spellbookPosition !== index) {
				await tx
					.update(inventoryCards)
					.set({ spellbookPosition: index, updatedAt: now })
					.where(eq(inventoryCards.id, row.id));
			}
		}

		await tx
			.update(inventories)
			.set({ updatedAt: now })
			.where(eq(inventories.id, moved.inventoryId));
	});
}
