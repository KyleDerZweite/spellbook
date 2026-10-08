import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { ChildProcess } from 'node:child_process';
import { createDatabase } from '@spellbook/backend/db/client.ts';
import { createLocalAuth } from '@spellbook/backend/auth/local.ts';
import { createValuation } from '@spellbook/backend/valuation/read.ts';
import { createInventoryValues } from '@spellbook/backend/valuation/inventory-value.ts';
import { createValueHistoryRunner } from '@spellbook/backend/valuation/capture.ts';
import { httpTestOrigin, startHttpApplication, stopHttpApplication } from './http-runtime.ts';
import { fixtureAuthRequest } from './fixtures/http-auth.ts';
import { SESSION_COOKIE } from '@spellbook/backend/auth/session.ts';
import type { InventoryValueHistory } from '@spellbook/contracts/inventory-value.ts';

const url = process.env.TEST_DATABASE_URL;
if (!url || url !== process.env.DATABASE_URL)
	throw Error('Value HTTP tests require one explicitly assigned disposable database.');
const database = createDatabase(url);
const auth = createLocalAuth(database.db, { demoMode: false });
const values = createInventoryValues(database.pool, auth, createValuation(database.pool, auth));
const origin = httpTestOrigin();

test('private Inventory values through the built application and PostgreSQL', async (t) => {
	let child: ChildProcess | undefined;
	const accounts: string[] = [],
		publication = randomUUID(),
		printing = randomUUID(),
		oracle = randomUUID(),
		inventory = randomUUID(),
		entry = randomUUID(),
		deck = randomUUID();
	const previous = (await database.pool.query('SELECT * FROM price_state WHERE id=1')).rows[0];
	let runner: ReturnType<typeof createValueHistoryRunner> | undefined;
	try {
		child = await startHttpApplication(origin, new URL('../', import.meta.url));
		async function register() {
			const response = await fixtureAuthRequest(
				origin,
				'/api/auth/register',
				{
					username: 'value_http_' + randomUUID().slice(0, 8),
					password: 'value-http-test-password'
				},
				{}
			);
			assert.equal(response.status, 201);
			const result = await response.json();
			accounts.push(result.user.accountId);
			return result;
		}
		const owner = await register(),
			other = await register();
		const read = (path: string, token = owner.token, cookie = false) =>
			fetch(origin + path, {
				headers: cookie
					? { cookie: `${SESSION_COOKIE}=${token}` }
					: { authorization: `Bearer ${token}` },
				redirect: 'manual'
			});
		await database.pool.query(
			`INSERT INTO price_publications(id,catalog_generation_id,descriptor,source_type,source_updated_at,payload_digest,extractor_version,mapping_version) VALUES($1,$2,'{"source":"Scryfall"}','all_cards',now()-interval '3 days','value-http',1,1)`,
			[publication, randomUUID()]
		);
		await database.pool.query(
			`INSERT INTO price_printings(publication_id,id,oracle_id,set_id,set_code,collector_number,lang,finishes,variant_key,identity,links) VALUES($1,$2,$3,$4,'tst','1','en',ARRAY['nonfoil'],'matched','{"lang":"en"}','[]')`,
			[publication, printing, oracle, randomUUID()]
		);
		await database.pool.query(
			`INSERT INTO price_observations(publication_id,printing_id,finish,measure,amount,supported) VALUES($1,$2,'nonfoil','prices.eur',1.005,true)`,
			[publication, printing]
		);
		await database.pool.query(
			`UPDATE price_state SET active_publication=$1,previous_publication=NULL,refresh_status='{"kind":"Succeeded"}' WHERE id=1`,
			[publication]
		);
		await database.pool.query(`INSERT INTO inventories(id,account_id,game) VALUES($1,$2,'mtg')`, [
			inventory,
			owner.user.accountId
		]);
		for (const [id, finish, quantity] of [
			[entry, 'nonfoil', 3],
			[randomUUID(), 'foil', 2]
		] as const)
			await database.pool.query(
				`INSERT INTO inventory_cards(id,inventory_id,account_id,game,catalog_card_id,canonical_card_id,name,set_code,image_uri,quantity,finish,condition,notes,spellbook_position) VALUES($1,$2,$3,'mtg',$4,$5,'Value HTTP','tst','',$6,$7,'NM','',0)`,
				[id, inventory, owner.user.accountId, printing, oracle, quantity, finish]
			);
		await database.pool.query(
			`INSERT INTO decks(id,account_id,game,name) VALUES($1,$2,'mtg','Value HTTP')`,
			[deck, owner.user.accountId]
		);
		await database.pool.query(
			`INSERT INTO deck_cards(id,deck_id,account_id,game,catalog_card_id,canonical_card_id,name,set_code,image_uri,quantity,role) VALUES($1,$2,$3,'mtg',$4,$5,'Value HTTP','tst','',6,'main')`,
			[randomUUID(), deck, owner.user.accountId, printing, oracle]
		);
		const closed = (
			await database.pool.query(
				`SELECT (statement_timestamp() AT TIME ZONE 'Europe/Berlin')::date-1 AS day`
			)
		).rows[0].day;
		const clock = (
			await database.pool.query(
				`SELECT ($1::date+1)::timestamp AT TIME ZONE 'Europe/Berlin' - interval '30 seconds' AS observed`,
				[closed]
			)
		).rows[0].observed;
		runner = createValueHistoryRunner(database.pool, values, {
			observationClock: () => clock,
			accountIds: [owner.user.accountId, other.user.accountId]
		});
		assert.equal((await runner.runOnce()).failedAccounts, 0);
		await runner.close();
		await t.test(
			'session and bearer authentication, account isolation and safe summaries',
			async () => {
				assert.equal((await fetch(origin + '/api/mobile/v1/mtg/inventory/value')).status, 401);
				assert.equal((await read('/api/mobile/v1/mtg/inventory/value', 'invalid')).status, 401);
				for (const cookie of [false, true]) {
					const response = await read('/api/mobile/v1/mtg/inventory/value', owner.token, cookie);
					assert.equal(response.status, 200);
					assert.match(response.headers.get('cache-control')!, /no-store/);
					const current = await response.json();
					assert.equal(current.estimate.coveredValue, '3.02');
					assert.equal(current.estimate.coveredQuantity, 3);
					assert.equal(current.estimate.unknownQuantity, 2);
					assert.equal(current.estimate.complete, false);
					assert.equal(current.accountId, undefined);
				}
				const separate = await (
					await read('/api/mobile/v1/mtg/inventory/value', other.token)
				).json();
				assert.equal(separate.estimate.totalQuantity, 0);
				const snapshot = await (await read(`/api/mobile/v1/mtg/decks?deck=${deck}`)).json();
				assert.equal(snapshot.valueEstimates.required.coveredValue, '6.03');
				assert.equal(snapshot.valueEstimates.missing.coveredValue, '1.01');
				assert.equal(
					(await read(`/api/mobile/v1/mtg/decks?deck=${deck}`, other.token)).status,
					404
				);
			}
		);
		await t.test(
			'closed observations, real gaps and absent historical identity known zero',
			async () => {
				const response = await read('/api/mobile/v1/mtg/inventory/value-history');
				assert.equal(response.status, 200);
				assert.match(response.headers.get('cache-control')!, /no-store/);
				const history: InventoryValueHistory = await response.json();
				assert.equal(history.window.days, 30);
				assert.ok(Date.parse(history.nextDayBoundary) > Date.parse(history.asOf));
				assert.ok(Date.parse(history.nextRefreshAt) <= Date.parse(history.nextDayBoundary));
				assert.equal(JSON.stringify(history).includes(owner.user.accountId), false);
				assert.equal(JSON.stringify(history).includes('publicationId'), false);
				assert.equal(history.points.filter((point) => point.kind === 'Captured').length, 1);
				assert.equal(history.points.filter((point) => point.kind === 'Gap').length, 29);
				const point = history.points.at(-1)!;
				assert.equal(point.kind, 'Captured');
				if (point.kind === 'Captured') {
					assert.equal(point.observedAt, clock.toISOString());
					assert.equal(point.estimate.coveredValue, '3.02');
					assert.equal(point.timezone, 'Europe/Berlin');
				}
				const filtered: InventoryValueHistory = await (
					await read(
						`/api/mobile/v1/mtg/inventory/value-history?printingId=${randomUUID()}&finish=foil&condition=NM`
					)
				).json();
				const zero = filtered.points.at(-1)!;
				assert.equal(zero.kind, 'Captured');
				if (zero.kind === 'Captured') {
					assert.equal(zero.estimate.totalQuantity, 0);
					assert.equal(zero.estimate.coveredValue, '0.00');
					assert.equal(zero.estimate.complete, true);
				}
				assert.equal(filtered.points[0].kind, 'Gap');
				assert.equal((await read('/mtg/history', owner.token, true)).status, 200);
				assert.equal((await fetch(origin + '/mtg/history', { redirect: 'manual' })).status, 302);
			}
		);
		await t.test(
			'rejects malformed, duplicate, oversized and account-supplied queries',
			async () => {
				for (const query of [
					'days=367',
					'days=0',
					'days=3.1',
					'days=30&days=90',
					'from=2026-02-30&to=2026-03-01',
					'from=2026-01-01',
					'from=2020-01-01&to=2021-01-01',
					'from=2099-01-01&to=2099-01-02',
					'from=2026-01-01&to=2026-01-02&days=30',
					'printingId=bad',
					'finish=foil',
					'printingId=' + printing + '&finish=etched',
					'printingId=' + printing + '&condition=bad',
					'accountId=' + other.user.accountId
				])
					assert.equal(
						(await read('/api/mobile/v1/mtg/inventory/value-history?' + query)).status,
						400,
						query
					);
				assert.equal(
					(await read('/api/mobile/v1/mtg/inventory/value?accountId=' + other.user.accountId))
						.status,
					400
				);
				assert.equal(
					(await read('/api/mobile/v1/mtg/inventory/value-history?days=366')).status,
					200
				);
				assert.equal(
					(
						await fetch(origin + '/api/mobile/v1/mtg/inventory/value-history', {
							method: 'POST',
							headers: { authorization: `Bearer ${owner.token}`, origin }
						})
					).status,
					405
				);
			}
		);
		await t.test(
			'current valuation failure leaves saved history and Dashboard data readable',
			async () => {
				await database.pool.query(
					"UPDATE price_observations SET amount=repeat('9',129)::numeric WHERE publication_id=$1",
					[publication]
				);
				assert.equal((await read('/api/mobile/v1/mtg/inventory/value')).status, 503);
				const dashboard = await (await read('/api/account/dashboard')).json();
				assert.equal(dashboard.totals.total, 5);
				assert.equal(dashboard.inventoryValue, null);
				assert.equal(dashboard.valuationError.kind, 'PriceReadUnavailable');
				assert.equal((await read('/api/mobile/v1/mtg/inventory/value-history')).status, 200);
				await database.pool.query(
					'UPDATE price_observations SET amount=1.005 WHERE publication_id=$1',
					[publication]
				);
				assert.equal((await read('/api/mobile/v1/mtg/inventory/value')).status, 200);
			}
		);
	} finally {
		await runner?.close();
		if (child) await stopHttpApplication(child);
		await database.pool.query(
			'UPDATE price_state SET active_publication=$1,previous_publication=$2,refresh_status=$3 WHERE id=1',
			[previous.active_publication, previous.previous_publication, previous.refresh_status]
		);
		await database.pool.query('DELETE FROM user_profiles WHERE account_id = ANY($1::text[])', [
			accounts
		]);
		await database.pool.query('DELETE FROM price_publications WHERE id=$1', [publication]);
		await database.pool.end();
	}
});
