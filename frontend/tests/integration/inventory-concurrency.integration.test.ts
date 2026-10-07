import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ensureDeckCatalogFixture } from '../deck-catalog-fixture.ts';
import type { AuthUser } from '@spellbook/contracts/auth.ts';
import { eq } from 'drizzle-orm';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

run('Inventory concurrent mutations', () => {
	let modules: Awaited<ReturnType<typeof loadModules>>;
	let accountId: string;
	let actor: AuthUser;
	let printing: Awaited<ReturnType<typeof ensureDeckCatalogFixture>>;
	beforeAll(async () => {
		modules = await loadModules();
		printing = await ensureDeckCatalogFixture(modules.pool);
	});
	beforeEach(async () => {
		const session = await modules.application.auth.authenticate(
			'register',
			`concurrency_${crypto.randomUUID().slice(0, 8)}`,
			'inventory-concurrency-password'
		);
		if (!session) throw new Error('Concurrency fixture registration failed');
		actor = session.user;
		accountId = actor.accountId;
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
			source: 'mobile' as const,
			game: 'mtg' as const,
			operations: [add('retry', 3)]
		};
		await Promise.all(Array.from({ length: 12 }, () => modules.bulkMutateInventory(actor, input)));
		const snapshot = await modules.getInventorySnapshot(accountId);
		expect(snapshot.cards).toHaveLength(1);
		expect(snapshot.cards[0].quantity).toBe(3);
		expect(snapshot.mutationRequests).toHaveLength(1);
	});

	it('rejects reusing a request ID for different inventory changes', async () => {
		const input = {
			requestId: crypto.randomUUID(),
			source: 'mobile' as const,
			game: 'mtg' as const,
			operations: [add('original', 3)]
		};
		await modules.bulkMutateInventory(actor, input);
		await expect(
			modules.bulkMutateInventory(actor, { ...input, operations: [add('changed', 5)] })
		).rejects.toThrow('different mutation');
		const snapshot = await modules.getInventorySnapshot(accountId);
		expect(snapshot.cards).toHaveLength(1);
		expect(snapshot.cards[0]).toMatchObject({ catalogCardId: printing.catalogCardId, quantity: 3 });
	});

	it('preserves concurrent decrements and additions', async () => {
		const initial = await mutate([add('shared', 20)]);
		const entryId = initial.changes[0].entryId;
		await Promise.all([
			...Array.from({ length: 12 }, () =>
				mutate([{ op: 'decrement', target: { entryId }, quantity: 1 }])
			),
			...Array.from({ length: 8 }, () => mutate([add('shared', 1)]))
		]);
		const snapshot = await modules.getInventorySnapshot(accountId);
		expect(snapshot.cards[0].quantity).toBe(16);
	});

	it('keeps unique ordered positions when explicit reorder overlaps additions and sparse removals', async () => {
		const initial = await mutate([add('one', 1), add('two', 1), add('three', 1)]);
		await Promise.all([
			modules.reorderInventoryCard(actor, {
				requestId: crypto.randomUUID(),
				entryId: initial.changes[2].entryId,
				position: 0
			}),
			mutate([{ op: 'remove', target: { entryId: initial.changes[0].entryId } }]),
			...Array.from({ length: 7 }, (_, index) => mutate([add(`new-${index}`, 1)]))
		]);
		const snapshot = await modules.getInventorySnapshot(accountId);
		expect(snapshot.cards).toHaveLength(9);
		const positions = snapshot.cards.map((card) => card.spellbookPosition);
		expect(new Set(positions).size).toBe(positions.length);
		expect(positions).toEqual([...positions].sort((a, b) => a - b));
	});

	function add(alias: string, quantity: number) {
		const index =
			alias === 'one'
				? 0
				: alias === 'two'
					? 1
					: alias === 'three'
						? 2
						: alias.startsWith('new-')
							? Number(alias.slice(4)) + 3
							: 0;
		return {
			op: 'add' as const,
			card: {
				...printing,
				catalogCardId: index >= 5 ? printing.alternateCatalogCardId : printing.catalogCardId
			},
			quantity,
			finish: 'nonfoil',
			condition: ['NM', 'LP', 'MP', 'HP', 'DMG'][index % 5]
		};
	}

	async function mutate(
		operations: Parameters<typeof modules.bulkMutateInventory>[1]['operations']
	) {
		return modules.bulkMutateInventory(actor, {
			requestId: crypto.randomUUID(),
			source: 'mobile' as const,
			game: 'mtg' as const,
			operations
		});
	}
});

async function loadModules() {
	const [client, schema, inventory] = await Promise.all([
		import('../../src/lib/server/db/client'),
		import('../../src/lib/server/db/schema'),
		import('../../src/lib/server/data/inventory')
	]);
	return {
		...client,
		...schema,
		...inventory,
		...(await import('../fixtures/inventory-state.ts')),
		application: (await import('../../src/lib/server/composition.ts')).application
	};
}
