import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createDemoPool } from './seed.mjs';
import { insertPrecon, precon } from './precon.mjs';

export function requireDemoDatabase(url) {
	if (!url || !/_(demo|design)$/.test(new URL(url).pathname))
		throw new Error('Requires a database name ending in _demo or _design.');
}

export async function legacyInventory() {
	const cards = JSON.parse(await readFile(new URL('./cards.json', import.meta.url), 'utf8'));
	const commander = cards.find((card) => card.name === 'Lathril, Blade of the Elves');
	const forest = cards.find((card) => card.name === 'Forest');
	const sol = cards.find((card) => card.name === 'Sol Ring');
	const alternate = cards.find((card) => card.name === 'Sol Ring' && card.id !== sol.id);
	const spells = [
		...cards
			.filter((card) => card !== commander && card !== forest && card.name !== 'Sol Ring')
			.slice(0, 63),
		sol
	];
	return [commander, ...spells.slice(0, 40), alternate, forest].map((d, position) => ({
		catalog_card_id: d.id,
		canonical_card_id: d.oracle_id,
		name: d.name,
		set_code: d.set_code,
		image_uri: d.image_uri,
		quantity: d === forest ? 30 : 1,
		finish: 'nonfoil',
		condition: 'NM',
		spellbook_position: position,
		notes: '',
		notes_revision: '0',
		game: 'mtg'
	}));
}

export function matchesLegacy(actual, expected) {
	return (
		actual.length === expected.length &&
		actual.every((row, index) =>
			Object.entries(expected[index]).every(([key, value]) => String(row[key]) === String(value))
		)
	);
}

/** Preview is read-only. Apply owns the transaction, parent lock and one revision advance. */
export async function replaceDemoInventory(client, { apply = false } = {}) {
	await client.query(apply ? 'BEGIN' : 'BEGIN READ ONLY');
	try {
		const { rows: users } = await client.query(
			'SELECT account_id,username FROM user_profiles' + (apply ? ' FOR UPDATE' : '')
		);
		if (users.length !== 1 || users[0].username !== 'demo')
			throw new Error('Requires the sole Demo account.');
		const account = users[0].account_id;
		const { rows: credentials } = await client.query(
			'SELECT account_id,username FROM local_credentials' + (apply ? ' FOR UPDATE' : '')
		);
		if (
			credentials.length !== 1 ||
			credentials[0].account_id !== account ||
			credentials[0].username !== 'demo'
		)
			throw new Error('Demo credential identity differs.');
		const { rows: inventories } = await client.query(
			'SELECT id,game,revision FROM inventories WHERE account_id=$1' + (apply ? ' FOR UPDATE' : ''),
			[account]
		);
		if (inventories.length !== 1 || inventories[0].game !== 'mtg')
			throw new Error('Requires one MTG Demo Inventory.');
		const inventory = inventories[0].id;
		const { rows: named } = await client.query(
			'SELECT id FROM decks WHERE account_id=$1 AND lower(name)=lower($2)',
			[account, precon.name]
		);
		if (named.length) {
			await client.query('COMMIT');
			return {
				status: 'preserved',
				reason: 'A named precon Deck already exists. Inventory and all Deck edits preserved.',
				account,
				inventory
			};
		}
		const {
			rows: [dependencies]
		} = await client.query(
			`SELECT
		 (SELECT count(*)::int FROM inventory_groups WHERE inventory_id=$1) AS groups,
		 (SELECT count(*)::int FROM inventory_group_memberships m JOIN inventory_cards c ON c.id=m.entry_id WHERE c.inventory_id=$1) AS memberships,
		 (SELECT count(*)::int FROM inventory_mutation_requests WHERE account_id=$2 AND (source <> 'web' OR status <> 'applied')) AS receipts`,
			[inventory, account]
		);
		if (dependencies.groups || dependencies.memberships || dependencies.receipts)
			throw new Error(
				'Inventory has Boxes, memberships or receipts other than completed web mutations. Replacement refused.'
			);
		const { rows: actual } = await client.query(
			'SELECT * FROM inventory_cards WHERE inventory_id=$1 ORDER BY spellbook_position',
			[inventory]
		);
		if (
			!['0', '1'].includes(String(inventories[0].revision)) ||
			!matchesLegacy(actual, await legacyInventory())
		)
			throw new Error(
				'Inventory differs from the original 43-entry, 72-copy starter. Replacement refused.'
			);
		// Verify every fixture identity against the active Catalog before deleting any rows.
		const {
			rows: [catalog]
		} = await client.query(
			`SELECT count(*)::int AS count FROM catalog_printings p
		 JOIN catalog_state s ON s.active_generation=p.generation_id
		 JOIN jsonb_to_recordset($1::jsonb) e(id uuid,oracle_id uuid,name text,set_code text,lang text,collector_number text)
		 ON p.id=e.id AND p.oracle_id=e.oracle_id AND p.name=e.name AND p.set_code=e.set_code AND p.lang=e.lang AND p.collector_number=e.collector_number`,
			[JSON.stringify(precon.cards.map((e) => e.card))]
		);
		if (catalog.count !== precon.cards.length)
			throw new Error('Active Catalog does not contain the precon fixture identities.');
		if (apply) {
			await client.query('DELETE FROM inventory_cards WHERE inventory_id=$1', [inventory]);
			await insertPrecon(client, account, inventory);
		}
		await client.query('COMMIT');
		return {
			status: apply ? 'applied' : 'preview',
			account,
			inventory,
			previousEntries: 43,
			previousCopies: 72,
			entries: 76,
			copies: 101,
			deck: precon.name
		};
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	requireDemoDatabase(process.env.DATABASE_URL);
	if (process.argv.slice(2).some((arg) => arg !== '--apply'))
		throw new Error('Only --apply is accepted; omission previews.');
	const pool = createDemoPool(process.env.DATABASE_URL);
	const client = await pool.connect();
	try {
		console.log(
			JSON.stringify(
				await replaceDemoInventory(client, { apply: process.argv.includes('--apply') })
			)
		);
	} finally {
		client.release();
		await pool.end();
	}
}
