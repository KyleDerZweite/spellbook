import {
	ensureInventory as ensureBackendInventory,
	lockInventory,
	advanceInventoryRevision
} from '@spellbook/backend/inventory/write.ts';
export { lockInventory, advanceInventoryRevision };
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/client.ts';
import { inventories, inventoryCards, inventoryMutationRequests } from '#lib/server/db/schema.ts';
import type { Inventory, InventoryBatchItem, InventoryCard, InventorySnapshot, InventoryStats } from './types';
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

export {
	InventoryQuantityChangedError,
	InventoryNotFoundError,
	NotesConflictError
} from '@spellbook/backend/inventory/mutations.ts';
import type { AuthUser } from '@spellbook/contracts/auth.ts';
import type {
	InventoryAdd,
	InventoryBulkInput,
	InventoryPatch,
	InventoryRemove
} from '@spellbook/contracts/inventory.ts';
import { application } from '#lib/server/composition.ts';
export const addToInventory = (actor: AuthUser, input: InventoryAdd) =>
	application.inventory.add(actor, input);
export const bulkMutateInventory = (actor: AuthUser, input: InventoryBulkInput) =>
	application.inventory.bulk(actor, input);
export const updateInventoryCard = (actor: AuthUser, input: InventoryPatch) =>
	application.inventory.patchEntry(actor, input);
export const removeInventoryCard = (actor: AuthUser, input: InventoryRemove) =>
	application.inventory.remove(actor, input);
export const reorderInventoryCard = (
	actor: AuthUser,
	input: { requestId: string; entryId: string; position: number }
) => application.inventory.reorder(actor, input);
export const batchAddInventory = (
	actor: AuthUser,
	requestId: string,
	source: import('@spellbook/contracts/inventory.ts').InventorySource,
	items: InventoryBatchItem[]
) =>
	application.inventory.bulk(actor, {
		requestId,
		source,
		operations: items.map((item) => ({ op: 'add', ...item }))
	});
