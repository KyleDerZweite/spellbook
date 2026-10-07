import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { verifyBundle, bundleBatches } from './catalog-bundle.mjs';
import pg from 'pg';
import { hashPassword } from '../../src/lib/server/auth/password.ts';

/** Caller owns BEGIN/COMMIT: Catalog and any fresh starter data publish atomically. */
export async function publishDemoCatalog(client, bundle) {
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
		for await (const batch of bundleBatches(bundle)) {
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

export async function seedDemo() {
	const url = process.env.DATABASE_URL;
	if (!url || !/_(demo|design)$/.test(new URL(url).pathname))
		throw new Error(
			'Demo seed requires DATABASE_URL with a database name ending in _demo or _design.'
		);
	const reset = process.argv.includes('--reset-users');
	const bundle = await verifyBundle();
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
		await publishDemoCatalog(client, bundle);
		if (reset) await client.query('DELETE FROM user_profiles');
		else if (users.some((user) => user.username === 'demo')) {
			await client.query('COMMIT');
			console.log('Demo is already seeded. Existing edits preserved.');
			process.exitCode = 0;
		}
		if (reset || !users.some((user) => user.username === 'demo')) {
			const cards = JSON.parse(await readFile(new URL('./cards.json', import.meta.url), 'utf8'));
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
		throw new Error('Demo seed failed; transaction rolled back.', {
			cause: new Error(cause instanceof Error ? cause.name : 'Unknown error')
		});
	} finally {
		client.release();
		await pool.end();
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await seedDemo();
