import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '@spellbook/backend/db/schema.ts';
import { createScan } from '@spellbook/backend/scan/application.ts';
import { scanFixture } from '../fixtures/scan.ts';
import type { CardDocument } from '@spellbook/contracts/catalog.ts';
const run =
	process.env.TEST_DATABASE_URL && process.env.TEST_SCALE_CATALOG_PATH ? describe : describe.skip;
run('real-printing compact Scan commit scale', () => {
	let f: Awaited<ReturnType<typeof scanFixture>>;
	beforeAll(async () => {
		f = await scanFixture();
	});
	afterAll(async () => {
		await f.close();
	});
	it('1k/10k/50k commits touch only selected variants and preserve all unrelated rows', async () => {
		const records: Array<{ document: CardDocument; supportedInventoryFinishes: string[] }> = (
			await readFile(process.env.TEST_SCALE_CATALOG_PATH!, 'utf8')
		)
			.trim()
			.split('\n')
			.map((line) => JSON.parse(line));
		expect(records).toHaveLength(10000);
		const evidence = [];
		for (const size of [1000, 10000, 50000]) {
			const a = await f.account(),
				inventoryId = crypto.randomUUID();
			await f.pool.query("INSERT INTO inventories(id,account_id,game) VALUES($1,$2,'mtg')", [
				inventoryId,
				a.user.accountId
			]);
			const entries = records
				.slice(0, size / 5)
				.flatMap(({ document: d, supportedInventoryFinishes }) =>
					['NM', 'LP', 'MP', 'HP', 'DMG'].map((condition) => ({
						id: crypto.randomUUID(),
						printing: d.id,
						canonical: d.oracle_id,
						name: d.name,
						set: d.set_code,
						image: d.image_uri,
						finish: supportedInventoryFinishes[0],
						condition
					}))
				);
			for (let offset = 0; offset < entries.length; offset += 1000)
				await f.pool.query(
					`INSERT INTO inventory_cards(id,inventory_id,account_id,game,catalog_card_id,canonical_card_id,name,set_code,image_uri,quantity,finish,condition,spellbook_position) SELECT r.id,$1,$2,'mtg',r.printing,r.canonical,r.name,r.set,r.image,1,r.finish,r.condition,r.position FROM jsonb_to_recordset($3::jsonb)AS r(id uuid,printing text,canonical text,name text,set text,image text,finish text,condition text,position integer)`,
					[
						inventoryId,
						a.user.accountId,
						JSON.stringify(
							entries
								.slice(offset, offset + 1000)
								.map((r, index) => ({ ...r, position: offset + index }))
						)
					]
				);
			// Direct bulk fixture insertion needs current planner statistics before measured operations.
			await f.pool.query('ANALYZE inventory_cards');
			const digest = async () =>
				(
					await f.pool.query(
						`SELECT md5(string_agg(id::text||':'||quantity||':'||spellbook_position||':'||updated_at::text,',' ORDER BY id)) AS digest FROM inventory_cards WHERE account_id=$1 AND catalog_card_id<>$2`,
						[a.user.accountId, f.card.catalogCardId]
					)
				).rows[0].digest;
			const before = await digest(),
				artifact = await f.artifact(a.user),
				input = f.intent(artifact);
			const statements: Array<{ query: string; params: unknown[] }> = [];
			const db = drizzle(f.pool, {
					schema,
					logger: {
						logQuery(query, params) {
							statements.push({ query, params });
						}
					}
				}),
				scan = createScan(db, f.pool, f.catalog, f.auth, {
					storageDriver: 'local',
					localStorageDir: f.storageDir,
					workerUrl: process.env.SCAN_WORKER_URL
				});
			try {
				const start = performance.now(),
					receipt = await scan.commitReview(a.user, input),
					elapsedMs = performance.now() - start,
					bytes = Buffer.byteLength(JSON.stringify(receipt));
				expect(receipt.kind).toBe('Committed');
				expect(bytes).toBeLessThan(2000);
				expect(await digest()).toBe(before);
				expect(
					statements.some((s) => /spellbook_position/.test(s.query) && /^update/i.test(s.query))
				).toBe(false);
				const queries = statements.filter(
					(s) => s.query.startsWith('select') && s.query.includes('inventory_cards')
				);
				expect(queries.length).toBeGreaterThan(0);
				const plans = [];
				for (const { query, params } of queries)
					plans.push(
						(await f.pool.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ' + query, params)).rows[0][
							'QUERY PLAN'
						]
					);
				const checkPlan = (value: unknown): void => {
					if (Array.isArray(value)) {
						for (const child of value) checkPlan(child);
					} else if (value && typeof value === 'object') {
						const node = value as Record<string, unknown>;
						if ('Node Type' in node) {
							expect(Number(node['Rows Removed by Filter'] ?? 0)).toBeLessThanOrEqual(2);
							expect(Number(node['Actual Rows'] ?? 0)).toBeLessThanOrEqual(2);
						}
						for (const child of Object.values(node)) checkPlan(child);
					}
				};
				checkPlan(plans);
				evidence.push({
					entryCount: size,
					elapsedMs,
					responseBytes: bytes,
					queries: queries.map((q) => q.query),
					plans,
					unrelatedRowsUnchanged: true
				});
			} finally {
				scan.close();
			}
		}
		await writeFile(
			process.env.SCAN_SCALE_REPORT ?? '/tmp/spellbook-scan-scale-20261007.json',
			JSON.stringify({ fixture: process.env.TEST_SCALE_CATALOG_PATH, evidence }, null, 2),
			{ mode: 0o600 }
		);
	}, 120000);
});
