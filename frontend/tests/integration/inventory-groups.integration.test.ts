import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

run('Inventory groups persistence and ownership', () => {
	let modules: Awaited<ReturnType<typeof loadModules>>;
	let accountId: string;
	let otherAccountId: string;

	beforeAll(async () => {
		modules = await loadModules();
	});
	beforeEach(async () => {
		accountId = `groups-${crypto.randomUUID()}`;
		otherAccountId = `groups-other-${crypto.randomUUID()}`;
		await modules.db.insert(modules.userProfiles).values([
			{ accountId, username: accountId },
			{ accountId: otherAccountId, username: otherAccountId }
		]);
	});
	afterEach(async () => {
		await modules.db
			.delete(modules.inventoryMutationRequests)
			.where(inArray(modules.inventoryMutationRequests.accountId, [accountId, otherAccountId]));
		await modules.db
			.delete(modules.userProfiles)
			.where(inArray(modules.userProfiles.accountId, [accountId, otherAccountId]));
	});
	afterAll(async () => {
		await modules?.pool.end();
	});

	it('persists trimmed names, renames stable IDs, and lists empty groups', async () => {
		const group = await modules.createInventoryGroup(accountId, '  Trade cards  ');
		expect(await modules.getInventoryGroups(accountId)).toEqual({
			groups: [{ id: group.id, name: 'Trade cards', entryCount: 0, quantity: 0 }],
			memberships: []
		});
		await modules.renameInventoryGroup(accountId, group.id, '  Binder  ');
		expect((await modules.getInventoryGroups(accountId)).groups[0]).toMatchObject({
			id: group.id,
			name: 'Binder'
		});
		await modules.deleteInventoryGroup(accountId, group.id);
		expect((await modules.getInventoryGroups(accountId)).groups).toEqual([]);
	});

	it('validates name length and enforces case-insensitive uniqueness in PostgreSQL', async () => {
		for (const name of ['', ' \t\n ', 'x'.repeat(65)]) {
			await expect(modules.createInventoryGroup(accountId, name)).rejects.toThrow('1 to 64');
		}
		await modules.createInventoryGroup(accountId, '😀'.repeat(64));
		const group = await modules.createInventoryGroup(accountId, 'Trade');
		await expect(modules.createInventoryGroup(accountId, ' trade ')).rejects.toThrow(
			'already exists'
		);
		const other = await modules.createInventoryGroup(accountId, 'Other');
		await expect(modules.renameInventoryGroup(accountId, other.id, 'TRADE')).rejects.toThrow(
			'already exists'
		);
		await expect(
			modules.db.insert(modules.inventoryGroups).values({
				id: crypto.randomUUID(),
				inventoryId: group.inventoryId,
				name: 'tRaDe'
			})
		).rejects.toThrow();
		await modules.createInventoryGroup(otherAccountId, 'Trade');
	});

	it('handles simultaneous duplicate names through the unique index', async () => {
		const results = await Promise.allSettled([
			modules.createInventoryGroup(accountId, 'Binder'),
			modules.createInventoryGroup(accountId, 'binder')
		]);
		expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
		const rejected = results.find((result) => result.status === 'rejected');
		expect(rejected).toMatchObject({ reason: { name: 'ValidationError' } });
		expect((await modules.getInventoryGroups(accountId)).groups).toHaveLength(1);
	});

	it('counts whole entries in overlapping groups without duplicating inventory totals', async () => {
		const entries = await addEntries(accountId);
		const first = await modules.createInventoryGroup(accountId, 'First');
		const second = await modules.createInventoryGroup(accountId, 'Second');
		await modules.replaceInventoryGroupMemberships(accountId, entries[0].id, [first.id, second.id]);
		await modules.replaceInventoryGroupMemberships(accountId, entries[1].id, [first.id]);
		const snapshot = await modules.getInventoryGroups(accountId);
		expect(snapshot.groups).toEqual([
			{ id: first.id, name: 'First', entryCount: 2, quantity: 7 },
			{ id: second.id, name: 'Second', entryCount: 1, quantity: 3 }
		]);
		expect(snapshot.memberships).toHaveLength(3);
		expect((await modules.getInventorySnapshot(accountId)).stats.total).toBe(7);

		await modules.updateInventoryCard(accountId, entries[0].id, 9);
		const updated = await modules.getInventoryGroups(accountId);
		expect(updated.groups.map((group) => group.quantity)).toEqual([13, 9]);
		expect(updated.memberships).toEqual(snapshot.memberships);
	});

	it('replaces the full selection, deduplicates IDs, and removes all assignments on empty save', async () => {
		const [entry] = await addEntries(accountId);
		const first = await modules.createInventoryGroup(accountId, 'First');
		const second = await modules.createInventoryGroup(accountId, 'Second');
		await modules.replaceInventoryGroupMemberships(accountId, entry.id, [first.id]);
		await modules.replaceInventoryGroupMemberships(accountId, entry.id, [second.id, second.id]);
		expect((await modules.getInventoryGroups(accountId)).memberships).toEqual([
			{ groupId: second.id, entryId: entry.id }
		]);
		await modules.replaceInventoryGroupMemberships(accountId, entry.id, []);
		expect((await modules.getInventoryGroups(accountId)).memberships).toEqual([]);
		expect((await modules.getInventorySnapshot(accountId)).stats.total).toBe(7);
	});

	it('rejects foreign and missing groups without changing existing memberships', async () => {
		const [entry] = await addEntries(accountId);
		const owned = await modules.createInventoryGroup(accountId, 'Owned');
		const foreign = await modules.createInventoryGroup(otherAccountId, 'Foreign');
		await modules.replaceInventoryGroupMemberships(accountId, entry.id, [owned.id]);
		for (const invalidId of [foreign.id, crypto.randomUUID()]) {
			await expect(
				modules.replaceInventoryGroupMemberships(accountId, entry.id, [owned.id, invalidId])
			).rejects.toThrow('Inventory group not found');
			expect((await modules.getInventoryGroups(accountId)).memberships).toEqual([
				{ groupId: owned.id, entryId: entry.id }
			]);
		}
	});

	it('isolates account reads, renames, deletes, and entry assignment', async () => {
		const [entry] = await addEntries(accountId);
		const group = await modules.createInventoryGroup(accountId, 'Private');
		await expect(modules.renameInventoryGroup(otherAccountId, group.id, 'Changed')).rejects.toThrow(
			'not found'
		);
		await expect(modules.deleteInventoryGroup(otherAccountId, group.id)).rejects.toThrow(
			'not found'
		);
		await expect(
			modules.replaceInventoryGroupMemberships(otherAccountId, entry.id, [])
		).rejects.toThrow('Inventory entry not found');
		expect(await modules.getInventoryGroups(otherAccountId)).toEqual({
			groups: [],
			memberships: []
		});
		expect((await modules.getInventoryGroups(accountId)).groups[0].name).toBe('Private');
	});

	it('rejects entries whose stored game or inventory owner differs from the session', async () => {
		const [entry] = await addEntries(accountId);
		const group = await modules.createInventoryGroup(accountId, 'Owned');
		await modules.db
			.update(modules.inventoryCards)
			.set({ game: 'other' })
			.where(eq(modules.inventoryCards.id, entry.id));
		await expect(
			modules.replaceInventoryGroupMemberships(accountId, entry.id, [group.id])
		).rejects.toThrow('Inventory entry not found');
		const foreignInventory = await modules.ensureInventory(otherAccountId, 'mtg');
		await modules.db
			.update(modules.inventoryCards)
			.set({ game: 'mtg', inventoryId: foreignInventory.id })
			.where(eq(modules.inventoryCards.id, entry.id));
		await expect(
			modules.replaceInventoryGroupMemberships(accountId, entry.id, [group.id])
		).rejects.toThrow('Inventory entry not found');
	});

	it('deletes groups without removing cards and cascades entry deletion to memberships', async () => {
		const [entry] = await addEntries(accountId);
		const first = await modules.createInventoryGroup(accountId, 'First');
		const second = await modules.createInventoryGroup(accountId, 'Second');
		await modules.replaceInventoryGroupMemberships(accountId, entry.id, [first.id, second.id]);
		await modules.deleteInventoryGroup(accountId, first.id);
		expect((await modules.getInventorySnapshot(accountId)).stats.total).toBe(7);
		expect((await modules.getInventoryGroups(accountId)).memberships).toEqual([
			{ groupId: second.id, entryId: entry.id }
		]);
		await modules.removeInventoryCard(accountId, entry.id);
		expect(await modules.getInventoryGroups(accountId)).toEqual({
			groups: [{ id: second.id, name: 'Second', entryCount: 0, quantity: 0 }],
			memberships: []
		});
	});

	it('serializes simultaneous full replacements into one complete selection', async () => {
		const [entry] = await addEntries(accountId);
		const groups = await Promise.all(
			['A', 'B', 'C', 'D'].map((name) => modules.createInventoryGroup(accountId, name))
		);
		const selections = [
			groups.slice(0, 2).map((group) => group.id),
			groups.slice(2).map((group) => group.id)
		];
		await Promise.all(
			Array.from({ length: 12 }, (_, index) =>
				modules.replaceInventoryGroupMemberships(accountId, entry.id, selections[index % 2])
			)
		);
		const memberships = (await modules.getInventoryGroups(accountId)).memberships;
		const assigned = memberships.map((membership) => membership.groupId).sort();
		expect(selections.map((selection) => [...selection].sort())).toContainEqual(assigned);
	});

	async function addEntries(owner: string) {
		const snapshot = await modules.bulkMutateInventory(owner, {
			requestId: crypto.randomUUID(),
			source: 'web',
			game: 'mtg',
			operations: ['one', 'two'].map((id, index) => ({
				op: 'add' as const,
				card: {
					catalogCardId: id,
					canonicalCardId: `oracle-${id}`,
					name: id,
					setCode: 'tst',
					imageUri: ''
				},
				finish: 'nonfoil',
				condition: 'NM',
				quantity: index + 3
			}))
		});
		return snapshot.cards;
	}
});

async function loadModules() {
	const [client, schema, inventory, groups] = await Promise.all([
		import('../../src/lib/server/db/client'),
		import('../../src/lib/server/db/schema'),
		import('../../src/lib/server/data/inventory'),
		import('../../src/lib/server/data/inventory-groups')
	]);
	return { ...client, ...schema, ...inventory, ...groups };
}
