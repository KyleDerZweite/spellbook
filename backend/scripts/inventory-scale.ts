/** Disposable scale fixture and measured query evidence. No account data is copied. */
import { createDatabase } from '../src/db/client.ts';
import { createLocalAuth } from '../src/auth/local.ts';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { cpus, totalmem } from 'node:os';
import { hashPassword } from '../src/auth/password.ts';
import { createInventory } from '../src/inventory/read.ts';
import type { CardDocument } from '@spellbook/contracts/catalog.ts';
const expectedDatabase = 'spellbook_inventory_windows_03_20261007';
const databaseUrl = process.env.TEST_DATABASE_URL;
if (
	!databaseUrl ||
	databaseUrl !== process.env.DATABASE_URL ||
	new URL(databaseUrl).pathname !== `/${expectedDatabase}`
)
	throw new Error('Scale fixture requires its isolated Inventory database.');
const source =
	'/home/kyle/CodingProjects/spellbook/.local/design-review/public-scale-fixtures/catalog-10000.jsonl';
const data = await readFile(source, 'utf8');
const manifest = JSON.parse(await readFile(source.replace('.jsonl', '.manifest.json'), 'utf8'));
const cards = data
	.trim()
	.split('\n')
	.map(
		(line) => JSON.parse(line) as { document: CardDocument; supportedInventoryFinishes: string[] }
	);
if (cards.length !== 10000 || new Set(cards.map((c) => c.document.id)).size !== 10000)
	throw Error('Expected 10000 distinct public printings');
const database = createDatabase(databaseUrl);
const pool = database.pool;
const auth = createLocalAuth(database.db, { demoMode: false });
const measureOnly = process.argv.includes('--measure-only');
const analyze = process.argv.includes('--analyze');
const directory = new URL('../../.local/inventory-evidence/', import.meta.url);
const statementPlans = new Map<string, { sql: string; values: unknown[] }>();
pool.on('connect', (client) => {
	client.query = new Proxy(client.query, {
		apply(target, thisArg, args) {
			if (
				typeof args[0] === 'string' &&
				/^(SELECT|WITH)/.test(args[0]) &&
				/inventory_cards|inventory_groups|inventory_group_memberships/.test(args[0])
			)
				statementPlans.set(args[0], { sql: args[0], values: args[1] ?? [] });
			return Reflect.apply(target, thisArg, args);
		}
	});
});
const inventory = createInventory(pool, auth);
const generation = randomUUID(),
	run = randomUUID().slice(0, 8),
	credentials: Array<{ entries: number; accountId: string; username: string; password: string }> =
		measureOnly
			? JSON.parse(await readFile(new URL('browser-credentials.json', directory), 'utf8'))
			: [];
