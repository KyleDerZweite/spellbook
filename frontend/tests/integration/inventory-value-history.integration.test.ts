import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
	createDatabase,
	createLocalAuth,
	createValuation,
	createInventoryValues,
	createValueHistoryRunner
} from '@spellbook/backend';
import type { AuthUser } from '@spellbook/contracts/auth.ts';
import pg, { type PoolClient } from 'pg';
const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;
run('private coherent value checkpoints on PostgreSQL', () => {
	let database: ReturnType<typeof createDatabase>,
		auth: ReturnType<typeof createLocalAuth>,
		actor: AuthUser,
		other: AuthUser,
		values: ReturnType<typeof createInventoryValues>,
		previous: Record<string, unknown>,
		optional: Record<string, unknown>[];
	const publication = randomUUID(),
		printing = randomUUID(),
		second = randomUUID(),
		inventory = randomUUID(),
		entry = randomUUID();
	let observation = new Date('2026-10-07T21:59:30Z');
	let barriers: {
		afterBatch?: (batch: number, client: PoolClient) => Promise<void>;
		beforeCommit?: (client: PoolClient) => Promise<void>;
	} = {};
	function runner(timezone = 'Europe/Berlin', accountIds = [actor.accountId]) {
		return createValueHistoryRunner(
			database.pool,
			timezone === values.timezone
				? values
				: createInventoryValues(database.pool, auth, createValuation(database.pool, auth), {
						timezone
					}),
			{
				accountIds,
				observationClock: () => observation,
				afterBatch: (batch, client) => barriers.afterBatch?.(batch, client) ?? Promise.resolve(),
				beforeCommit: (client) => barriers.beforeCommit?.(client) ?? Promise.resolve()
			}
		);
	}
	async function history(
		input: unknown = { from: '2026-10-07', to: '2026-10-07' },
		accountId = actor.accountId,
		asOf = new Date('2026-10-08T12:00:00Z')
	) {
		return values.historyInTransaction(database.pool, accountId, input, asOf);
	}
	beforeAll(async () => {
		database = createDatabase(process.env.TEST_DATABASE_URL!);
		auth = createLocalAuth(database.db, { demoMode: false });
		const first = await auth.authenticate(
				'register',
				'value_' + randomUUID().slice(0, 8),
				'reference-test-password'
			),
			otherLogin = await auth.authenticate(
				'register',
				'value_' + randomUUID().slice(0, 8),
				'reference-test-password'
			);
		if (!first || !otherLogin) throw Error('Auth fixture');
		actor = first.user;
		other = otherLogin.user;
		values = createInventoryValues(database.pool, auth, createValuation(database.pool, auth));
		previous = (await database.pool.query('SELECT * FROM price_state WHERE id=1')).rows[0];
		optional = (await database.pool.query('SELECT * FROM optional_price_state')).rows;
		await database.pool.query('UPDATE optional_price_state SET enabled=false');
		await database.pool.query(
			`INSERT INTO price_publications(id,catalog_generation_id,descriptor,source_type,source_updated_at,payload_digest,extractor_version,mapping_version) VALUES($1,$2,'{"source":"Scryfall"}','all_cards','2026-10-07T00:00:00Z','value-fixture',1,1)`,
			[publication, randomUUID()]
		);
		for (const id of [printing, second]) {
			await database.pool.query(
				`INSERT INTO price_printings(publication_id,id,oracle_id,set_id,set_code,collector_number,lang,finishes,variant_key,identity,links) VALUES($1,$2,$3,$4,'cmm','703','en',ARRAY['nonfoil'],'exact','{"lang":"en"}','[]')`,
				[publication, id, randomUUID(), randomUUID()]
			);
			await database.pool.query(
				`INSERT INTO price_observations(publication_id,printing_id,finish,measure,amount,supported) VALUES($1,$2,'nonfoil','prices.eur',0.005,true)`,
				[publication, id]
			);
		}
		await database.pool.query(
			'UPDATE price_state SET active_publication=$1,previous_publication=NULL WHERE id=1',
			[publication]
		);
		await database.pool.query(`INSERT INTO inventories(id,account_id,game) VALUES($1,$2,'mtg')`, [
			inventory,
			actor.accountId
		]);
		await database.pool.query(
			`INSERT INTO inventory_cards(id,inventory_id,account_id,game,catalog_card_id,canonical_card_id,name,set_code,image_uri,quantity,finish,condition,spellbook_position) VALUES($1,$2,$3,'mtg',$4,$5,'Fixture','cmm','',3,'nonfoil','NM',0),($6,$2,$3,'mtg',$7,$8,'Fixture2','cmm','',1,'nonfoil','LP',1)`,
			[
				entry,
				inventory,
				actor.accountId,
				printing,
				randomUUID(),
				randomUUID(),
				second,
				randomUUID()
			]
		);
	});
	beforeEach(async () => {
		barriers = {};
		observation = new Date('2026-10-07T21:59:30Z');
		await database.pool.query('DELETE FROM inventory_value_days WHERE account_id=ANY($1::text[])', [
			[actor.accountId, other.accountId]
		]);
	});
	afterAll(async () => {
		await database.pool.query(
			'UPDATE price_state SET active_publication=$1,previous_publication=$2,refresh_status=$3 WHERE id=1',
			[previous.active_publication, previous.previous_publication, previous.refresh_status]
		);
		for (const row of optional)
			await database.pool.query('UPDATE optional_price_state SET enabled=$2 WHERE source=$1', [
				row.source,
				row.enabled
			]);
		await database.pool.query('DELETE FROM price_publications WHERE id=$1', [publication]);
		await database.pool.query('DELETE FROM user_profiles WHERE account_id=ANY($1::text[])', [
			[actor.accountId, other.accountId]
		]);
		await database.pool.end();
	});

	it('uses the real database statement clock and never fabricates a startup checkpoint', async () => {
		const now = (await database.pool.query('SELECT statement_timestamp() AS now')).rows[0]
			.now as Date;
		const timezone = now.getUTCHours() === 23 ? 'Europe/Berlin' : 'UTC';
		const real = createInventoryValues(database.pool, auth, createValuation(database.pool, auth), {
			timezone
		});
		const r = createValueHistoryRunner(database.pool, real, { accountIds: [actor.accountId] });
		expect((await r.runOnce()).capturedAccounts).toBe(0);
		await r.close();
		expect((await history()).points[0].kind).toBe('Gap');
	});

	it('bounds shutdown while account enumeration is blocked outside a capture transaction', async () => {
		const blocker = await database.pool.connect();
		await blocker.query('BEGIN');
		await blocker.query('LOCK TABLE user_profiles IN ACCESS EXCLUSIVE MODE');
		const r = runner();
		const pending = r.runOnce();
		const handled = pending.catch(() => {});
		try {
			let blocked = false;
			for (let attempt = 0; attempt < 100; attempt++) {
				blocked =
					(
						await database.pool.query(
							"SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT account_id FROM user_profiles WHERE account_id > %'"
						)
					).rows[0].count > 0;
				if (blocked) break;
				await new Promise((resolve) => setTimeout(resolve, 10));
			}
			expect(blocked).toBe(true);
			const start = performance.now();
			await r.close();
			expect(performance.now() - start).toBeLessThan(12000);
			await handled;
			await expect(pending).rejects.toThrow();
			const leaseClient = await database.pool.connect();
			try {
				const lease = (
					await leaseClient.query('SELECT pg_try_advisory_lock(78173020462008::bigint) AS acquired')
				).rows[0].acquired;
				expect(lease).toBe(true);
				await leaseClient.query('SELECT pg_advisory_unlock(78173020462008::bigint)');
			} finally {
				leaseClient.release();
			}
		} finally {
			await blocker.query('ROLLBACK');
			blocker.release();
			await r.close();
		}
	});
	it('cancels pending pool admission and releases the later admitted connection without a lease', async () => {
		const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
		const occupied = await pool.connect();
		const r = createValueHistoryRunner(
			pool,
			createInventoryValues(pool, auth, createValuation(pool, auth)),
			{ accountIds: [actor.accountId], observationClock: () => observation }
		);
		const pending = r.runOnce(),
			handled = pending.catch(() => {});
		await r.close();
		await handled;
		await expect(pending).rejects.toThrow();
		occupied.release();
		expect((await pool.query('SELECT 1 AS value')).rows[0].value).toBe(1);
		expect(pool.waitingCount).toBe(0);
		await pool.end();
	});

	it('retains one physical pool admission across repeated timed-out attempts', async () => {
		const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
		const occupied = await pool.connect();
		const r = createValueHistoryRunner(
			pool,
			createInventoryValues(pool, auth, createValuation(pool, auth)),
			{ accountIds: [actor.accountId], admissionTimeoutMs: 25, observationClock: () => observation }
		);
		try {
			await expect(r.runOnce()).rejects.toThrow('connection unavailable');
			expect(pool.waitingCount).toBe(1);
			for (let attempt = 0; attempt < 4; attempt++) {
				await expect(r.runOnce()).rejects.toThrow('admission pending');
				expect(pool.waitingCount).toBe(1);
			}
			await r.close();
			occupied.release();
			expect((await pool.query('SELECT 1 AS value')).rows[0].value).toBe(1);
			expect(pool.waitingCount).toBe(0);
			expect(
				(
					await database.pool.query(
						'SELECT count(*)::int AS count FROM inventory_value_days WHERE account_id=$1',
						[actor.accountId]
					)
				).rows[0].count
			).toBe(0);
		} finally {
			await r.close();
			await pool.end();
		}
	});
	it('captures trusted exact products, filters absent holdings as zero, and isolates accounts', async () => {
		const r = runner();
		expect(await r.runOnce()).toEqual({
			capturedAccounts: 1,
			capturedHoldings: 2,
			copiedReferences: 2,
			failedAccounts: 0
		});
		await r.close();
		const result = await history();
		expect(result.points[0]).toMatchObject({
			kind: 'Captured',
			estimate: { coveredValue: '0.02', totalQuantity: 4, complete: true }
		});
		expect(
			(
				await history({
					from: '2026-10-07',
					to: '2026-10-07',
					printingId: randomUUID(),
					finish: 'foil',
					condition: 'DMG'
				})
			).points[0]
		).toMatchObject({
			kind: 'Captured',
			estimate: { totalQuantity: 0, coveredValue: '0.00', complete: true }
		});
		expect(
			(await history({ from: '2026-10-07', to: '2026-10-07' }, other.accountId)).points[0]
		).toEqual({
			kind: 'Gap',
			day: '2026-10-07'
		});
		expect(JSON.stringify(result)).not.toContain('rawValue');
		expect(JSON.stringify(result)).not.toContain('publication');
	});
	it('replaces only newer eligible observations and preserves calendar collisions', async () => {
		let r = runner();
		await r.runOnce();
		await r.close();
		observation = new Date('2026-10-07T21:59:50Z');
		r = runner();
		await r.runOnce();
		await r.close();
		expect((await history()).points[0]).toMatchObject({ observedAt: observation.toISOString() });
		observation = new Date('2026-10-07T23:59:55Z');
		r = runner('UTC');
		expect((await r.runOnce()).capturedAccounts).toBe(0);
		await r.close();
		expect((await history()).points[0]).toMatchObject({
			timezone: 'Europe/Berlin',
			observedAt: '2026-10-07T21:59:50.000Z'
		});
	});

	it('keeps a stored calendar day closed after a forward timezone change', async () => {
		const r = runner();
		await r.runOnce();
		await r.close();
		const moved = createInventoryValues(database.pool, auth, createValuation(database.pool, auth), {
			timezone: 'Pacific/Kiritimati'
		});
		const before = await moved.historyInTransaction(
			database.pool,
			actor.accountId,
			{ days: 1 },
			new Date('2026-10-07T21:59:55Z')
		);
		expect(before.window.to).toBe('2026-10-07');
		expect(before.nextRefreshAt).toBe('2026-10-07T22:00:00.000Z');
		expect(before.nextDayBoundary).toBe('2026-10-08T10:00:00.000Z');
		const isolated = await moved.historyInTransaction(
			database.pool,
			other.accountId,
			{ days: 1 },
			new Date('2026-10-07T21:59:55Z')
		);
		expect(isolated.nextRefreshAt).toBe(isolated.nextDayBoundary);
		const outsideWindow = await moved.historyInTransaction(
			database.pool,
			actor.accountId,
			{ from: '2026-10-06', to: '2026-10-06' },
			new Date('2026-10-07T21:59:55Z')
		);
		expect(outsideWindow.nextRefreshAt).toBe(outsideWindow.nextDayBoundary);
		expect(before.points[0]).toEqual({ kind: 'Gap', day: '2026-10-07' });
		const closed = await moved.historyInTransaction(
			database.pool,
			actor.accountId,
			{ days: 1 },
			new Date('2026-10-07T22:00:00Z')
		);
		expect(closed.points[0]).toMatchObject({ kind: 'Captured', timezone: 'Europe/Berlin' });
		expect(closed.nextRefreshAt).toBe(closed.nextDayBoundary);
	});
	it('leaves missed windows and downtime as gaps without backfill', async () => {
		for (const instant of [
			'2026-10-07T21:58:59Z',
			'2026-10-07T22:00:00Z',
			'2026-10-08T08:00:00Z'
		]) {
			observation = new Date(instant);
			const r = runner();
			expect((await r.runOnce()).capturedAccounts).toBe(0);
			await r.close();
		}
		expect(
			(await history({ from: '2026-10-05', to: '2026-10-07' })).points.every(
				(p) => p.kind === 'Gap'
			)
		).toBe(true);
	});
	it('commits an eligible observed snapshot after the reporting boundary', async () => {
		barriers.beforeCommit = async () => {
			observation = new Date('2026-10-07T22:00:10Z');
		};
		const r = runner();
		await r.runOnce();
		await r.close();
		expect((await history()).points[0]).toMatchObject({ observedAt: '2026-10-07T21:59:30.000Z' });
	});

	it('returns the next configured calendar boundary using PostgreSQL DST conversion', async () => {
		for (const [asOf, nextBoundary, hours] of [
			['2026-03-28T23:00:00Z', '2026-03-29T22:00:00.000Z', 23],
			['2026-10-24T22:00:00Z', '2026-10-25T23:00:00.000Z', 25]
		] as const) {
			const response = await values.historyInTransaction(
				database.pool,
				actor.accountId,
				{ days: 1 },
				new Date(asOf)
			);
			expect(response.asOf).toBe(new Date(asOf).toISOString());
			expect(response.nextDayBoundary).toBe(nextBoundary);
			expect(response.nextRefreshAt).toBe(nextBoundary);
			expect((Date.parse(response.nextDayBoundary) - Date.parse(response.asOf)) / 3600000).toBe(
				hours
			);
		}
		const moved = createInventoryValues(database.pool, auth, createValuation(database.pool, auth), {
			timezone: 'Pacific/Kiritimati'
		});
		const response = await moved.historyInTransaction(
			database.pool,
			actor.accountId,
			{ days: 1 },
			new Date('2026-10-07T21:59:55Z')
		);
		expect(response.nextDayBoundary).toBe('2026-10-08T10:00:00.000Z');
		expect(response.asOf).toBe('2026-10-07T21:59:55.000Z');
	});
	it('records actual 23 and 25 hour reporting boundaries', async () => {
		for (const [instant, day, hours] of [
			['2026-03-29T21:59:30Z', '2026-03-29', 23],
			['2026-10-25T22:59:30Z', '2026-10-25', 25]
		] as const) {
			observation = new Date(instant);
			const r = runner();
			await r.runOnce();
			await r.close();
			const p = (
				await history({ from: day, to: day }, actor.accountId, new Date('2026-10-26T12:00:00Z'))
			).points[0];
			if (p.kind !== 'Captured') throw Error('missing day');
			expect((Date.parse(p.dayEnd) - Date.parse(p.dayStart)) / 3600000).toBe(hours);
		}
	});
	it('excludes concurrent runner and rolls cancellation back before releasing lease', async () => {
		let started!: () => void, release!: () => void;
		const entered = new Promise<void>((resolve) => {
				started = resolve;
			}),
			pause = new Promise<void>((resolve) => {
				release = resolve;
			});
		barriers.afterBatch = async () => {
			started();
			await pause;
		};
		const first = runner(),
			pending = first.runOnce();
		await entered;
		const duplicate = runner();
		expect((await duplicate.runOnce()).capturedAccounts).toBe(0);
		await duplicate.close();
		const closing = first.close();
		release();
		await closing;
		await expect(pending).rejects.toThrow();
		expect((await history()).points[0].kind).toBe('Gap');
		barriers = {};
		const recovered = runner();
		expect((await recovered.runOnce()).capturedAccounts).toBe(1);
		await recovered.close();
	});
	it('validates bounded closed windows and actor-only application access', async () => {
		for (const input of [
			{ days: 367 },
			{ from: '0000-01-01', to: '0000-01-02' },
			{ from: '2026-99-99', to: '2026-10-07' },
			{ from: '2026-10-07', to: '2026-10-06' },
			{ accountId: other.accountId },
			{ finish: 'foil' },
			{ printingId: printing, condition: ['NM'] }
		])
			await expect(history(input)).rejects.toMatchObject({ kind: 'ValidationFailed' });
		expect((await values.current(actor)).estimate.totalQuantity).toBe(4);
		expect((await values.history(other, { days: 2 })).points.every((p) => p.kind === 'Gap')).toBe(
			true
		);
	});
	it('retains a prior checkpoint on failed replacement and continues empty accounts', async () => {
		let r = runner();
		await r.runOnce();
		await r.close();
		observation = new Date('2026-10-07T21:59:50Z');
		const failedValues = createInventoryValues(database.pool, auth, {
			readInTransaction: values.valuation.readInTransaction,
			freezeInTransaction: async () => {
				throw Error('controlled source failure');
			}
		});
		r = createValueHistoryRunner(database.pool, failedValues, {
			observationClock: () => observation,
			accountIds: [actor.accountId, other.accountId]
		});
		const result = await r.runOnce();
		await r.close();
		expect(result.failedAccounts).toBe(1);
		expect(result.capturedAccounts).toBe(1);
		expect((await history()).points[0]).toMatchObject({ observedAt: '2026-10-07T21:59:30.000Z' });
		expect(
			(await history({ from: '2026-10-07', to: '2026-10-07' }, other.accountId)).points[0]
		).toMatchObject({
			kind: 'Captured',
			estimate: { totalQuantity: 0, coveredValue: '0.00', complete: true }
		});
	});
	it('connection loss releases the lease and prevents the former runner publishing', async () => {
		let started!: () => void,
			release!: () => void,
			pid = 0;
		const entered = new Promise<void>((resolve) => {
				started = resolve;
			}),
			pause = new Promise<void>((resolve) => {
				release = resolve;
			});
		barriers.afterBatch = async (_batch, client) => {
			pid = (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
			started();
			await pause;
		};
		const first = runner(),
			pending = first.runOnce();
		const rejected = pending.catch(() => {});
		await entered;
		await database.pool.query('SELECT pg_terminate_backend($1)', [pid]);
		await new Promise((resolve) => setTimeout(resolve, 25));
		barriers = {};
		const secondRunner = runner();
		expect((await secondRunner.runOnce()).capturedAccounts).toBe(1);
		await secondRunner.close();
		release();
		await rejected;
		await expect(pending).rejects.toThrow();
		await first.close();
		expect((await history()).points[0]).toMatchObject({
			kind: 'Captured',
			observedAt: '2026-10-07T21:59:30.000Z'
		});
	});
	it('keeps copied holdings after current-entry removal and recreation', async () => {
		const r = runner();
		await r.runOnce();
		await r.close();
		const stored = (await database.pool.query('SELECT * FROM inventory_cards WHERE id=$1', [entry]))
			.rows[0];
		await database.pool.query('DELETE FROM inventory_cards WHERE id=$1', [entry]);
		expect(
			(
				await history({
					from: '2026-10-07',
					to: '2026-10-07',
					printingId: printing,
					finish: 'nonfoil',
					condition: 'NM'
				})
			).points[0]
		).toMatchObject({ estimate: { totalQuantity: 3, coveredValue: '0.02' } });
		await database.pool.query(
			`INSERT INTO inventory_cards(id,inventory_id,account_id,game,catalog_card_id,canonical_card_id,name,set_code,image_uri,quantity,finish,condition,spellbook_position) VALUES($1,$2,$3,'mtg',$4,$5,$6,$7,$8,99,'nonfoil','NM',0)`,
			[
				randomUUID(),
				inventory,
				actor.accountId,
				printing,
				stored.canonical_card_id,
				stored.name,
				stored.set_code,
				stored.image_uri
			]
		);
		expect((await history()).points[0]).toMatchObject({
			estimate: { totalQuantity: 4, coveredValue: '0.02' }
		});
		await database.pool.query(
			'UPDATE inventory_cards SET quantity=3 WHERE inventory_id=$1 AND catalog_card_id=$2',
			[inventory, printing]
		);
	});
	it('keeps one snapshot across bounded batches while prices and inventory mutate and public evidence is pruned', async () => {
		const extras = Array.from({ length: 100 }, (_, i) => ({
			id: randomUUID(),
			printing: randomUUID(),
			position: i + 2
		}));
		for (const row of extras)
			await database.pool.query(
				`INSERT INTO inventory_cards(id,inventory_id,account_id,game,catalog_card_id,canonical_card_id,name,set_code,image_uri,quantity,finish,condition,spellbook_position) VALUES($1,$2,$3,'mtg',$4,$5,'Unknown','cmm','',1,'nonfoil','NM',$6)`,
				[row.id, inventory, actor.accountId, row.printing, randomUUID(), row.position]
			);
		let batches = 0;
		barriers.afterBatch = async (batch) => {
			batches++;
			if (batch === 0) {
				await database.pool.query(
					'UPDATE inventory_cards SET quantity=99 WHERE inventory_id=$1 AND catalog_card_id=$2',
					[inventory, printing]
				);
				await database.pool.query('UPDATE inventories SET revision=revision+1 WHERE id=$1', [
					inventory
				]);
				await database.pool.query('UPDATE price_state SET active_publication=NULL WHERE id=1');
				await database.pool.query('DELETE FROM price_publications WHERE id=$1', [publication]);
			}
		};
		const r = runner();
		const result = await r.runOnce();
		await r.close();
		expect(batches).toBe(2);
		expect(result.capturedHoldings).toBe(102);
		expect((await history()).points[0]).toMatchObject({
			estimate: {
				coveredValue: '0.02',
				coveredQuantity: 4,
				unknownQuantity: 100,
				totalQuantity: 104
			}
		});
		const copies = (
			await database.pool.query(
				'SELECT count(*)::int AS count FROM inventory_value_references r JOIN inventory_value_days d ON d.id=r.day_id WHERE d.account_id=$1',
				[actor.accountId]
			)
		).rows[0];
		expect(copies.count).toBe(102);
		expect(
			(await history({ from: '2026-10-07', to: '2026-10-07', printingId: printing })).points[0]
		).toMatchObject({ estimate: { coveredValue: '0.02', totalQuantity: 3 } });
	});
	it('cascades only account-owned history when an account is deleted', async () => {
		const r = runner('Europe/Berlin', [other.accountId]);
		await r.runOnce();
		await r.close();
		expect(
			(
				await database.pool.query(
					'SELECT count(*)::int AS count FROM inventory_value_days WHERE account_id=$1',
					[other.accountId]
				)
			).rows[0].count
		).toBe(1);
		await database.pool.query('DELETE FROM user_profiles WHERE account_id=$1', [other.accountId]);
		expect(
			(
				await database.pool.query(
					'SELECT count(*)::int AS count FROM inventory_value_days WHERE account_id=$1',
					[other.accountId]
				)
			).rows[0].count
		).toBe(0);
	});
});
