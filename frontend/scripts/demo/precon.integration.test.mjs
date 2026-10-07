import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createDemoPool } from './seed.mjs';
import { precon, insertPrecon } from './precon.mjs';
import {
	legacyInventory,
	replaceDemoInventory,
	requireDemoDatabase
} from './replace-inventory.mjs';

const url = process.env.TEST_DATABASE_URL;
for (const revision of [0, 1])
	test(
		`native legacy revision ${revision} previews, refuses edits/dependencies, commits once, emits saved state and preserves reruns`,
		{ skip: !url },
		async () => {
			requireDemoDatabase(url);
			const pool = createDemoPool(url);
			const client = await pool.connect();
			const listener = await pool.connect();
			const account = randomUUID(),
				inventory = randomUUID(),
				existingDeck = randomUUID(),
				generation = randomUUID();
			try {
				assert.equal(
					(await client.query('SELECT count(*)::int AS n FROM user_profiles')).rows[0].n,
					0,
					'Requires an empty disposable database.'
				);
				assert.equal(
					(await client.query('SELECT count(*)::int AS n FROM catalog_generations')).rows[0].n,
					0,
					'Requires an empty disposable Catalog.'
				);
				await client.query("INSERT INTO user_profiles(account_id,username) VALUES($1,'demo')", [
					account
				]);
				await client.query(
					"INSERT INTO local_credentials(account_id,username,password_hash) VALUES($1,'demo','test-only')",
					[account]
				);
				await client.query(
					"INSERT INTO inventories(id,account_id,game,revision) VALUES($1,$2,'mtg',$3)",
					[inventory, account, revision]
				);
				await client.query(
					"INSERT INTO decks(id,account_id,game,name,format,description) VALUES($1,$2,'mtg','Existing owned Deck','Commander','keep me')",
					[existingDeck, account]
				);
				for (const e of await legacyInventory())
					await client.query(
						`INSERT INTO inventory_cards(id,inventory_id,account_id,game,catalog_card_id,canonical_card_id,name,set_code,image_uri,quantity,finish,condition,spellbook_position,notes)
		 VALUES($1,$2,$3,'mtg',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
						[
							randomUUID(),
							inventory,
							account,
							e.catalog_card_id,
							e.canonical_card_id,
							e.name,
							e.set_code,
							e.image_uri,
							e.quantity,
							e.finish,
							e.condition,
							e.spellbook_position,
							e.notes
						]
					);
				await client.query(
					"INSERT INTO catalog_generations(id,source_type,source_updated_at,document_count,schema_version) VALUES($1,'precon-test',now(),75,1)",
					[generation]
				);
				for (const { card: d } of precon.cards)
					await client.query(
						`INSERT INTO catalog_printings(generation_id,id,oracle_id,name,normalized_name,printed_name,lang,set_code,collector_number,rarity,cmc,colors,card_types,legalities,search_name,search_text,document)
		 VALUES($1,$2,$3,$4,$5,'',$6,$7,$8,$9,$10,$11,$12,$13,$5,'',$14)`,
						[
							generation,
							d.id,
							d.oracle_id,
							d.name,
							d.normalized_name,
							d.lang,
							d.set_code,
							d.collector_number,
							d.rarity,
							d.cmc,
							d.colors,
							d.card_types,
							d.legalities,
							d
						]
					);
				await client.query('UPDATE catalog_state SET active_generation=$1 WHERE id=1', [
					generation
				]);
				const fingerprint = async () =>
					JSON.stringify(
						(
							await client.query(`SELECT (SELECT jsonb_agg(c ORDER BY c.id) FROM inventory_cards c) cards,
		 (SELECT jsonb_agg(i ORDER BY i.id) FROM inventories i) inventories,(SELECT jsonb_agg(d ORDER BY d.id) FROM decks d) decks`)
						).rows
					);
				assert.equal(
					(await client.query('SELECT count(*)::int AS n FROM catalog_generations')).rows[0].n,
					1
				);
				const before = await fingerprint();
				await client.query('UPDATE inventories SET revision=2');
				await assert.rejects(replaceDemoInventory(client, { apply: true }), /differs/);
				await client.query('UPDATE inventories SET revision=$1', [revision]);
				assert.equal((await replaceDemoInventory(client)).status, 'preview');
				assert.equal(await fingerprint(), before);
				await client.query(
					"UPDATE inventory_cards SET notes='owned edit' WHERE spellbook_position=0"
				);
				await assert.rejects(replaceDemoInventory(client, { apply: true }), /differs/);
				await client.query("UPDATE inventory_cards SET notes='' WHERE spellbook_position=0");
				const group = randomUUID();
				await client.query(
					"INSERT INTO inventory_groups(id,inventory_id,name) VALUES($1,$2,'Keep box')",
					[group, inventory]
				);
				await assert.rejects(replaceDemoInventory(client, { apply: true }), /Boxes/);
				await client.query('DELETE FROM inventory_groups WHERE id=$1', [group]);
				await client.query(
					"INSERT INTO inventory_mutation_requests(account_id,request_id,source,status) VALUES($1,'precon-test','scan_review','applied')",
					[account]
				);
				await assert.rejects(replaceDemoInventory(client, { apply: true }), /receipts/);
				await client.query('DELETE FROM inventory_mutation_requests WHERE account_id=$1', [
					account
				]);
				assert.equal(await fingerprint(), before);
				await client.query("UPDATE local_credentials SET username='different'");
				await assert.rejects(replaceDemoInventory(client, { apply: true }), /credential identity/);
				await client.query("UPDATE local_credentials SET username='demo'");
				await client.query('UPDATE catalog_state SET active_generation=NULL');
				await assert.rejects(replaceDemoInventory(client, { apply: true }), /Active Catalog/);
				await client.query('UPDATE catalog_state SET active_generation=$1', [generation]);
				await client.query(
					`CREATE FUNCTION precon_test_reject() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'precon test insertion rejected'; END $$`
				);
				await client.query(
					'CREATE TRIGGER precon_test_reject BEFORE INSERT ON deck_cards FOR EACH ROW EXECUTE FUNCTION precon_test_reject()'
				);
				await assert.rejects(
					replaceDemoInventory(client, { apply: true }),
					/precon test insertion rejected/
				);
				assert.equal(await fingerprint(), before);
				await client.query('DROP TRIGGER precon_test_reject ON deck_cards');
				await client.query('DROP FUNCTION precon_test_reject()');
				const events = [];
				listener.on('notification', (event) => events.push(JSON.parse(event.payload)));
				await listener.query('LISTEN spellbook_saved_state');
				await listener.query('BEGIN');
				await listener.query('SELECT id FROM inventories WHERE id=$1 FOR UPDATE', [inventory]);
				let settled = false;
				const applying = replaceDemoInventory(client, { apply: true }).finally(() => {
					settled = true;
				});
				await new Promise((resolve) => setTimeout(resolve, 50));
				assert.equal(settled, false, 'Apply waits for the Inventory parent lock');
				await listener.query('COMMIT');
				assert.equal((await applying).status, 'applied');
				const {
					rows: [counts]
				} = await client.query(
					'SELECT count(*)::int AS entries,sum(quantity)::int AS copies FROM inventory_cards WHERE inventory_id=$1',
					[inventory]
				);
				assert.deepEqual(counts, { entries: 76, copies: 101 });
				assert.deepEqual(
					(
						await client.query(
							"SELECT finish, quantity FROM inventory_cards WHERE name='Chishiro, the Shattered Blade' ORDER BY finish"
						)
					).rows,
					[
						{ finish: 'foil', quantity: 1 },
						{ finish: 'nonfoil', quantity: 1 }
					]
				);
				assert.equal(
					(await client.query('SELECT revision FROM inventories WHERE id=$1', [inventory])).rows[0]
						.revision,
					String(revision + 1)
				);
				assert.equal(
					(await client.query('SELECT description FROM decks WHERE id=$1', [existingDeck])).rows[0]
						.description,
					'keep me'
				);
				assert.equal(
					(await client.query('SELECT sum(quantity)::int AS copies FROM deck_cards')).rows[0]
						.copies,
					100
				);
				await new Promise((resolve) => setTimeout(resolve, 100));
				assert.ok(events.some((e) => e.accountId === account && e.topic === 'inventory'));
				assert.ok(events.some((e) => e.accountId === account && e.topic === 'decks'));
				await client.query(
					"UPDATE inventory_cards SET notes='later owned edit' WHERE spellbook_position=0"
				);
				const after = await fingerprint();
				assert.equal((await replaceDemoInventory(client, { apply: true })).status, 'preserved');
				assert.equal(await fingerprint(), after);
				await client.query('DELETE FROM user_profiles WHERE account_id=$1', [account]);
				await client.query("INSERT INTO user_profiles(account_id,username) VALUES($1,'demo')", [
					account
				]);
				await client.query(
					"INSERT INTO local_credentials(account_id,username,password_hash) VALUES($1,'demo','test-only')",
					[account]
				);
				await client.query("INSERT INTO inventories(id,account_id,game) VALUES($1,$2,'mtg')", [
					inventory,
					account
				]);
				await client.query('BEGIN');
				await client.query('SELECT id FROM inventories WHERE id=$1 FOR UPDATE', [inventory]);
				await insertPrecon(client, account, inventory);
				await client.query('COMMIT');
				assert.equal(
					(await client.query('SELECT sum(quantity)::int AS copies FROM inventory_cards')).rows[0]
						.copies,
					101
				);
				assert.equal(
					(await client.query('SELECT revision FROM inventories WHERE id=$1', [inventory])).rows[0]
						.revision,
					'1'
				);
			} finally {
				await client.query('DROP TRIGGER IF EXISTS precon_test_reject ON deck_cards');
				await client.query('DROP FUNCTION IF EXISTS precon_test_reject()');
				await client.query('DELETE FROM user_profiles WHERE account_id=$1', [account]);
				await client.query(
					'UPDATE catalog_state SET active_generation=NULL WHERE active_generation=$1',
					[generation]
				);
				await client.query('DELETE FROM catalog_generations WHERE id=$1', [generation]);
				listener.release();
				client.release();
				await pool.end();
			}
		}
	);
