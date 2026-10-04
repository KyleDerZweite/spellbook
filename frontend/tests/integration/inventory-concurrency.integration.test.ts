import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

run('Inventory concurrent mutations', () => {
	let modules: Awaited<ReturnType<typeof loadModules>>;
	let accountId: string;
	beforeAll(async () => {
		modules = await loadModules();
	});
	beforeEach(async () => {
		accountId = `inventory-concurrency-${crypto.randomUUID()}`;
		await modules.db.insert(modules.userProfiles).values({ accountId, username: accountId });
	});
	afterEach(async () => {
		await modules.db
			.delete(modules.inventoryMutationRequests)
			.where(eq(modules.inventoryMutationRequests.accountId, accountId));
		await modules.db
			.delete(modules.userProfiles)
			.where(eq(modules.userProfiles.accountId, accountId));
	});
	afterAll(async () => {
		await modules?.pool.end();
	});

	it('applies simultaneous retries exactly once', async () => {
		const input = {
			requestId: crypto.randomUUID(),
			source: 'mobile',
			game: 'mtg',
			operations: [add('retry', 3)]
		};
		await Promise.all(
			Array.from({ length: 12 }, () => modules.bulkMutateInventory(accountId, input))
		);
		const snapshot = await modules.getInventorySnapshot(accountId);
		expect(snapshot.cards).toHaveLength(1);
		expect(snapshot.cards[0].quantity).toBe(3);
		expect(snapshot.mutationRequests).toHaveLength(1);
	});

	it('rejects reusing a request ID for different inventory changes', async () => {
		const input = {
			requestId: crypto.randomUUID(),
			source: 'mobile',
			game: 'mtg',
			operations: [add('original', 3)]
		};
		await modules.bulkMutateInventory(accountId, input);
		await expect(
			modules.bulkMutateInventory(accountId, { ...input, operations: [add('changed', 5)] })
		).rejects.toThrow('different mutation');
		const snapshot = await modules.getInventorySnapshot(accountId);
		expect(snapshot.cards).toHaveLength(1);
		expect(snapshot.cards[0]).toMatchObject({ catalogCardId: 'original', quantity: 3 });
	});

	it('preserves concurrent decrements and additions', async () => {
		const initial = await mutate([add('shared', 20)]);
		const entryId = initial.cards[0].id;
		await Promise.all([
			...Array.from({ length: 12 }, () =>
				mutate([{ op: 'decrement', target: { entryId }, quantity: 1 }])
			),
			...Array.from({ length: 8 }, () => mutate([add('shared', 1)]))
		]);
		const snapshot = await modules.getInventorySnapshot(accountId);
		expect(snapshot.cards[0].quantity).toBe(16);
	});

	it('keeps positions contiguous when reorder overlaps adds and removals', async () => {
		const initial = await mutate([add('one', 1), add('two', 1), add('three', 1)]);
		await Promise.all([
			modules.reorderInventoryCard(accountId, initial.cards[2].id, 0),
			mutate([{ op: 'remove', target: { entryId: initial.cards[0].id } }]),
			...Array.from({ length: 8 }, (_, index) => mutate([add(`new-${index}`, 1)]))
		]);
		const snapshot = await modules.getInventorySnapshot(accountId);
		expect(snapshot.cards).toHaveLength(10);
		expect(snapshot.cards.map((card) => card.spellbookPosition)).toEqual(
			Array.from({ length: 10 }, (_, index) => index)
		);
	});

	async function mutate(
		operations: Parameters<typeof modules.bulkMutateInventory>[1]['operations']
	) {
		return modules.bulkMutateInventory(accountId, {
			requestId: crypto.randomUUID(),
			source: 'mobile',
			game: 'mtg',
			operations
		});
	}
});

function add(id: string, quantity: number) {
	return {
		op: 'add' as const,
		card: {
			catalogCardId: id,
			canonicalCardId: `oracle-${id}`,
			name: id,
			setCode: 'tst',
			imageUri: ''
		},
		quantity,
		finish: 'nonfoil',
		condition: 'NM'
	};
}

async function loadModules() {
	const [client, schema, inventory] = await Promise.all([
		import('../../src/lib/server/db/client'),
		import('../../src/lib/server/db/schema'),
		import('../../src/lib/server/data/inventory')
	]);
	return { ...client, ...schema, ...inventory };
}
