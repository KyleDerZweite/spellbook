import { and, asc, desc, eq, max, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { inventories, inventoryCards, inventoryMutationRequests } from '$lib/server/db/schema';
import {
	assertCondition,
	assertFinish,
	assertInventoryOperation,
	assertRequestId,
	normalizeQuantity,
	ValidationError,
	type InventoryBulkOperation,
	type InventoryBulkOperationInput,
	type InventorySource
} from '$lib/server/mtg/validation';
import type {
	AddInventoryInput,
	HomeSummary,
	Inventory,
	InventoryBatchItem,
	InventoryCard,
	InventorySnapshot,
	InventoryStats
} from './types';

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

function batchItemToAddOperation(item: InventoryBatchItem): InventoryBulkOperation {
	return {
		op: 'add',
		card: {
			catalogCardId: item.catalogCardId,
			canonicalCardId: item.canonicalCardId,
			name: item.name,
			setCode: item.setCode,
			imageUri: item.imageUri
		},
		finish: assertFinish(item.finish),
		condition: assertCondition(item.condition),
		quantity: Math.max(1, Math.trunc(item.quantity)),
		notes: ''
	};
}

export async function addToInventory(
	accountId: string,
	input: AddInventoryInput
): Promise<InventoryCard | null> {
	const snapshot = await bulkMutateInventory(accountId, {
		requestId: crypto.randomUUID(),
		source: 'web',
		game: input.game,
		operations: [batchItemToAddOperation(input)]
	});
	return (
		snapshot.cards.find(
			(card) =>
				card.catalogCardId === input.catalogCardId &&
				card.finish === input.finish &&
				card.condition === input.condition
		) ?? null
	);
}

export async function batchAddInventory(
	accountId: string,
	requestId: string,
	source: string,
	game: string,
	items: InventoryBatchItem[]
): Promise<InventorySnapshot> {
	if (items.length === 0) {
		throw new ValidationError('Batch add requires at least one item');
	}
	return bulkMutateInventory(accountId, {
		requestId,
		source: source as InventorySource,
		game,
		operations: items.map(batchItemToAddOperation)
	});
}

export async function bulkMutateInventory(
	accountId: string,
	input: {
		requestId: string;
		source: string;
		game: string;
		operations: InventoryBulkOperationInput[];
	}
): Promise<InventorySnapshot> {
	const requestId = assertRequestId(input.requestId);
	if (!Array.isArray(input.operations) || input.operations.length === 0) {
		throw new ValidationError('operations must contain at least one operation');
	}
	const operations = input.operations.map(assertInventoryOperation);
	const inventory = await ensureInventory(accountId, input.game);

	const shouldApply = await db.transaction(async (tx) => {
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
			source: input.source,
			status: 'applied',
			createdAt: now,
			updatedAt: now
		});

		for (const operation of operations) {
			await applyInventoryOperation(tx, accountId, inventory.id, input.game, operation, now);
		}

		await tx.update(inventories).set({ updatedAt: now }).where(eq(inventories.id, inventory.id));
		return true;
	});

	if (shouldApply) {
		await compactInventoryPositions(inventory.id);
	}
	return getInventorySnapshot(accountId, input.game);
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function applyInventoryOperation(
	tx: Tx,
	accountId: string,
	inventoryId: string,
	game: string,
	operation: InventoryBulkOperation,
	now: Date
): Promise<void> {
	if (operation.op === 'add') {
		const [{ maxPosition }] = await tx
			.select({ maxPosition: max(inventoryCards.spellbookPosition) })
			.from(inventoryCards)
			.where(eq(inventoryCards.inventoryId, inventoryId));
		const quantity = normalizeQuantity(operation.quantity);

		await tx
			.insert(inventoryCards)
			.values({
				id: crypto.randomUUID(),
				inventoryId,
				accountId,
				game,
				catalogCardId: operation.card.catalogCardId,
				canonicalCardId: operation.card.canonicalCardId,
				name: operation.card.name,
				setCode: operation.card.setCode,
				imageUri: operation.card.imageUri,
				quantity,
				finish: operation.finish,
				condition: operation.condition,
				notes: operation.notes,
				spellbookPosition: (maxPosition ?? -1) + 1,
				createdAt: now,
				updatedAt: now
			})
			.onConflictDoUpdate({
				target: [
					inventoryCards.inventoryId,
					inventoryCards.catalogCardId,
					inventoryCards.finish,
					inventoryCards.condition
				],
				set: {
					canonicalCardId: operation.card.canonicalCardId,
					name: operation.card.name,
					setCode: operation.card.setCode,
					imageUri: operation.card.imageUri,
					quantity: sql`${inventoryCards.quantity} + ${quantity}`,
					notes: operation.notes,
					updatedAt: now
				}
			});
		return;
	}

	const entryId = operation.target.entryId;
	if (operation.op === 'remove') {
		await tx
			.delete(inventoryCards)
			.where(and(eq(inventoryCards.id, entryId), eq(inventoryCards.accountId, accountId)));
		return;
	}

	const [existing] = await tx
		.select()
		.from(inventoryCards)
		.where(and(eq(inventoryCards.id, entryId), eq(inventoryCards.accountId, accountId)))
		.limit(1);
	if (!existing) {
		return;
	}

	const quantity = normalizeQuantity(operation.quantity);
	const nextQuantity = operation.op === 'decrement' ? existing.quantity - quantity : quantity;
	if (nextQuantity <= 0) {
		await tx
			.delete(inventoryCards)
			.where(and(eq(inventoryCards.id, entryId), eq(inventoryCards.accountId, accountId)));
	} else {
		await tx
			.update(inventoryCards)
			.set({
				quantity: nextQuantity,
				notes: operation.notes ?? existing.notes,
				updatedAt: now
			})
			.where(and(eq(inventoryCards.id, entryId), eq(inventoryCards.accountId, accountId)));
	}
}

export async function updateInventoryCard(
	accountId: string,
	entryId: string,
	quantity: number,
	notes = ''
): Promise<InventoryCard | null> {
	const [existing] = await db
		.select()
		.from(inventoryCards)
		.where(and(eq(inventoryCards.id, entryId), eq(inventoryCards.accountId, accountId)))
		.limit(1);
	if (!existing) {
		return null;
	}

	const operation =
		Math.trunc(quantity) <= 0
			? { op: 'remove' as const, target: { entryId } }
			: { op: 'set' as const, target: { entryId }, quantity, notes };
	const snapshot = await bulkMutateInventory(accountId, {
		requestId: crypto.randomUUID(),
		source: 'web',
		game: existing.game,
		operations: [operation]
	});
	return snapshot.cards.find((card) => card.id === entryId) ?? null;
}

export async function removeInventoryCard(accountId: string, entryId: string): Promise<void> {
	const [existing] = await db
		.select()
		.from(inventoryCards)
		.where(and(eq(inventoryCards.id, entryId), eq(inventoryCards.accountId, accountId)))
		.limit(1);
	if (!existing) {
		return;
	}

	await bulkMutateInventory(accountId, {
		requestId: crypto.randomUUID(),
		source: 'web',
		game: existing.game,
		operations: [{ op: 'remove', target: { entryId } }]
	});
}

async function reflowPositions(tx: Tx, inventoryId: string): Promise<void> {
	const remaining = await tx
		.select()
		.from(inventoryCards)
		.where(eq(inventoryCards.inventoryId, inventoryId))
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
}

async function compactInventoryPositions(inventoryId: string): Promise<void> {
	await db.transaction(async (tx) => {
		await reflowPositions(tx, inventoryId);
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
