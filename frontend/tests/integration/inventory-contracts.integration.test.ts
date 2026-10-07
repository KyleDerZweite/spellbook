import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AuthUser } from '@spellbook/contracts/auth.ts';
import { ensureDeckCatalogFixture } from '../deck-catalog-fixture.ts';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;
run('authorized Inventory mutation contracts', () => {
	let application: typeof import('../../src/lib/server/composition.ts').application;
	let pool: typeof import('../../src/lib/server/db/client.ts').pool;
	let actor: AuthUser;
	let card: Awaited<ReturnType<typeof ensureDeckCatalogFixture>>;
	beforeAll(async () => {
		({ application } = await import('../../src/lib/server/composition.ts'));
		({ pool } = await import('../../src/lib/server/db/client.ts'));
		card = await ensureDeckCatalogFixture(pool);
	});
	beforeEach(async () => {
		const session = await application.auth.authenticate(
			'register',
			`inventory_${crypto.randomUUID().slice(0, 8)}`,
			'inventory-contract-fixture-password'
		);
		if (!session) throw new Error('Fixture registration failed');
		actor = session.user;
	});
	afterEach(async () => {
		await pool.query('DELETE FROM user_profiles WHERE account_id=$1', [actor.accountId]);
	});
	afterAll(async () => {
		await pool.end();
	});
	it('concurrent ordinary reductions stop at one and replay the original floor acknowledgement', async () => {
		const added = await application.inventory.add(actor, {
			requestId: crypto.randomUUID(),
			catalogCardId: card.catalogCardId,
			finish: 'nonfoil',
			condition: 'NM',
			quantity: 2
		});
		const entryId = added.changes[0].entryId;
		const inputs = [0, 1].map(() => ({ requestId: crypto.randomUUID(), entryId, delta: -1 }));
		const receipts = await Promise.all(
			inputs.map((input) => application.inventory.patchEntry(actor, input))
		);
		expect((await application.inventory.getEntry(actor, entryId))?.entry.quantity).toBe(1);
		expect(receipts.map((receipt) => receipt.changes[0].delta).sort()).toEqual([-1, 0]);
		expect(receipts.every((receipt) => receipt.removedEntryIds.length === 0)).toBe(true);
		expect(receipts[0].revision).toBe(receipts[1].revision);
		await application.inventory.patchEntry(actor, {
			requestId: crypto.randomUUID(),
			entryId,
			delta: 1
		});
		for (let i = 0; i < inputs.length; i++)
			expect(await application.inventory.patchEntry(actor, inputs[i])).toEqual(receipts[i]);
	});
});
