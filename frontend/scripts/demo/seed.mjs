import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { hashPassword } from '../../src/lib/server/auth/password.ts';

const url = process.env.DATABASE_URL;
if (!url || !/_(demo|design)$/.test(new URL(url).pathname))
	throw new Error(
		'Demo seed requires DATABASE_URL with a database name ending in _demo or _design.'
	);
const reset = process.argv.includes('--reset-users');
const pool = new pg.Pool({ connectionString: url });
const client = await pool.connect();
try {
	await client.query('BEGIN');
	await client.query("SELECT pg_advisory_xact_lock(hashtext('spellbook-demo-seed'))");
	const { rows: users } = await client.query('SELECT account_id, username FROM user_profiles');
	if (!reset && users.some((user) => user.username !== 'demo'))
		throw new Error(
			'Database contains other users. Use a fresh demo database or explicitly pass --reset-users.'
		);
	if (reset) await client.query('DELETE FROM user_profiles');
	else if (users.some((user) => user.username === 'demo')) {
		await client.query('COMMIT');
		console.log('Demo is already seeded. Existing edits preserved.');
		process.exitCode = 0;
	}
	if (reset || !users.some((user) => user.username === 'demo')) {
		const cards = JSON.parse(await readFile(new URL('./cards.json', import.meta.url), 'utf8'));
		const generation = randomUUID();
		await client.query(
			"INSERT INTO catalog_generations(id,source_type,source_updated_at,document_count,published_at) VALUES($1,'demo',now(),$2,now())",
			[generation, cards.length]
		);
		for (const d of cards) {
			await client.query(
				'INSERT INTO catalog_printings(generation_id,id,oracle_id,name,normalized_name,printed_name,lang,set_code,collector_number,rarity,cmc,colors,card_types,legalities,search_name,search_text,document) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)',
				[
					generation,
					d.id,
					d.oracle_id,
					d.name,
					d.name.toLowerCase(),
					'',
					d.lang,
					d.set_code,
					d.collector_number,
					d.rarity,
					d.cmc,
					d.colors,
					d.card_types,
					JSON.stringify(d.legalities),
					d.name.toLowerCase(),
					d.name + ' ' + d.oracle_text,
					JSON.stringify(d)
				]
			);
		}
		await client.query(
			'INSERT INTO catalog_state(id,active_generation) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET active_generation=excluded.active_generation',
			[generation]
		);
		const account = randomUUID();
		await client.query("INSERT INTO user_profiles(account_id,username) VALUES($1,'demo')", [
			account
		]);
		await client.query(
			"INSERT INTO local_credentials(account_id,username,password_hash) VALUES($1,'demo',$2)",
			[account, await hashPassword('demo')]
		);
		const deck = randomUUID();
		await client.query(
			"INSERT INTO decks(id,account_id,game,name,format,description) VALUES($1,$2,'mtg','Elven council','Commander','Demo deck')",
			[deck, account]
		);
		const commander = cards.find((card) => card.name === 'Lathril, Blade of the Elves');
		const forest = cards.find((card) => card.name === 'Forest');
		const solRing = cards.find((card) => card.name === 'Sol Ring');
		const alternate = cards.find((card) => card.name === 'Sol Ring' && card.id !== solRing.id);
		const spells = [
			...cards
				.filter((card) => card !== commander && card !== forest && card.name !== 'Sol Ring')
				.slice(0, 63),
			solRing
		];
		for (const d of [commander, ...spells, forest]) {
			await client.query(
				"INSERT INTO deck_cards(id,deck_id,account_id,game,catalog_card_id,canonical_card_id,name,set_code,image_uri,quantity,role) VALUES($1,$2,$3,'mtg',$4,$5,$6,$7,$8,$9,$10)",
				[
					randomUUID(),
					deck,
					account,
					d.id,
					d.oracle_id,
					d.name,
					d.set_code,
					d.image_uri,
					d === forest ? 35 : 1,
					d === commander ? 'commander' : 'main'
				]
			);
		}
		await client.query(
			"INSERT INTO decks(id,account_id,game,name,format) VALUES($1,$2,'mtg','Next brew','Commander')",
			[randomUUID(), account]
		);
		const inventory = randomUUID();
		await client.query("INSERT INTO inventories(id,account_id,game) VALUES($1,$2,'mtg')", [
			inventory,
			account
		]);
		await client.query('SELECT id FROM inventories WHERE id=$1 FOR UPDATE', [inventory]);
		for (const [i, d] of [commander, ...spells.slice(0, 40), alternate, forest].entries()) {
			await client.query(
				"INSERT INTO inventory_cards(id,inventory_id,account_id,game,catalog_card_id,canonical_card_id,name,set_code,image_uri,quantity,finish,condition,spellbook_position,notes) VALUES($1,$2,$3,'mtg',$4,$5,$6,$7,$8,$9,'nonfoil','NM',$10,'')",
				[
					randomUUID(),
					inventory,
					account,
					d.id,
					d.oracle_id,
					d.name,
					d.set_code,
					d.image_uri,
					d === forest ? 30 : 1,
					i
				]
			);
		}
		await client.query('UPDATE inventories SET revision=revision+1 WHERE id=$1', [inventory]);
		await client.query('COMMIT');
		console.log('Demo ready. Username: demo. Password: demo.');
	}
} catch (cause) {
	await client.query('ROLLBACK');
	throw cause;
} finally {
	client.release();
	await pool.end();
}
