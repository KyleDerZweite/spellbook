import {
	ensureInventory as ensureBackendInventory,
	lockInventory,
	advanceInventoryRevision
} from '@spellbook/backend/inventory/write.ts';
export { lockInventory, advanceInventoryRevision };
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from './database.ts';
import {
	inventories,
	inventoryCards,
	inventoryMutationRequests
} from '@spellbook/backend/db/schema.ts';
import type { InferSelectModel } from 'drizzle-orm';
type Inventory = InferSelectModel<typeof inventories>;
type InventoryCard = InferSelectModel<typeof inventoryCards>;
type InventoryMutationRequest = InferSelectModel<typeof inventoryMutationRequests>;
interface InventoryStats {
	total: number;
	unique: number;
	foils: number;
	sets: number;
	completedSets: number;
}
interface InventorySnapshot {
	inventory: Inventory | null;
	cards: InventoryCard[];
	stats: InventoryStats;
	mutationRequests: InventoryMutationRequest[];
}
import type { Transaction } from '@spellbook/backend/db/client.ts';
function getStats(cards: InventoryCard[]): InventoryStats {
	const total = cards.reduce((sum, card) => sum + card.quantity, 0);
	const unique = new Set(cards.map((card) => card.canonicalCardId)).size;
	const foils = cards.filter((card) => card.finish === 'foil').length;
	const sets = new Set(cards.map((card) => card.setCode)).size;
	return { total, unique, foils, sets, completedSets: 0 };
}

export async function ensureInventory(
	accountId: string,
	game: string,
	executor: typeof db | Transaction = db
): Promise<Inventory> {
	return ensureBackendInventory(executor, accountId, game);
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
