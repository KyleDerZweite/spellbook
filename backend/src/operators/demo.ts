import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { hashPassword } from '../auth/password.ts';

export interface PreconCard {
	id: string;
	oracle_id: string;
	name: string;
	set_code: string;
	lang: string;
	collector_number: string;
	image_uri: string | null;
}
export interface PreconEntry {
	card: PreconCard;
	quantity: number;
	role: string;
	finish: string;
	condition: string;
}
export interface Precon {
	name: string;
	description: string;
	cards: PreconEntry[];
	inventoryExtras: PreconEntry[];
}
export interface DemoBundle {
	manifest: {
		generationId: string;
		bundleVersion: string;
		catalogTransformVersion: number;
		counts: { documents: number };
	};
	batches: AsyncIterable<unknown[]>;
}
export interface SeedDemoInput {
	bundle: DemoBundle;
	precon: Precon;
	reset?: boolean;
}
export interface ReplaceDemoInput {
	precon: Precon;
	legacyInventory: Record<string, unknown>[];
	apply?: boolean;
}

function isDemoDatabase(url: string | undefined): boolean {
	if (!url) return false;
	try {
		return /_(demo|design)$/.test(new URL(url).pathname);
	} catch {
		return false;
	}
}

export function requireDemoDatabase(url: string | undefined) {
	if (!isDemoDatabase(url)) throw new Error('Requires a database name ending in _demo or _design.');
}

/** The backend owns acquisition and cleanup even if connecting or the operation fails. */
async function withDemoClient<T>(
	url: string | undefined,
	operation: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
	const pool = createDemoPool(url);
	let client: pg.PoolClient | undefined;
	try {
		try {
			client = await pool.connect();
		} catch {
			throw new Error('Demo database connection failed.');
		}
		return await operation(client);
	} finally {
		client?.release();
		await pool.end();
	}
}

export async function seedDemo(url: string | undefined, input: SeedDemoInput) {
	return withDemoClient(url, (client) => seedDemoWithClient(client, input));
}

export async function replaceDemoInventory(url: string | undefined, input: ReplaceDemoInput) {
	return withDemoClient(url, (client) => replaceDemoInventoryWithClient(client, input));
}

/** Caller owns BEGIN/COMMIT: Catalog and any fresh starter data publish atomically. */
export async function publishDemoCatalog(client: pg.PoolClient, bundle: DemoBundle) {
	const { manifest } = bundle;
	await client.query('SELECT pg_advisory_xact_lock($1,$2)', [1936747619, 1]);
	const { rows: generations } = await client.query(
		'SELECT source_type,source_updated_at,document_count,schema_version FROM catalog_generations WHERE id=$1',
		[manifest.generationId]
	);
	if (generations.length) {
		const g = generations[0];
		const {
			rows: [counts]
		} = await client.query(
			'SELECT (SELECT count(*)::int FROM catalog_printings WHERE generation_id=$1) AS printings, (SELECT count(*)::int FROM catalog_oracle_facts WHERE generation_id=$1) AS facts',
			[manifest.generationId]
		);
		if (
			g.source_type !== 'demo-bundle' ||
			g.document_count !== manifest.counts.documents ||
			g.schema_version !== manifest.catalogTransformVersion ||
			new Date(g.source_updated_at).toISOString() !==
				new Date(manifest.bundleVersion).toISOString() ||
			counts.printings !== manifest.counts.documents ||
			counts.facts !== manifest.counts.documents
		)
			throw new Error('Existing Demo Catalog generation is inconsistent.');
		for await (const _batch of bundle.batches) {
			// Exhaust the stream so its final digest and count checks also run on reruns.
		}
	} else {
		await client.query(
			"INSERT INTO catalog_generations(id,source_type,source_updated_at,document_count,schema_version) VALUES($1,'demo-bundle',$2,$3,$4)",
			[
				manifest.generationId,
				manifest.bundleVersion,
				manifest.counts.documents,
				manifest.catalogTransformVersion
			]
		);
		for await (const batch of bundle.batches) {
			await client.query(
				`INSERT INTO catalog_printings(generation_id,id,oracle_id,name,normalized_name,printed_name,lang,set_code,collector_number,rarity,cmc,colors,card_types,legalities,search_name,search_text,document)
				 SELECT $1,d.id,d.oracle_id,d.name,d.normalized_name,d.printed_name,d.lang,d.set_code,d.collector_number,d.rarity,d.cmc,d.colors,d.card_types,d.legalities,r.search_name,r.search_text,r.document
				 FROM jsonb_to_recordset($2::jsonb) r(document jsonb,search_name text,search_text text)
				 CROSS JOIN LATERAL jsonb_to_record(r.document) d(id uuid,oracle_id uuid,name text,normalized_name text,printed_name text,lang text,set_code text,collector_number text,rarity text,cmc double precision,colors text[],card_types text[],legalities jsonb)`,
				[manifest.generationId, JSON.stringify(batch)]
			);
			await client.query(
				`INSERT INTO catalog_oracle_facts(generation_id,printing_id,raw_oracle_id,types,transform_version)
				 SELECT $1,(r.document->>'id')::uuid,r.raw_oracle_id,r.types,$3
				 FROM jsonb_to_recordset($2::jsonb) r(document jsonb,raw_oracle_id uuid,types text[])`,
				[manifest.generationId, JSON.stringify(batch), manifest.catalogTransformVersion]
			);
		}
		await client.query('UPDATE catalog_generations SET published_at=now() WHERE id=$1', [
			manifest.generationId
		]);
	}
	await client.query(
		`INSERT INTO catalog_state(id,active_generation,updated_at) VALUES(1,$1,now())
		 ON CONFLICT(id) DO UPDATE SET previous_generation=catalog_state.active_generation,active_generation=excluded.active_generation,updated_at=now()
		 WHERE catalog_state.active_generation IS DISTINCT FROM excluded.active_generation`,
		[manifest.generationId]
	);
}

