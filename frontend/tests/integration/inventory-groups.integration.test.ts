import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ensureDeckCatalogFixture } from '../deck-catalog-fixture.ts';
import type { AuthUser } from '@spellbook/contracts/auth.ts';
import { eq, inArray } from 'drizzle-orm';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

run('Inventory groups persistence and ownership', () => {
	let modules: Awaited<ReturnType<typeof loadModules>>;
	let accountId: string;
	let otherAccountId: string;
	let actor: AuthUser, otherActor: AuthUser;
	let printing: Awaited<ReturnType<typeof ensureDeckCatalogFixture>>;

	beforeAll(async () => {
		modules = await loadModules();
		printing = await ensureDeckCatalogFixture(modules.pool);
	});
	beforeEach(async () => {
		const first = await modules.application.auth.authenticate(
			'register',
			`groups_${crypto.randomUUID().slice(0, 8)}`,
			'groups-fixture-password'
		);
		const second = await modules.application.auth.authenticate(
			'register',
			`groups_${crypto.randomUUID().slice(0, 8)}`,
			'groups-fixture-password'
		);
		if (!first || !second) throw new Error('Groups fixture registration failed');
		actor = first.user;
		otherActor = second.user;
		accountId = actor.accountId;
		otherAccountId = otherActor.accountId;
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
		const group = await createInventoryGroup(accountId, '  Trade cards  ');
		expect(await getInventoryGroups(accountId)).toEqual({
			groups: [{ id: group.id, name: 'Trade cards', entryCount: 0, quantity: 0 }],
			memberships: []
		});
		await renameInventoryGroup(accountId, group.id, '  Binder  ');
		expect((await getInventoryGroups(accountId)).groups[0]).toMatchObject({
			id: group.id,
			name: 'Binder'
		});
		await deleteInventoryGroup(accountId, group.id);
		expect((await getInventoryGroups(accountId)).groups).toEqual([]);
	});

	it('validates name length and enforces case-insensitive uniqueness in PostgreSQL', async () => {
		for (const name of ['', ' \t\n ', 'x'.repeat(65)]) {
			await expect(createInventoryGroup(accountId, name)).rejects.toThrow('1 to 64');
		}
		await createInventoryGroup(accountId, '😀'.repeat(64));
		const group = await createInventoryGroup(accountId, 'Trade');
		await expect(createInventoryGroup(accountId, ' trade ')).rejects.toThrow('already exists');
		const other = await createInventoryGroup(accountId, 'Other');
		await expect(renameInventoryGroup(accountId, other.id, 'TRADE')).rejects.toThrow(
			'already exists'
		);
		await expect(
			modules.db.insert(modules.inventoryGroups).values({
				id: crypto.randomUUID(),
				inventoryId: group.inventoryId,
				name: 'tRaDe'
			})
		).rejects.toThrow();
		await createInventoryGroup(otherAccountId, 'Trade');
	});

	it('handles simultaneous duplicate names through the unique index', async () => {
		const results = await Promise.allSettled([
			createInventoryGroup(accountId, 'Binder'),
			createInventoryGroup(accountId, 'binder')
		]);
		expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
		const rejected = results.find((result) => result.status === 'rejected');
		expect(rejected).toMatchObject({ reason: { name: 'ValidationError' } });
		expect((await getInventoryGroups(accountId)).groups).toHaveLength(1);
	});

	it('counts whole entries in overlapping groups without duplicating inventory totals', async () => {
		const entries = await addEntries(accountId);
		const first = await createInventoryGroup(accountId, 'First');
		const second = await createInventoryGroup(accountId, 'Second');
		await replaceInventoryGroupMemberships(accountId, entries[0].id, [first.id, second.id]);
		await replaceInventoryGroupMemberships(accountId, entries[1].id, [first.id]);
		const snapshot = await getInventoryGroups(accountId);
		expect(snapshot.groups).toEqual([
			{ id: first.id, name: 'First', entryCount: 2, quantity: 7 },
			{ id: second.id, name: 'Second', entryCount: 1, quantity: 3 }
		]);
		expect(snapshot.memberships).toHaveLength(3);
		expect((await modules.getInventorySnapshot(accountId)).stats.total).toBe(7);

		await updateInventoryCard(accountId, entries[0].id, 9);
		const updated = await getInventoryGroups(accountId);
		expect(updated.groups.map((group) => group.quantity)).toEqual([13, 9]);
		expect(updated.memberships).toEqual(snapshot.memberships);
	});

	it('replaces the full selection, deduplicates IDs, and removes all assignments on empty save', async () => {
		const [entry] = await addEntries(accountId);
		const first = await createInventoryGroup(accountId, 'First');
		const second = await createInventoryGroup(accountId, 'Second');
		await replaceInventoryGroupMemberships(accountId, entry.id, [first.id]);
		await replaceInventoryGroupMemberships(accountId, entry.id, [second.id, second.id]);
		expect((await getInventoryGroups(accountId)).memberships).toEqual([
			{ groupId: second.id, entryId: entry.id }
		]);
		await replaceInventoryGroupMemberships(accountId, entry.id, []);
		expect((await getInventoryGroups(accountId)).memberships).toEqual([]);
		expect((await modules.getInventorySnapshot(accountId)).stats.total).toBe(7);
	});

	it('rejects foreign and missing groups without changing existing memberships', async () => {
		const [entry] = await addEntries(accountId);
		const owned = await createInventoryGroup(accountId, 'Owned');
		const foreign = await createInventoryGroup(otherAccountId, 'Foreign');
		await replaceInventoryGroupMemberships(accountId, entry.id, [owned.id]);
		for (const invalidId of [foreign.id, crypto.randomUUID()]) {
			await expect(
				replaceInventoryGroupMemberships(accountId, entry.id, [owned.id, invalidId])
			).rejects.toThrow('Inventory group not found');
			expect((await getInventoryGroups(accountId)).memberships).toEqual([
				{ groupId: owned.id, entryId: entry.id }
			]);
		}
	});

	it('isolates account reads, renames, deletes, and entry assignment', async () => {
		const [entry] = await addEntries(accountId);
		const group = await createInventoryGroup(accountId, 'Private');
		await expect(renameInventoryGroup(otherAccountId, group.id, 'Changed')).rejects.toThrow(
			'not found'
		);
		await expect(deleteInventoryGroup(otherAccountId, group.id)).rejects.toThrow('not found');
		await expect(replaceInventoryGroupMemberships(otherAccountId, entry.id, [])).rejects.toThrow(
			'Inventory entry not found'
		);
		expect(await getInventoryGroups(otherAccountId)).toEqual({
			groups: [],
			memberships: []
		});
		expect((await getInventoryGroups(accountId)).groups[0].name).toBe('Private');
	});

	it('rejects entries whose stored game or inventory owner differs from the session', async () => {
		const [entry] = await addEntries(accountId);
		const group = await createInventoryGroup(accountId, 'Owned');
		await modules.db
			.update(modules.inventoryCards)
			.set({ game: 'other' })
			.where(eq(modules.inventoryCards.id, entry.id));
		await expect(replaceInventoryGroupMemberships(accountId, entry.id, [group.id])).rejects.toThrow(
			'Inventory entry not found'
		);
		const foreignInventory = await modules.ensureInventory(otherAccountId, 'mtg');
		await modules.db
			.update(modules.inventoryCards)
			.set({ game: 'mtg', inventoryId: foreignInventory.id })
			.where(eq(modules.inventoryCards.id, entry.id));
		await expect(replaceInventoryGroupMemberships(accountId, entry.id, [group.id])).rejects.toThrow(
			'Inventory entry not found'
		);
	});

	it('deletes groups without removing cards and cascades entry deletion to memberships', async () => {
		const [entry] = await addEntries(accountId);
		const first = await createInventoryGroup(accountId, 'First');
		const second = await createInventoryGroup(accountId, 'Second');
		await replaceInventoryGroupMemberships(accountId, entry.id, [first.id, second.id]);
		await deleteInventoryGroup(accountId, first.id);
		expect((await modules.getInventorySnapshot(accountId)).stats.total).toBe(7);
		expect((await getInventoryGroups(accountId)).memberships).toEqual([
			{ groupId: second.id, entryId: entry.id }
		]);
		await removeInventoryCard(accountId, entry.id);
		expect(await getInventoryGroups(accountId)).toEqual({
			groups: [{ id: second.id, name: 'Second', entryCount: 0, quantity: 0 }],
			memberships: []
		});
	});

	it('serializes simultaneous full replacements into one complete selection', async () => {
		const [entry] = await addEntries(accountId);
		const groups = await Promise.all(
			['A', 'B', 'C', 'D'].map((name) => createInventoryGroup(accountId, name))
		);
		const selections = [
			groups.slice(0, 2).map((group) => group.id),
			groups.slice(2).map((group) => group.id)
		];
		await Promise.all(
			Array.from({ length: 12 }, (_, index) =>
				replaceInventoryGroupMemberships(accountId, entry.id, selections[index % 2])
			)
		);
		const memberships = (await getInventoryGroups(accountId)).memberships;
		const assigned = memberships.map((membership) => membership.groupId).sort();
		expect(selections.map((selection) => [...selection].sort())).toContainEqual(assigned);
	});

	const ownerActor = (owner: string) => (owner === accountId ? actor : otherActor);
	async function createInventoryGroup(owner: string, name: string) {
		const ack = await modules.application.inventory.createGroup(ownerActor(owner), {
			requestId: crypto.randomUUID(),
			name
		});
		return { id: ack.groups[0].groupId, inventoryId: ack.inventoryId! };
	}
	const renameInventoryGroup = (owner: string, groupId: string, name: string) =>
		modules.application.inventory.renameGroup(ownerActor(owner), {
			requestId: crypto.randomUUID(),
			groupId,
			name
		});
	const deleteInventoryGroup = (owner: string, groupId: string) =>
		modules.application.inventory.deleteGroup(ownerActor(owner), {
			requestId: crypto.randomUUID(),
			groupId
		});
	const replaceInventoryGroupMemberships = (owner: string, entryId: string, groupIds: string[]) =>
		modules.application.inventory.replaceMemberships(ownerActor(owner), {
			requestId: crypto.randomUUID(),
			entryId,
			groupIds
		});
	const updateInventoryCard = (owner: string, entryId: string, quantity: number) =>
		modules.application.inventory.patchEntry(ownerActor(owner), {
			requestId: crypto.randomUUID(),
			entryId,
			quantity
		});
	async function removeInventoryCard(owner: string, entryId: string) {
		const detail = await modules.application.inventory.getEntry(ownerActor(owner), entryId);
		if (!detail) throw new Error('Missing fixture entry');
		return modules.application.inventory.remove(ownerActor(owner), {
			requestId: crypto.randomUUID(),
			entryId,
			expectedQuantity: detail.entry.quantity
		});
	}
	const bulkMutateInventory = (
		owner: string,
		input: import('@spellbook/contracts/inventory.ts').InventoryBulkInput
	) => modules.application.inventory.bulk(ownerActor(owner), input);
	async function getInventoryGroups(owner: string) {
		const page = await modules.application.inventory.page(ownerActor(owner), { limit: 100 });
		if (page.kind !== 'Page') throw new Error('Expected current Groups fixture');
		return { groups: page.groups, memberships: page.memberships };
	}

	async function addEntries(owner: string) {
		await bulkMutateInventory(owner, {
			requestId: crypto.randomUUID(),
			source: 'web',
			game: 'mtg',
			operations: ['NM', 'LP'].map((condition, index) => ({
				op: 'add' as const,
				card: printing,
				finish: 'nonfoil',
				condition,
				quantity: index + 3
			}))
		});
		const page = await modules.application.inventory.page(
			owner === accountId ? actor : otherActor,
			{}
		);
		if (page.kind !== 'Page') throw new Error('Expected current Groups fixture');
		return page.entries;
	}
});

async function loadModules() {
	const [client, schema, inventory, groups] = await Promise.all([
		import('../fixtures/database.ts'),
		import('@spellbook/backend/db/schema.ts'),
		import('../../src/lib/server/data/inventory'),
		import('../../src/lib/server/data/inventory-groups')
	]);
	return {
		...client,
		...schema,
		...inventory,
		...(await import('../fixtures/inventory-state.ts')),
		...groups,
		application: (await import('../../src/lib/server/composition.ts')).application
	};
}
