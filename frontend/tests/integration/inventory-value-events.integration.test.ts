import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
	createDatabase,
	createLocalAuth,
	createSavedState,
	createInventoryValues,
	createValuation,
	createValueHistoryRunner
} from '@spellbook/backend';
import type { AuthUser } from '@spellbook/contracts/auth.ts';
const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;
run('value event privacy and commit boundaries', () => {
	let database: ReturnType<typeof createDatabase>,
		auth: ReturnType<typeof createLocalAuth>,
		sync: ReturnType<typeof createSavedState>,
		a: AuthUser,
		b: AuthUser;
	beforeAll(async () => {
		database = createDatabase(process.env.TEST_DATABASE_URL!);
		auth = createLocalAuth(database.db, { demoMode: false });
		sync = createSavedState(process.env.TEST_DATABASE_URL!, auth);
		const left = await auth.authenticate(
				'register',
				've_' + randomUUID().slice(0, 8),
				'reference-test-password'
			),
			right = await auth.authenticate(
				'register',
				've_' + randomUUID().slice(0, 8),
				'reference-test-password'
			);
		if (!left || !right) throw Error('Actor fixtures');
		a = left.user;
		b = right.user;
	});
	afterAll(async () => {
		await sync.close();
		await database.pool.query('DELETE FROM user_profiles WHERE account_id=ANY($1::text[])', [
			[a.accountId, b.accountId]
		]);
		await database.pool.end();
	});
	const settle = () => new Promise((resolve) => setTimeout(resolve, 100));
	it('accepts only the exact public values payload and preserves account isolation', async () => {
		const left = await sync.subscribe(a),
			right = await sync.subscribe(b);
		await left.next();
		await right.next();
		for (const payload of [
			{ public: true, topic: 'inventory' },
			{ public: true, topic: 'values', accountId: a.accountId },
			{ public: true, topic: 'values', evidence: {} },
			{ public: false, topic: 'values', accountId: a.accountId }
		])
			await database.pool.query('SELECT pg_notify($1,$2)', [
				'spellbook_saved_state',
				JSON.stringify(payload)
			]);
		await settle();
		expect(sync.diagnostics().queuedEvents).toBe(0);
		await database.pool.query('SELECT pg_notify($1,$2)', [
			'spellbook_saved_state',
			JSON.stringify({ accountId: a.accountId, topic: 'values' })
		]);
		await settle();
		expect(sync.diagnostics().queuedEvents).toBe(1);
		expect(await left.next()).toEqual({ event: 'invalidate', data: { topics: ['values'] } });
		await database.pool.query('SELECT pg_notify($1,$2)', [
			'spellbook_saved_state',
			JSON.stringify({ public: true, topic: 'values' })
		]);
		expect(await left.next()).toEqual({ event: 'invalidate', data: { topics: ['values'] } });
		expect(await right.next()).toEqual({ event: 'invalidate', data: { topics: ['values'] } });
		left.close();
		right.close();
	});
	it('notifies global values only on actual public state changes and committed private capture', async () => {
		const sub = await sync.subscribe(a);
		await sub.next();
		await database.pool.query('UPDATE price_state SET refresh_status=refresh_status WHERE id=1');
		await settle();
		expect(sync.diagnostics().queuedEvents).toBe(0);
		const tx = await database.pool.connect();
		try {
			await tx.query('BEGIN');
			await tx.query(
				`UPDATE price_state SET refresh_status=coalesce(refresh_status,'{}'::jsonb)||'{"valueEventFixture":true}' WHERE id=1`
			);
			await tx.query('ROLLBACK');
		} finally {
			tx.release();
		}
		await settle();
		expect(sync.diagnostics().queuedEvents).toBe(0);
		const old = (await database.pool.query('SELECT refresh_status FROM price_state WHERE id=1'))
			.rows[0].refresh_status;
		await database.pool.query(
			`UPDATE price_state SET refresh_status=coalesce(refresh_status,'{}'::jsonb)||'{"valueEventFixture":true}' WHERE id=1`
		);
		expect(await sub.next()).toEqual({ event: 'invalidate', data: { topics: ['values'] } });
		await database.pool.query('UPDATE price_state SET refresh_status=$1 WHERE id=1', [old]);
		await sub.next();
		const values = createInventoryValues(database.pool, auth, createValuation(database.pool, auth));
		const runner = createValueHistoryRunner(database.pool, values, {
			accountIds: [a.accountId],
			observationClock: () => new Date('2026-10-07T21:59:30Z')
		});
		await runner.runOnce();
		await runner.close();
		expect(await sub.next()).toEqual({ event: 'invalidate', data: { topics: ['values'] } });
		const failing = createValueHistoryRunner(database.pool, values, {
			accountIds: [a.accountId],
			observationClock: () => new Date('2026-10-07T21:59:50Z'),
			beforeCommit: async () => {
				throw Error('controlled rollback');
			}
		});
		expect((await failing.runOnce()).failedAccounts).toBe(1);
		await failing.close();
		await settle();
		expect(sync.diagnostics().queuedEvents).toBe(0);
		sub.close();
	});
	it('global values still revalidate revocation before delivery', async () => {
		const sub = await sync.subscribe(b);
		await sub.next();
		await database.pool.query('SELECT pg_notify($1,$2)', [
			'spellbook_saved_state',
			JSON.stringify({ public: true, topic: 'values' })
		]);
		const event = await sub.next();
		if (!event) throw Error('Value event');
		await database.pool.query('DELETE FROM auth_sessions WHERE account_id=$1', [b.accountId]);
		expect(await sub.deliver(event)).toEqual({ event: 'auth-expired', data: {} });
		sub.close();
	});
});
