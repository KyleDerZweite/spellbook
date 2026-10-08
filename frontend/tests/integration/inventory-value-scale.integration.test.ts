import { describe, it, expect } from 'vitest';
import { writeFile } from 'node:fs/promises';
import {
	createDatabase,
	createLocalAuth,
	createValuation,
	createInventoryValues,
	createValueHistoryRunner
} from '@spellbook/backend';
const accountId = process.env.TEST_VALUE_SCALE_ACCOUNT_ID;
const run = process.env.TEST_DATABASE_URL && accountId ? describe : describe.skip;
run('actual 50000 holding value checkpoint evidence', () => {
	it('captures all conditions with deduplicated evidence and bounded aggregate responses', async () => {
		const database = createDatabase(process.env.TEST_DATABASE_URL!);
		const auth = createLocalAuth(database.db, { demoMode: false });
		const values = createInventoryValues(database.pool, auth, createValuation(database.pool, auth));
		const credential = (
			await database.pool.query('SELECT password_hash FROM local_credentials WHERE account_id=$1', [
				accountId
			])
		).rows[0];
		const session = await auth.createSession(accountId!, credential.password_hash);
		if (!session) throw Error('Scale actor session');
		const actor = await auth.validateSession(session.token);
		if (!actor) throw Error('Scale actor');
		const clock = new Date('2026-10-06T21:59:30Z');
		const runner = createValueHistoryRunner(database.pool, values, {
			accountIds: [accountId!],
			observationClock: () => clock
		});
		try {
			await database.pool.query(
				"DELETE FROM inventory_value_days WHERE account_id=$1 AND day='2026-10-06'",
				[accountId]
			);
			const count = (
				await database.pool.query(
					"SELECT count(*)::int AS holdings,count(DISTINCT(catalog_card_id,finish))::int AS pairs,sum(quantity)::int AS quantity FROM inventory_cards WHERE account_id=$1 AND game='mtg'",
					[accountId]
				)
			).rows[0];
			expect(count.holdings).toBe(50000);
			expect(count.pairs).toBe(10000);
			let start = performance.now();
			const capture = await runner.runOnce(),
				captureMs = performance.now() - start;
			expect(capture).toMatchObject({
				capturedAccounts: 1,
				capturedHoldings: 50000,
				copiedReferences: 10000,
				failedAccounts: 0
			});
			const stats = (
				await database.pool.query(
					`SELECT (SELECT count(*)::int FROM inventory_value_holdings WHERE day_id=d.id) AS holdings,(SELECT count(*)::int FROM inventory_value_references WHERE day_id=d.id) AS references,(SELECT sum(pg_column_size(h))::text FROM inventory_value_holdings h WHERE day_id=d.id) AS holding_bytes,(SELECT sum(pg_column_size(r))::text FROM inventory_value_references r WHERE day_id=d.id) AS reference_bytes,inventory_revision::text,policy_version FROM inventory_value_days d WHERE account_id=$1 AND day='2026-10-06'`,
					[accountId]
				)
			).rows[0];
			expect(stats.holdings).toBe(50000);
			expect(stats.references).toBe(10000);
			start = performance.now();
			const current = await values.current(actor),
				currentMs = performance.now() - start;
			expect(current.estimate.totalQuantity).toBe(count.quantity);
			start = performance.now();
			const history = await values.history(actor, { from: '2025-10-06', to: '2026-10-06' }),
				historyMs = performance.now() - start;
			expect(history.points).toHaveLength(366);
			expect(history.points.at(-1)).toMatchObject({
				kind: 'Captured',
				estimate: { totalQuantity: count.quantity }
			});
			const bytes = Buffer.byteLength(JSON.stringify(history));
			expect(bytes).toBeLessThan(25000);
			const evidence = {
				observedAt: clock.toISOString(),
				captureMs,
				currentMs,
				historyMs,
				responseBytes: bytes,
				currentResponseBytes: Buffer.byteLength(JSON.stringify(current)),
				capture,
				stats
			};
			await writeFile(
				'/tmp/spellbook-value-history-scale-20261008.json',
				JSON.stringify(evidence, null, 2)
			);
			console.log(JSON.stringify(evidence));
		} finally {
			await runner.close();
			await auth.revokeSession(session.token);
			await database.pool.end();
		}
	}, 60000);
});