export function createDemoPool(url: string | undefined) {
	if (!isDemoDatabase(url))
		throw new Error(
			'Demo seed requires DATABASE_URL with a database name ending in _demo or _design.'
		);
	return new pg.Pool({ connectionString: url });
}

/** Caller owns the transaction and Inventory parent lock. */
export async function insertPrecon(
	client: pg.PoolClient,
	account: string,
	inventory: string,
	precon: Precon
) {
	const deck = randomUUID();
	await client.query(
		"INSERT INTO decks(id,account_id,game,name,format,description) VALUES($1,$2,'mtg',$3,'Commander',$4)",
		[deck, account, precon.name, precon.description]
	);
	for (const entry of precon.cards) {
		const d = entry.card;
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
				entry.quantity,
				entry.role
			]
		);
	}
	for (const [position, entry] of [...precon.cards, ...precon.inventoryExtras].entries()) {
		const d = entry.card;
		await client.query(
			"INSERT INTO inventory_cards(id,inventory_id,account_id,game,catalog_card_id,canonical_card_id,name,set_code,image_uri,quantity,finish,condition,spellbook_position,notes) VALUES($1,$2,$3,'mtg',$4,$5,$6,$7,$8,$9,$10,$11,$12,'')",
			[
				randomUUID(),
				inventory,
				account,
				d.id,
				d.oracle_id,
				d.name,
				d.set_code,
				d.image_uri,
				entry.quantity,
				entry.finish,
				entry.condition,
				position
			]
		);
	}
	await client.query('UPDATE inventories SET revision=revision+1 WHERE id=$1', [inventory]);
	return deck;
}
export function matchesLegacy(
	actual: Record<string, unknown>[],
	expected: Record<string, unknown>[]
) {
	return (
		actual.length === expected.length &&
		actual.every((row, index) =>
			Object.entries(expected[index]!).every(([key, value]) => String(row[key]) === String(value))
		)
	);
}

/** Preview is read-only. Apply owns the transaction, parent lock and one revision advance. */
export async function replaceDemoInventoryWithClient(
	client: pg.PoolClient,
	{ apply = false, precon, legacyInventory }: ReplaceDemoInput
) {
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
			!matchesLegacy(actual, legacyInventory)
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
			await insertPrecon(client, account, inventory, precon);
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

async function seedDemoWithClient(
	client: pg.PoolClient,
	{ bundle, precon, reset = false }: SeedDemoInput
) {
	try {
		await client.query('BEGIN');
		await client.query("SELECT pg_advisory_xact_lock(hashtext('spellbook-demo-seed'))");
		const { rows: users } = await client.query('SELECT account_id, username FROM user_profiles');
		if (!reset && (users.length > 1 || users.some((user) => user.username !== 'demo')))
			throw new Error(
				'Database contains other users. Use a fresh demo database or explicitly pass --reset-users.'
			);
		await publishDemoCatalog(client, bundle);
		if (reset) await client.query('DELETE FROM user_profiles');
		else if (users.some((user) => user.username === 'demo')) {
			await client.query('COMMIT');
			return {
				status: 'preserved' as const,
				message: 'Demo is already seeded. Existing edits preserved.'
			};
		}
		const account = randomUUID();
		await client.query("INSERT INTO user_profiles(account_id,username) VALUES($1,'demo')", [
			account
		]);
		await client.query(
			"INSERT INTO local_credentials(account_id,username,password_hash) VALUES($1,'demo',$2)",
			[account, await hashPassword('demo')]
		);
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
		await insertPrecon(client, account, inventory, precon);
		await client.query('COMMIT');
		return { status: 'seeded' as const, message: 'Demo ready. Username: demo. Password: demo.' };
	} catch (cause) {
		await client.query('ROLLBACK');
		throw new Error('Demo seed failed; transaction rolled back.', {
			cause: new Error(cause instanceof Error ? cause.name : 'Unknown error')
		});
	}
}