const evidence: Record<string, unknown> = {
	createdAt: new Date().toISOString(),
	implementationHashes: Object.fromEntries(
		await Promise.all(
			['../src/inventory/read.ts', '../src/inventory/query.ts', '../src/db/schema.ts'].map(
				async (file) => [
					file,
					createHash('sha256')
						.update(await readFile(new URL(file, import.meta.url)))
						.digest('hex')
				]
			)
		)
	),
	sampleRequests: process.argv.includes('--quick') ? 3 : 7,
	source,
	sourceSha256: createHash('sha256').update(data).digest('hex'),
	manifest,
	generation,
	machine: {
		cpu: cpus()[0]?.model,
		logicalCpus: cpus().length,
		ramBytes: totalmem(),
		node: process.version
	},
	targets: {
		queryP95Ms: 500,
		scrollP95Ms: 50,
		pageMax: 100,
		globalPageCache: 20,
		contexts: 4,
		concurrent: 3
	},
	levels: []
};
try {
	if (measureOnly)
		evidence.generation = (
			await pool.query('SELECT active_generation FROM catalog_state WHERE id=1')
		).rows[0]?.active_generation;
	if (!measureOnly) {
		const client = await pool.connect();
		try {
			await client.query('BEGIN');
			await client.query(
				"INSERT INTO catalog_generations(id,source_type,source_updated_at,document_count,published_at)VALUES($1,'public-scale-fixture',now(),10000,now())",
				[generation]
			);
			for (let offset = 0; offset < cards.length; offset += 250) {
				const docs = cards.slice(offset, offset + 250).map((c) => c.document);
				await client.query(
					`INSERT INTO catalog_printings(generation_id,id,oracle_id,name,normalized_name,printed_name,lang,set_code,collector_number,rarity,cmc,colors,card_types,legalities,search_name,search_text,document) SELECT $1,(d->>'id')::uuid,(d->>'oracle_id')::uuid,d->>'name',d->>'normalized_name',COALESCE(d->>'printed_name',''),d->>'lang',d->>'set_code',d->>'collector_number',d->>'rarity',(d->>'cmc')::float8,ARRAY(SELECT jsonb_array_elements_text(d->'colors')),ARRAY(SELECT jsonb_array_elements_text(d->'card_types')),d->'legalities',lower(d->>'name'),(d->>'name')||' '||(d->>'oracle_text'),d FROM jsonb_array_elements($2::jsonb)d`,
					[generation, JSON.stringify(docs)]
				);
			}
			await client.query(
				'INSERT INTO catalog_state(id,active_generation)VALUES(1,$1)ON CONFLICT(id)DO UPDATE SET active_generation=excluded.active_generation',
				[generation]
			);
			await client.query('COMMIT');
		} catch (cause) {
			await client.query('ROLLBACK');
			throw cause;
		} finally {
			client.release();
		}
	}
	if (analyze) {
		const start = performance.now();
		await pool.query(
			'ANALYZE inventory_cards,inventory_groups,inventory_group_memberships,catalog_printings'
		);
		evidence.analyzeMs = performance.now() - start;
	}
	evidence.statistics = analyze
		? 'explicit ANALYZE before requests'
		: 'no explicit ANALYZE in this run';
	evidence.measurement =
		'First application request and subsequent warm requests, not OS-cache cold measurements';
	for (const count of [1000, 10000, 50000].filter(
		(count) => !process.argv.includes('--level=50000') || count === 50000
	)) {
		const accountId = randomUUID(),
			inventoryId = randomUUID(),
			username = `scale_${count}_${run}`,
			password = randomBytes(24).toString('base64url');
		const previous = credentials.find((c) => c.entries === count);
		if (measureOnly && !previous) throw Error('Missing fixture credential reference');
		if (!measureOnly) {
			const client = await pool.connect();
			const ids: string[] = [];
			const groups = [randomUUID(), randomUUID(), randomUUID()];
			try {
				await client.query('BEGIN');
				await client.query('INSERT INTO user_profiles(account_id,username)VALUES($1,$2)', [
					accountId,
					username
				]);
				await client.query(
					'INSERT INTO local_credentials(account_id,username,password_hash)VALUES($1,$2,$3)',
					[accountId, username, await hashPassword(password)]
				);
				await client.query("INSERT INTO inventories(id,account_id,game)VALUES($1,$2,'mtg')", [
					inventoryId,
					accountId
				]);
				await client.query('SELECT id FROM inventories WHERE id=$1 FOR UPDATE', [inventoryId]);
				for (let offset = 0; offset < count; offset += 500) {
					const rows = [];
					for (let index = offset; index < Math.min(count, offset + 500); index++) {
						const selected = cards[Math.floor(index / 5)],
							d = selected.document,
							id = randomUUID();
						ids.push(id);
						const finish = selected.supportedInventoryFinishes.find(
							(f) => f === 'nonfoil' || f === 'foil'
						);
						if (!finish) throw Error('Printing lacks supported finish');
						rows.push({
							id,
							printing: d.id,
							oracle: d.oracle_id,
							name: d.name,
							set: d.set_code,
							image: d.image_uri,
							quantity: (index % 5) + 1,
							finish,
							condition: ['NM', 'LP', 'MP', 'HP', 'DMG'][index % 5],
							position: index,
							notes:
								index % 97 === 0
									? 'Synthetic fixture Notes: literal %_ search. Long metadata remains readable on a narrow viewport.'
									: '',
							created: new Date(Date.UTC(2026, 8, 1) + (index % 30) * 86400000).toISOString()
						});
					}
					await client.query(
						`INSERT INTO inventory_cards(id,inventory_id,account_id,game,catalog_card_id,canonical_card_id,name,set_code,image_uri,quantity,finish,condition,spellbook_position,notes,created_at,updated_at) SELECT (r->>'id')::uuid,$1,$2,'mtg',r->>'printing',r->>'oracle',r->>'name',r->>'set',r->>'image',(r->>'quantity')::int,r->>'finish',r->>'condition',(r->>'position')::int,r->>'notes',(r->>'created')::timestamptz,(r->>'created')::timestamptz FROM jsonb_array_elements($3::jsonb)r`,
						[inventoryId, accountId, JSON.stringify(rows)]
					);
				}
				for (const [index, id] of groups.entries())
					await client.query('INSERT INTO inventory_groups(id,inventory_id,name)VALUES($1,$2,$3)', [
						id,
						inventoryId,
						['Even entries', 'Every third entry', 'Empty group'][index]
					]);
				await client.query(
					'INSERT INTO inventory_group_memberships(group_id,entry_id)SELECT $1,id FROM inventory_cards WHERE inventory_id=$2 AND spellbook_position%2=0',
					[groups[0], inventoryId]
				);
				await client.query(
					'INSERT INTO inventory_group_memberships(group_id,entry_id)SELECT $1,id FROM inventory_cards WHERE inventory_id=$2 AND spellbook_position%3=0',
					[groups[1], inventoryId]
				);
				await client.query('UPDATE inventories SET revision=revision+1 WHERE id=$1', [inventoryId]);
				await client.query('COMMIT');
			} catch (cause) {
				await client.query('ROLLBACK');
				throw cause;
			} finally {
				client.release();
			}
			credentials.push({ entries: count, accountId, username, password });
		}
		const credential = credentials.find((c) => c.entries === count)!;
		const session = await auth.authenticate('login', credential.username, credential.password);
		if (!session) throw Error('Fixture authentication failed');
		const actor = session.user;
		const owned = await pool.query('SELECT id FROM inventories WHERE account_id=$1', [
			actor.accountId
		]);
		const actualInventoryId = owned.rows[0].id;
		const actualGroups = await pool.query(
			'SELECT id,name FROM inventory_groups WHERE inventory_id=$1 ORDER BY name',
			[actualInventoryId]
		);
		const even = actualGroups.rows.find((g) => g.name === 'Even entries').id;
		const empty = actualGroups.rows.find((g) => g.name === 'Empty group').id;
		const cases = [
			{},
			{ offset: count - 50 },
			{ sort: 'name', dir: 'desc' },
			{ sort: 'set' },
			{ sort: 'set', dir: 'desc', variant: 'quantity', variantDir: 'desc' },
			{ sort: 'newest' },
			{ variant: 'finish' },
			{ variant: 'condition' },
			{ variant: 'quantity' },
			{ q: '%_' },
			{ finish: 'foil' },
			{ condition: 'DMG' },
			{ sets: [cards[0].document.set_code] },
			{ group: even },
			{ group: empty },
			{ view: 'groups' },
			{ q: 'not a card name' }
		];
		const queries = [];
		for (const query of cases) {
			const timings = [];
			let payload = 0,
				revision = '',
				entries = 0;
			for (let attempt = 0; attempt < (process.argv.includes('--quick') ? 3 : 7); attempt++) {
				const start = performance.now();
				const result = await inventory.page(actor, query);
				timings.push(performance.now() - start);
				if (result.kind !== 'Page') throw Error('Expected page');
				payload = Buffer.byteLength(JSON.stringify(result));
				revision = result.revision;
				entries = result.entries.length;
			}
			const sorted = timings.slice(1).sort((a, b) => a - b);
			queries.push({
				query,
				firstRequestMs: timings[0],
				warmP95Ms: sorted.at(-1),
				payloadBytes: payload,
				revision,
				returnedEntries: entries
			});
		}
		const first = await inventory.page(actor, {});
		if (first.kind !== 'Page' || first.totals.entryCount !== count)
			throw Error('Distinct entry count mismatch');
		const foreignCredential = credentials.find((c) => c.entries !== count);
		if (foreignCredential) {
			const foreign = await auth.authenticate(
				'login',
				foreignCredential.username,
				foreignCredential.password
			);
			if (!foreign || (await inventory.getEntry(foreign.user, first.entries[0].id)) !== null)
				throw Error('Account isolation failed');
		}
		const deep = await inventory.page(actor, { offset: count - 50 });
		if (deep.kind !== 'Page') throw Error('Expected deep page');
		const deepEntry = deep.entries.at(-1)!;
		const locateStart = performance.now();
		const location = await inventory.locate(actor, {}, deepEntry.id, deep.revision);
		const locateMs = performance.now() - locateStart;
		if (location.kind !== 'Location' || location.index !== count - 1)
			throw Error('Deep location ordering mismatch');
		const staleRevision = String(BigInt(deep.revision) - 1n);
		const stalePage = await inventory.page(actor, { offset: count - 50 }, staleRevision);
		const staleLocation = await inventory.locate(actor, {}, deepEntry.id, staleRevision);
		if (stalePage.kind !== 'RevisionChanged' || staleLocation.kind !== 'RevisionChanged')
			throw Error('Expected coherent revision resets');

		const plans = [];
		for (const [label, input] of [
			['deep', { offset: count - 50 }],
			['populatedGroup', { group: even }]
		] as const) {
			statementPlans.clear();
			await inventory.page(actor, input);
			for (const statement of statementPlans.values()) {
				const plan = await pool.query(
					`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${statement.sql}`,
					statement.values
				);
				plans.push({ label, sql: statement.sql, plan: plan.rows[0]['QUERY PLAN'] });
			}
		}
		(evidence.levels as unknown[]).push({
			entries: count,
			inventoryId: actualInventoryId,
			accountId: actor.accountId,
			totals: first.totals,
			groups: first.groups,
			revision: first.revision,
			locateMs,
			queries,
			statementPlans: plans,
			deepPlan: plans.find((p) => p.label === 'deep' && p.sql.startsWith('SELECT c.*'))?.plan,
			deepLocation: location,
			stalePage,
			staleLocation
		});
	}
	evidence.statisticsSnapshot = (
		await pool.query(
			'SELECT relname,last_analyze,last_autoanalyze,n_live_tup,n_dead_tup FROM pg_stat_user_tables WHERE relname=ANY($1) ORDER BY relname',
			[['inventory_cards', 'inventory_groups', 'inventory_group_memberships', 'catalog_printings']]
		)
	).rows;
	evidence.postgres = (
		await pool.query(
			"SELECT version() AS version,(SELECT pg_collation_actual_version(oid) FROM pg_collation WHERE collname='inventory_root') AS icu_version"
		)
	).rows[0];

	await mkdir(directory, { recursive: true });
	if (!measureOnly)
		await writeFile(
			new URL('browser-credentials.json', directory),
			JSON.stringify(credentials, null, 2),
			{ mode: 0o600 }
		);
	await writeFile(
		new URL(
			process.argv.includes('--final')
				? 'query-scale-final.json'
				: analyze
					? 'query-scale-analyzed.json'
					: measureOnly
						? 'query-scale-remeasure.json'
						: 'query-scale.json',
			directory
		),
		JSON.stringify(evidence, null, 2)
	);
	console.log(
		'Scale fixtures and query evidence ready for 1000/10000/50000 distinct entries. Credentials stored in protected local reference.'
	);
} finally {
	await pool.end();
}
