import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/client.ts';
import {
	inventories,
	inventoryCards,
	inventoryGroupMemberships,
	inventoryGroups
} from '#lib/server/db/schema.ts';
import { ValidationError } from '#lib/server/mtg/validation.ts';
import { ensureInventory } from './inventory';

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

function ownedInventoryIds(accountId: string, game: string) {
	return db
		.select({ id: inventories.id })
		.from(inventories)
		.where(and(eq(inventories.accountId, accountId), eq(inventories.game, game)));
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
	const inventory = await ensureInventory(accountId, game);
	try {
		const [group] = await db
			.insert(inventoryGroups)
			.values({ id: crypto.randomUUID(), inventoryId: inventory.id, name: normalizedName })
			.returning();
		return group;
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
	const id = assertId(groupId, 'groupId');
	const normalizedName = normalizeName(name);
	try {
		const [group] = await db
			.update(inventoryGroups)
			.set({ name: normalizedName, updatedAt: new Date() })
			.where(
				and(
					eq(inventoryGroups.id, id),
					inArray(inventoryGroups.inventoryId, ownedInventoryIds(accountId, game))
				)
			)
			.returning();
		if (!group) throw new InventoryGroupNotFoundError();
		return group;
	} catch (error) {
		handleNameConflict(error);
	}
}

export async function deleteInventoryGroup(accountId: string, groupId: string, game = 'mtg') {
	const id = assertId(groupId, 'groupId');
	const [deleted] = await db
		.delete(inventoryGroups)
		.where(
			and(
				eq(inventoryGroups.id, id),
				inArray(inventoryGroups.inventoryId, ownedInventoryIds(accountId, game))
			)
		)
		.returning({ id: inventoryGroups.id });
	if (!deleted) throw new InventoryGroupNotFoundError();
}

export async function replaceInventoryGroupMemberships(
	accountId: string,
	entryId: string,
	groupIds: string[],
	game = 'mtg'
) {
	const id = assertId(entryId, 'entryId');
	const selectedIds = [...new Set(groupIds.map((groupId) => assertId(groupId, 'groupId')))];
	await db.transaction(async (tx) => {
		const [entry] = await tx
			.select({ inventoryId: inventoryCards.inventoryId })
			.from(inventoryCards)
			.innerJoin(inventories, eq(inventories.id, inventoryCards.inventoryId))
			.where(
				and(
					eq(inventoryCards.id, id),
					eq(inventoryCards.accountId, accountId),
					eq(inventoryCards.game, game),
					eq(inventories.accountId, accountId),
					eq(inventories.game, game)
				)
			)
			.for('update', { of: inventoryCards });
		if (!entry) throw new InventoryGroupNotFoundError('Inventory entry not found');

		if (selectedIds.length > 0) {
			const groups = await tx
				.select({ id: inventoryGroups.id })
				.from(inventoryGroups)
				.where(
					and(
						inArray(inventoryGroups.id, selectedIds),
						eq(inventoryGroups.inventoryId, entry.inventoryId)
					)
				)
				.orderBy(asc(inventoryGroups.id))
				.for('key share');
			if (groups.length !== selectedIds.length) throw new InventoryGroupNotFoundError();
		}

		await tx.delete(inventoryGroupMemberships).where(eq(inventoryGroupMemberships.entryId, id));
		if (selectedIds.length > 0) {
			await tx
				.insert(inventoryGroupMemberships)
				.values(selectedIds.map((groupId) => ({ groupId, entryId: id })));
		}
	});
}
