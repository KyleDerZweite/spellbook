import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
import { drizzle } from 'drizzle-orm/node-postgres';
import {
	createDatabase,
	createLocalAuth,
	createCatalog,
	createInventoryMutations
} from '@spellbook/backend';
import * as schema from '@spellbook/backend/db/schema.ts';
import type { CardDocument } from '@spellbook/contracts/catalog.ts';
import { cpus, totalmem } from 'node:os';

const run =
	process.env.TEST_DATABASE_URL && process.env.TEST_SCALE_CATALOG_PATH ? describe : describe.skip;
run('real-printing Inventory mutation scale', () => {
	let database: ReturnType<typeof createDatabase>;
	const accounts: string[] = [];
	beforeAll(() => {
		database = createDatabase(process.env.TEST_DATABASE_URL!);
	});
	afterAll(async () => {
		await database.pool.query('DELETE FROM inventory_mutation_requests WHERE account_id=ANY($1)', [
			accounts
		]);
		await database.pool.query('DELETE FROM user_profiles WHERE account_id=ANY($1)', [accounts]);
		await database.pool.end();
	});
	it('ordinary quantity and Remove touch only their target at start, middle and end of 1k/10k/50k legal entries', async () => {
		const records: Array<{ document: CardDocument; supportedInventoryFinishes: string[] }> = (
			await readFile(process.env.TEST_SCALE_CATALOG_PATH!, 'utf8')
		)
			.trim()
			.split('\n')
			.map((line) => JSON.parse(line));
		expect(records.length).toBe(10000);
		const evidence: unknown[] = [];
		for (const size of [1000, 10000, 50000]) {
			let statements: string[] = [];
			const db = drizzle(database.pool, {
				schema,
				logger: {
					logQuery(query) {
						statements.push(query);
					}
				}
			});
			const auth = createLocalAuth(db, { demoMode: false });
			const session = await auth.authenticate(
				'register',
				`mutation_scale_${crypto.randomUUID().slice(0, 8)}`,
				'mutation-scale-fixture-password'
			);
			if (!session) throw new Error('Scale fixture registration failed');
			accounts.push(session.user.accountId);
			const application = createInventoryMutations(db, createCatalog(database.pool), auth);
			const inventoryId = crypto.randomUUID();
			await database.pool.query("INSERT INTO inventories(id,account_id,game)VALUES($1,$2,'mtg')", [
				inventoryId,
				session.user.accountId
			]);
			const rows = records.slice(0, size / 5).flatMap(({ document, supportedInventoryFinishes }) =>
				['NM', 'LP', 'MP', 'HP', 'DMG'].map((condition) => ({
					id: crypto.randomUUID(),
					catalogCardId: document.id,
					canonicalCardId: document.oracle_id,
					name: document.name,
					setCode: document.set_code,
					imageUri: document.image_uri,
					finish: supportedInventoryFinishes[0],
					condition
				}))
			);
			for (let offset = 0; offset < rows.length; offset += 1000)
				await database.pool.query(
					`INSERT INTO inventory_cards(id,inventory_id,account_id,game,catalog_card_id,canonical_card_id,name,set_code,image_uri,finish,condition,quantity,spellbook_position) SELECT r.id,$1,$2,'mtg',r."catalogCardId",r."canonicalCardId",r.name,r."setCode",r."imageUri",r.finish,r.condition,2,r.position FROM jsonb_to_recordset($3::jsonb) AS r(id uuid,"catalogCardId" text,"canonicalCardId" text,name text,"setCode" text,"imageUri" text,finish text,condition text,position integer)`,
					[
						inventoryId,
						session.user.accountId,
						JSON.stringify(
							rows
								.slice(offset, offset + 1000)
								.map((row, index) => ({ ...row, position: offset + index }))
						)
					]
				);
			const results = [];
			for (const index of [0, Math.floor(size / 2), size - 1]) {
				statements = [];
				let start = performance.now();
				const receipt = await application.patchEntry(session.user, {
					requestId: crypto.randomUUID(),
					entryId: rows[index].id,
					delta: 1
				});
				const quantityMs = performance.now() - start;
				const quantitySql = [...statements];
				expect(receipt.changes[0]).toMatchObject({ quantity: 3, delta: 1 });
				expect(Buffer.byteLength(JSON.stringify(receipt))).toBeLessThan(1500);
				statements = [];
				start = performance.now();
				const removed = await application.remove(session.user, {
					requestId: crypto.randomUUID(),
					entryId: rows[index].id,
					expectedQuantity: 3
				});
				const removeMs = performance.now() - start;
				const removeSql = [...statements];
				expect(removed.removedEntryIds).toEqual([rows[index].id]);
				for (const query of [...quantitySql, ...removeSql])
					if (query.includes('inventory_cards')) {
						expect(query).not.toMatch(/order by.*spellbook_position/i);
						expect(query).not.toMatch(/set\s+"spellbook_position"/i);
						expect(query).toMatch(/"inventory_cards"\."id"\s*(?:=|in)/);
					}
				results.push({
					index,
					quantityMs,
					removeMs,
					quantityBytes: Buffer.byteLength(JSON.stringify(receipt)),
					removeBytes: Buffer.byteLength(JSON.stringify(removed)),
					quantitySql,
					removeSql
				});
			}
			const stable = await database.pool.query(
				'SELECT count(*)::int AS entries,count(*) FILTER(WHERE quantity<>2)::int AS wrong_quantity,count(*) FILTER(WHERE spellbook_position<>r.position)::int AS moved FROM inventory_cards c JOIN jsonb_to_recordset($2::jsonb)AS r(id uuid,position integer)ON c.id=r.id WHERE inventory_id=$1',
				[inventoryId, JSON.stringify(rows.map((row, position) => ({ id: row.id, position })))]
			);
			expect(stable.rows[0]).toEqual({ entries: size - 3, wrong_quantity: 0, moved: 0 });
			evidence.push({ entries: size, results, unchangedSurvivors: stable.rows[0] });
		}
		await writeFile(
			'/tmp/spellbook-slice4-mutation-scale-20261007.json',
			JSON.stringify(
				{
					fixture: process.env.TEST_SCALE_CATALOG_PATH,
					cpu: cpus()[0]?.model,
					logicalCpus: cpus().length,
					memoryBytes: totalmem(),
					evidence
				},
				null,
				2
			)
		);
	}, 120000);
});
