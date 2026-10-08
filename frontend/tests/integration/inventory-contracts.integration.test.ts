import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '@spellbook/contracts/auth.ts';
import { ensureDeckCatalogFixture } from '../deck-catalog-fixture.ts';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;
run('authorized Inventory mutation contracts', () => {
	let application: typeof import('../../src/lib/server/composition.ts').application;
	let pool: typeof import('../fixtures/database.ts').pool;
	let actor: AuthUser;
	let card: Awaited<ReturnType<typeof ensureDeckCatalogFixture>>;
	beforeAll(async () => {
		({ application } = await import('../../src/lib/server/composition.ts'));
		({ pool } = await import('../fixtures/database.ts'));
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
		vi.restoreAllMocks();
		await pool.query('DELETE FROM inventory_mutation_requests WHERE account_id=$1', [
			actor.accountId
		]);
		await pool.query('DELETE FROM user_profiles WHERE account_id=$1', [actor.accountId]);
	});
	afterAll(async () => {
		await pool.end();
	});
	const addInput = (quantity = 2) => ({
		requestId: crypto.randomUUID(),
		catalogCardId: card.catalogCardId,
		finish: 'nonfoil',
		condition: 'NM',
		quantity
	});
	it('replays original Add and reviewed Remove after deletion/recreation without Catalog or current preconditions', async () => {
		const input = addInput();
		const original = await application.inventory.add(actor, input);
		const entryId = original.changes[0].entryId;
		const removeInput = { requestId: crypto.randomUUID(), entryId, expectedQuantity: 2 };
		const removed = await application.inventory.remove(actor, removeInput);
		const recreated = await application.inventory.add(actor, addInput(7));
		expect(recreated.changes[0].entryId).not.toBe(entryId);
		const lookup = vi
			.spyOn(application.catalog, 'getCatalogPrinting')
			.mockRejectedValue(new Error('Catalog unavailable'));
		expect(await application.inventory.add(actor, input)).toEqual(original);
		expect(await application.inventory.remove(actor, removeInput)).toEqual(removed);
		expect(lookup).not.toHaveBeenCalled();
		await expect(application.inventory.add(actor, { ...input, quantity: 3 })).rejects.toThrow(
			'different mutation'
		);
		expect(
			(await application.inventory.getEntry(actor, recreated.changes[0].entryId))?.entry.quantity
		).toBe(7);
	});
	it('rejects revoked and expired genuine actors before replaying a persisted receipt', async () => {
		const input = addInput();
		await application.inventory.add(actor, input);
		await pool.query(
			"UPDATE auth_sessions SET expires_at=now()-interval '1 second' WHERE account_id=$1",
			[actor.accountId]
		);
		await expect(application.inventory.add(actor, input)).rejects.toMatchObject({
			kind: 'Unauthenticated'
		});
		await pool.query('DELETE FROM auth_sessions WHERE account_id=$1', [actor.accountId]);
		await expect(application.inventory.add(actor, input)).rejects.toMatchObject({
			kind: 'Unauthenticated'
		});
	});
	it('preserves omitted Notes, merges quantity changes independently, rejects stale Notes atomically', async () => {
		const added = await application.inventory.add(actor, { ...addInput(), notes: 'Original' });
		const entryId = added.changes[0].entryId;
		await application.inventory.patchEntry(actor, {
			requestId: crypto.randomUUID(),
			entryId,
			notes: 'First draft',
			notesRevision: '0'
		});
		await application.inventory.add(actor, addInput());
		await application.inventory.patchEntry(actor, {
			requestId: crypto.randomUUID(),
			entryId,
			delta: 1
		});
		await expect(
			application.inventory.patchEntry(actor, {
				requestId: crypto.randomUUID(),
				entryId,
				quantity: 10,
				notes: 'Stale draft',
				notesRevision: '0'
			})
		).rejects.toMatchObject({
			kindOfFailure: 'NotesConflict',
			latest: { notes: 'First draft', notesRevision: '1' }
		});
		expect((await application.inventory.getEntry(actor, entryId))?.entry).toMatchObject({
			quantity: 5,
			notes: 'First draft',
			notesRevision: '1'
		});
		const noOp = await application.inventory.patchEntry(actor, {
			requestId: crypto.randomUUID(),
			entryId,
			notes: 'First draft',
			notesRevision: '1'
		});
		const before = await application.inventory.getEntry(actor, entryId);
		expect(noOp.revision).toBe(before?.revision);
		const unchanged = await application.inventory.patchEntry(actor, {
			requestId: crypto.randomUUID(),
			entryId,
			quantity: 5
		});
		expect(unchanged.revision).toBe(noOp.revision);
		expect((await application.inventory.getEntry(actor, entryId))?.entry.updatedAt).toBe(
			before?.entry.updatedAt
		);
	});
	it('rejects forged actors, unsupported source/enums and int32 overflow before saving any mixed bulk changes', async () => {
		await expect(application.inventory.add({ ...actor }, addInput())).rejects.toMatchObject({
			kind: 'Unauthenticated'
		});
		for (const input of [
			{ ...addInput(), source: 'browser-qa' },
			{ ...addInput(), finish: 'etched' },
			{ ...addInput(), quantity: 0 },
			{ ...addInput(), quantity: 2147483648 }
		])
			await expect(
				application.inventory.add(
					actor,
					input as import('@spellbook/contracts/inventory.ts').InventoryAdd
				)
			).rejects.toThrow();
		const initial = await application.inventory.add(actor, addInput(2147483647));
		const entryId = initial.changes[0].entryId;
		await expect(
			application.inventory.bulk(actor, {
				requestId: crypto.randomUUID(),
				operations: [
					{ op: 'set', target: { entryId }, quantity: 3 },
					{ op: 'set', target: { entryId: crypto.randomUUID() }, quantity: 1 }
				]
			})
		).rejects.toThrow('not found');
		await expect(
			application.inventory.patchEntry(actor, { requestId: crypto.randomUUID(), entryId, delta: 1 })
		).rejects.toThrow();
		expect((await application.inventory.getEntry(actor, entryId))?.entry.quantity).toBe(2147483647);
		await expect(
			application.inventory.patchEntry(actor, {
				requestId: crypto.randomUUID(),
				entryId,
				delta: -2147483648
			})
		).rejects.toThrow();
		await application.inventory.patchEntry(actor, {
			requestId: crypto.randomUUID(),
			entryId,
			delta: -2147483647
		});
		expect((await application.inventory.getEntry(actor, entryId))?.entry.quantity).toBe(1);
	});
	it('replays import text before Catalog, preserves Notes, and binds text/defaults/source to the caller ID', async () => {
		const initial = await application.inventory.add(actor, { ...addInput(), notes: 'Keep this' });
		const input = {
			requestId: crypto.randomUUID(),
			text: '2 Sol Ring',
			defaultFinish: 'nonfoil',
			defaultCondition: 'NM'
		};
		const receipt = await application.inventory.commitImport(actor, input);
		expect(receipt.import?.resolvedCount).toBe(1);
		expect(
			(await application.inventory.getEntry(actor, initial.changes[0].entryId))?.entry.notes
		).toBe('Keep this');
		const lookup = vi
			.spyOn(application.catalog, 'resolveCatalogCandidates')
			.mockRejectedValue(new Error('Catalog unavailable'));
		expect(await application.inventory.commitImport(actor, input)).toEqual(receipt);
		expect(lookup).not.toHaveBeenCalled();
		await expect(
			application.inventory.commitImport(actor, { ...input, text: '3 Sol Ring' })
		).rejects.toThrow('different mutation');
	});
	it('treats legacy null fingerprints/receipts as explicit unavailable historical acknowledgements without applying again', async () => {
		const input = addInput();
		await pool.query(
			'INSERT INTO inventory_mutation_requests(account_id,request_id,source,status)VALUES($1,$2,$3,$4)',
			[actor.accountId, input.requestId, 'mobile', 'applied']
		);
		expect(await application.inventory.add(actor, input)).toMatchObject({
			requestId: input.requestId,
			legacy: true,
			inventoryId: null,
			changes: [],
			revision: '0'
		});
		const page = await application.inventory.page(actor, {});
		expect(page.kind === 'Page' && page.totals.entryCount).toBe(0);
	});

	it('same logical reorder preserves sparse positions, timestamps and revision and replays its original receipt', async () => {
		const added = [];
		for (const condition of ['NM', 'LP', 'MP'])
			added.push(await application.inventory.add(actor, { ...addInput(), condition }));
		await application.inventory.remove(actor, {
			requestId: crypto.randomUUID(),
			entryId: added[0].changes[0].entryId,
			expectedQuantity: 2
		});
		const entryId = added[2].changes[0].entryId;
		const before = await application.inventory.getEntry(actor, entryId);
		const neighborBefore = await application.inventory.getEntry(actor, added[1].changes[0].entryId);
		const input = { requestId: crypto.randomUUID(), entryId, position: 1 };
		const acknowledgement = await application.inventory.reorder(actor, input);
		expect(acknowledgement.revision).toBe(before?.revision);
		expect((await application.inventory.getEntry(actor, entryId))?.entry).toEqual(before?.entry);
		expect(
			(await application.inventory.getEntry(actor, added[1].changes[0].entryId))?.entry
		).toEqual(neighborBefore?.entry);
		await application.inventory.patchEntry(actor, {
			requestId: crypto.randomUUID(),
			entryId,
			notes: 'Later independent save',
			notesRevision: '0'
		});
		expect(await application.inventory.reorder(actor, input)).toEqual(acknowledgement);
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
