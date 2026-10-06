import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/client.ts';
import {
	inventories,
	inventoryCards,
	inventoryGroupMemberships,
	inventoryGroups
} from '#lib/server/db/schema.ts';
import { ValidationError } from '#lib/server/mtg/validation.ts';
import { lockInventory, advanceInventoryRevision } from './inventory';

export interface InventoryGroup {
	id: string;
	name: string;
	entryCount: number;
	quantity: number;
}

export interface InventoryGroupMembership {
	groupId: string;
	entryId: string;
}

export class InventoryGroupNotFoundError extends Error {
	constructor(message = 'Inventory group not found') {
		super(message);
		this.name = 'InventoryGroupNotFoundError';
	}
}

function assertId(value: string, field: string): string {
	if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)) {
		throw new ValidationError(`${field} must be a UUID`);
	}
	return value.toLowerCase();
}

function normalizeName(value: string): string {
	const name = value.trim();
	if (Array.from(name).length < 1 || Array.from(name).length > 64) {
		throw new ValidationError('Group name must contain 1 to 64 characters');
	}
	return name;
}

function handleNameConflict(error: unknown): never {
	let cause = error;
	while (cause instanceof Error) {
		if (
			'code' in cause &&
			cause.code === '23505' &&
			'constraint' in cause &&
			cause.constraint === 'inventory_groups_inventory_name_idx'
		) {
			throw new ValidationError('A group with this name already exists');
		}
		cause = cause.cause;
	}
	throw error;
}

export async function getInventoryGroups(accountId: string, game = 'mtg') {
	// One query keeps group totals and membership selections on the same database snapshot.
	const rows = await db
		.select({
			id: inventoryGroups.id,
			name: inventoryGroups.name,
			entryId: inventoryCards.id,
			quantity: inventoryCards.quantity
		})
		.from(inventoryGroups)
		.innerJoin(inventories, eq(inventories.id, inventoryGroups.inventoryId))
		.leftJoin(inventoryGroupMemberships, eq(inventoryGroupMemberships.groupId, inventoryGroups.id))
		.leftJoin(
			inventoryCards,
			and(
				eq(inventoryCards.id, inventoryGroupMemberships.entryId),
				eq(inventoryCards.inventoryId, inventories.id),
				eq(inventoryCards.accountId, accountId),
				eq(inventoryCards.game, game)
			)
		)
		.where(and(eq(inventories.accountId, accountId), eq(inventories.game, game)))
		.orderBy(asc(sql`lower(${inventoryGroups.name})`), asc(inventoryGroups.id));

	const groups = new Map<string, InventoryGroup>();
	const memberships: InventoryGroupMembership[] = [];
	for (const row of rows) {
		let group = groups.get(row.id);
		if (!group) {
			group = { id: row.id, name: row.name, entryCount: 0, quantity: 0 };
			groups.set(row.id, group);
		}
		if (row.entryId !== null && row.quantity !== null) {
			group.entryCount += 1;
			group.quantity += row.quantity;
			memberships.push({ groupId: row.id, entryId: row.entryId });
		}
	}
	return { groups: [...groups.values()], memberships };
}

export async function createInventoryGroup(accountId: string, name: string, game = 'mtg') {
	const normalizedName = normalizeName(name);
	try {
		return await db.transaction(async (tx) => {
			const inventory = await lockInventory(tx, accountId, game);
			const [group] = await tx
				.insert(inventoryGroups)
				.values({ id: crypto.randomUUID(), inventoryId: inventory.id, name: normalizedName })
				.returning();
			await advanceInventoryRevision(tx, inventory.id);
			return group;
		});
	} catch (error) {
		handleNameConflict(error);
	}
}

export async function renameInventoryGroup(
	accountId: string,
	groupId: string,
	name: string,
	game = 'mtg'
) {
	const id = assertId(groupId, 'groupId'),
		normalizedName = normalizeName(name);
	try {
		return await db.transaction(async (tx) => {
			const inventory = await lockInventory(tx, accountId, game);
			const [existing] = await tx
				.select()
				.from(inventoryGroups)
				.where(and(eq(inventoryGroups.id, id), eq(inventoryGroups.inventoryId, inventory.id)))
				.for('update');
			if (!existing) throw new InventoryGroupNotFoundError();
			if (existing.name === normalizedName) return existing;
			const [group] = await tx
				.update(inventoryGroups)
				.set({ name: normalizedName, updatedAt: new Date() })
				.where(eq(inventoryGroups.id, id))
				.returning();
			await advanceInventoryRevision(tx, inventory.id);
			return group;
		});
	} catch (error) {
		handleNameConflict(error);
	}
}

export async function deleteInventoryGroup(accountId: string, groupId: string, game = 'mtg') {
	const id = assertId(groupId, 'groupId');
	await db.transaction(async (tx) => {
		const inventory = await lockInventory(tx, accountId, game);
		const [deleted] = await tx
			.delete(inventoryGroups)
			.where(and(eq(inventoryGroups.id, id), eq(inventoryGroups.inventoryId, inventory.id)))
			.returning({ id: inventoryGroups.id });
		if (!deleted) throw new InventoryGroupNotFoundError();
		await advanceInventoryRevision(tx, inventory.id);
	});
}

export async function replaceInventoryGroupMemberships(
	accountId: string,
	entryId: string,
	groupIds: string[],
	game = 'mtg'
) {
	const id = assertId(entryId, 'entryId'),
		selectedIds = [...new Set(groupIds.map((g) => assertId(g, 'groupId')))].sort();
	await db.transaction(async (tx) => {
		const inventory = await lockInventory(tx, accountId, game);
		const [entry] = await tx
			.select({ id: inventoryCards.id })
			.from(inventoryCards)
			.where(
				and(
					eq(inventoryCards.id, id),
					eq(inventoryCards.accountId, accountId),
					eq(inventoryCards.inventoryId, inventory.id),
					eq(inventoryCards.game, game)
				)
			)
			.for('update');
		if (!entry) throw new InventoryGroupNotFoundError('Inventory entry not found');
		if (selectedIds.length) {
			const groups = await tx
				.select({ id: inventoryGroups.id })
				.from(inventoryGroups)
				.where(
					and(
						inArray(inventoryGroups.id, selectedIds),
						eq(inventoryGroups.inventoryId, inventory.id)
					)
				)
				.orderBy(asc(inventoryGroups.id))
				.for('key share');
			if (groups.length !== selectedIds.length) throw new InventoryGroupNotFoundError();
		}
		const current = await tx
			.select({ id: inventoryGroupMemberships.groupId })
			.from(inventoryGroupMemberships)
			.where(eq(inventoryGroupMemberships.entryId, id));
		if (JSON.stringify(current.map((g) => g.id).sort()) === JSON.stringify(selectedIds)) return;
		await tx.delete(inventoryGroupMemberships).where(eq(inventoryGroupMemberships.entryId, id));
		if (selectedIds.length)
			await tx
				.insert(inventoryGroupMemberships)
				.values(selectedIds.map((groupId) => ({ groupId, entryId: id })));
		await advanceInventoryRevision(tx, inventory.id);
	});
}
