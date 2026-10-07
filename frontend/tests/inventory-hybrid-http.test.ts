import { test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { fixtureAuthRequest } from './fixtures/http-auth.ts';
import { seedAccountScaleInventory } from './fixtures/account-scale.ts';
import { httpTestOrigin, startHttpApplication, stopHttpApplication } from './http-runtime.ts';
import type { InventoryPage } from '@spellbook/contracts/inventory.ts';
const database = process.env.TEST_DATABASE_URL;
assert.ok(database);
assert.equal(database, process.env.DATABASE_URL);
assert.equal(new URL(database).pathname, '/spellbook_inventory_hybrid_20261007');
const fixturePath = process.env.TEST_SCALE_CATALOG_PATH;
assert.ok(fixturePath);
const maximumSize = Number(process.env.TEST_HYBRID_MAX_SIZE ?? 50000);
assert.ok([1000, 10000, 50000].includes(maximumSize));
const origin = httpTestOrigin();
assert.equal(origin, 'http://127.0.0.1:5274');
const pool = new pg.Pool({ connectionString: database });
const source = await readFile(fixturePath);
const provenance = { path: fixturePath, sha256: createHash('sha256').update(source).digest('hex') };
const accounts: Array<{
	accountId: string;
	username: string;
	password: string;
	token: string;
	size: number;
}> = [];
const samples: Array<{
	size: number;
	pageSize: string;
	page: number;
	milliseconds: number;
	bytes: number;
	rows: number;
}> = [];
test('Inventory hybrid native routes and real HTTP over genuine 1k/10k/50k accounts', async (t) => {
	const child = await startHttpApplication(origin, new URL('../', import.meta.url));
	let complete = false;
	try {
		const state = (await pool.query('SELECT active_generation FROM catalog_state WHERE id=1'))
			.rows[0];
		const actual = (
			await pool.query('SELECT count(*)::int count FROM catalog_printings WHERE generation_id=$1', [
				state.active_generation
			])
		).rows[0].count;
		assert.equal(actual, 537762);
		for (const size of [1000, 10000, 50000] as const) {
			if (size > maximumSize) continue;
			const username = `hybrid_${size}_${randomUUID().slice(0, 8)}`,
				password = randomUUID() + 'A7!';
			const registered = await fixtureAuthRequest(
				origin,
				'/api/auth/register',
				{ username, password },
				{}
			);
			assert.equal(registered.status, 201);
			const actor = await registered.json();
			const account = {
				accountId: actor.user.accountId,
				username,
				password,
				token: actor.token,
				size
			};
			accounts.push(account);
			await seedAccountScaleInventory(pool, account.accountId, fixturePath, size);
			await pool.query('ANALYZE inventory_cards');
			const headers = { cookie: `spellbook_session=${account.token}` };
			for (const pageSize of ['100', '200', '500', 'lazy']) {
				const limit = pageSize === 'lazy' ? 200 : Number(pageSize);
				for (const page of [1, Math.ceil(size / limit)]) {
					const started = performance.now();
					const response: Response = await fetch(
						`${origin}/mtg/inventory?pageSize=${pageSize}&page=${page}`,
						{ headers }
					);
					assert.equal(response.status, 200);
					const html = await response.text(),
						rows = (html.match(/data-inventory-row=/g) ?? []).length;
					assert.equal(rows, Math.min(limit, size - (page - 1) * limit));
					assert.ok(!html.includes('name="delta"'), 'Table quantity has no mutation form.');
					assert.match(html, /Entries per page/);
					samples.push({
						size,
						pageSize,
						page,
						milliseconds: performance.now() - started,
						bytes: Buffer.byteLength(html),
						rows
					});
					const api: Response = await fetch(
						`${origin}/api/mobile/v1/mtg/inventory?limit=${limit}&offset=${(page - 1) * limit}`,
						{ headers }
					);
					assert.equal(api.status, 200);
					const data: InventoryPage = await api.json();
					assert.equal(data.entries.length, rows);
					assert.equal(data.matching.entryCount, size);
					assert.equal(new Set(data.entries.map((entry) => entry.id)).size, rows);
				}
			}
			await t.test(`normalization/clamp/native Details/Groups at ${size}`, async () => {
				const normalized = await fetch(`${origin}/mtg/inventory?page=invalid&pageSize=invalid`, {
					headers
				});
				assert.equal(normalized.status, 200);
				assert.equal(((await normalized.text()).match(/data-inventory-row=/g) ?? []).length, 200);
				const clamp = await fetch(`${origin}/mtg/inventory?page=999&pageSize=500&finish=all`, {
					headers,
					redirect: 'manual'
				});
				assert.equal(clamp.status, 307);
				assert.equal(
					new URL(clamp.headers.get('location')!, origin).searchParams.get('page'),
					String(Math.ceil(size / 500))
				);
				const groups = await fetch(`${origin}/mtg/inventory?view=groups&pageSize=500`, { headers });
				assert.equal(groups.status, 200);
				assert.match(await groups.text(), /No groups yet/);
				const wire = await fetch(`${origin}/api/mobile/v1/mtg/inventory`, { headers });
				const legacy: InventoryPage = await wire.json();
				assert.equal(legacy.entries.length, 50);
				const detail = await fetch(
					`${origin}/mtg/inventory/${legacy.entries[0].id}?pageSize=500&page=2`,
					{ headers }
				);
				assert.equal(detail.status, 200);
				const html = await detail.text();
				assert.match(html, /name="notesRevision"/);
				assert.match(html, /name="quantityBase"/);
				assert.match(html, /pageSize=500/);
			});
		}
		assert.equal((await fetch(origin + '/mtg/inventory', { redirect: 'manual' })).status, 303);
		await writeFile(
			'/tmp/spellbook-inventory-hybrid-http-evidence-20261007.json',
			JSON.stringify(
				{ provenance, maximumSize, generation: state.active_generation, actual, samples },
				null,
				2
			)
		);
		await writeFile(
			'/home/kyle/CodingProjects/spellbook/.local/test-env/inventory-hybrid-browser-20261007.json',
			JSON.stringify({ origin, provenance, accounts }, null, 2),
			{ mode: 0o600 }
		);
		complete = true;
	} finally {
		await stopHttpApplication(child);
		if (!complete)
			await pool.query('DELETE FROM user_profiles WHERE account_id=ANY($1)', [
				accounts.map((account) => account.accountId)
			]);
		await pool.end();
	}
});
