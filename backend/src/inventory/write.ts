import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '../db/client.ts';
import { inventories } from '../db/schema.ts';
export type InventoryTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export async function ensureInventory(
	executor: Database | InventoryTransaction,
	accountId: string,
	game: string
) {
	const where = and(eq(inventories.accountId, accountId), eq(inventories.game, game));
	const [existing] = await executor.select().from(inventories).where(where).limit(1);
	if (existing) return existing;
	const [created] = await executor
		.insert(inventories)
		.values({ id: crypto.randomUUID(), accountId, game })
		.onConflictDoNothing()
		.returning();
	if (created) return created;
	const [concurrent] = await executor.select().from(inventories).where(where).limit(1);
	if (!concurrent) throw new Error('Inventory unavailable');
	return concurrent;
}
export async function lockInventory(tx: InventoryTransaction, accountId: string, game: string) {
	const inventory = await ensureInventory(tx, accountId, game);
	const [locked] = await tx
		.select()
		.from(inventories)
		.where(eq(inventories.id, inventory.id))
		.for('update');
	return locked;
}
export async function advanceInventoryRevision(tx: InventoryTransaction, inventoryId: string) {
	await tx
		.update(inventories)
		.set({ revision: sql`${inventories.revision}+1`, updatedAt: new Date() })
		.where(eq(inventories.id, inventoryId));
}
