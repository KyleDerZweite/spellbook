import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCatalog } from '@spellbook/backend/catalog/search.ts';
import type { CardDocument } from '../../src/lib/search/types';
import { parseCatalogSearchRequest } from '../../src/lib/server/catalog/query';
import { parseArenaDecklist } from '../../src/lib/server/mtg/decklist';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;
run('PostgreSQL catalog snapshots and search', () => {
	let modules: Awaited<ReturnType<typeof loadModules>>;
	const schema = `catalog_test_${crypto.randomUUID().replaceAll('-', '')}`;
	const originalDatabaseUrl = process.env.DATABASE_URL;
	const originalTestDatabaseUrl = process.env.TEST_DATABASE_URL;
	const generation = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
	const staged = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
	const id = (suffix: number) => `11111111-1111-4111-8111-${String(suffix).padStart(12, '0')}`;
	const oracle = (suffix: number) => `22222222-2222-4222-8222-${String(suffix).padStart(12, '0')}`;
	const document = (
		printing: number,
		canonical: number,
		overrides: Partial<CardDocument>
	): CardDocument => ({
		id: id(printing),
		oracle_id: oracle(canonical),
		name: 'Llanowar Elves',
		normalized_name: 'llanowar elves',
		lang: 'en',
		released_at: '2018-04-27',
		layout: 'normal',
		mana_cost: '{G}',
		cmc: 1,
		type_line: 'Creature — Elf Druid',
		oracle_text: 'Add one green mana.',
		colors: ['G'],
		color_identity: ['G'],
		keywords: [],
		card_types: ['Creature'],
		rarity: 'common',
		set_code: 'dom',
		set_name: 'Dominaria',
		collector_number: '168',
		image_uri: '',
		image_uri_small: '',
		is_foil_available: true,
		is_nonfoil_available: true,
		legalities: { commander: 'legal', modern: 'legal', standard: 'not_legal' },
		...overrides
	});
	const documents = [
		document(1, 1, {}),
		document(2, 1, {
			lang: 'ja',
			printed_name: 'ラノワールのエルフ',
			oracle_text: '緑のマナを加える。'
		}),
		document(3, 1, {
			set_code: 'lea',
			set_name: 'Limited Edition Alpha',
			collector_number: '210',
			released_at: '1993-08-05'
		}),
		document(4, 2, {
			name: 'Fire // Ice',
			normalized_name: 'fire // ice',
			colors: ['U', 'R'],
			color_identity: ['U', 'R'],
			card_types: ['Instant'],
			set_code: 'tst',
			collector_number: '2'
		}),
		document(5, 3, {
			name: 'Sol Ring',
			normalized_name: 'sol ring',
			colors: [],
			color_identity: [],
			card_types: ['Artifact'],
			rarity: 'uncommon',
			set_code: 'tst',
			collector_number: '3'
		}),
		document(6, 4, {
			name: 'Swords to Plowshares',
			normalized_name: 'swords to plowshares',
			colors: ['W'],
			color_identity: ['W'],
			card_types: ['Instant'],
			rarity: 'uncommon',
			set_code: 'tst',
			collector_number: '4',
			legalities: { standard: 'legal', commander: 'legal' }
		})
	];
	const insertDocument = async (card: CardDocument, generationId = generation) => {
		await modules.pool.query(
			`INSERT INTO catalog_printings(generation_id,id,oracle_id,name,normalized_name,printed_name,lang,set_code,collector_number,rarity,cmc,colors,card_types,legalities,search_name,search_text,document) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
			[
				generationId,
				card.id,
				card.oracle_id,
				card.name,
				card.normalized_name,
				card.printed_name ?? '',
				card.lang,
				card.set_code,
				card.collector_number,
				card.rarity,
				card.cmc,
				card.colors,
				card.card_types,
				JSON.stringify(card.legalities),
				`${card.name} ${card.printed_name ?? ''}`.toLowerCase(),
				`${card.name} ${card.printed_name ?? ''} ${card.oracle_text} ${card.type_line}`.toLowerCase(),
				JSON.stringify(card)
			]
		);
	};
	beforeAll(async () => {
		const databaseUrl = new URL(process.env.TEST_DATABASE_URL!);
		databaseUrl.searchParams.set('options', `-csearch_path=${schema},public`);
		process.env.DATABASE_URL = databaseUrl.toString();
		process.env.TEST_DATABASE_URL = databaseUrl.toString();
		modules = await loadModules();
		await modules.pool.query(`CREATE SCHEMA ${schema}`);
		for (const table of ['catalog_generations', 'catalog_printings', 'catalog_state'])
			await modules.pool.query(
				`CREATE TABLE ${schema}.${table} (LIKE public.${table} INCLUDING ALL)`
			);
		await modules.pool.query('INSERT INTO catalog_state(id) VALUES(1)');
		for (const generationId of [generation, staged])
			await modules.pool.query(
				"INSERT INTO catalog_generations(id,source_type,source_updated_at,document_count,published_at) VALUES($1,'all_cards',now(),$2,now())",
				[generationId, documents.length]
			);
		for (const card of documents) await insertDocument(card);
		await modules.pool.query('UPDATE catalog_state SET active_generation=$1 WHERE id=1', [
			generation
		]);
	});
	// Tests publish mutable fixture rows; each case gets a fresh process-local Catalog owner.
	beforeEach(() => Object.assign(modules, createCatalog(modules.pool)));
	afterAll(async () => {
		try {
			if (modules) await modules.pool.query(`DROP SCHEMA ${schema} CASCADE`);
		} finally {
			await modules?.pool.end();
			if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
			else process.env.DATABASE_URL = originalDatabaseUrl;
			if (originalTestDatabaseUrl === undefined) delete process.env.TEST_DATABASE_URL;
			else process.env.TEST_DATABASE_URL = originalTestDatabaseUrl;
		}
	});

	const search = (body: unknown) => modules.searchCatalogRequest(parseCatalogSearchRequest(body));

	it('keeps direct printing reads at 1 through 100 after search expands to 500', async () => {
		const application = modules;
		expect((await application.getPrintings(oracle(1))).hits).toHaveLength(3);
		expect((await application.getPrintings(oracle(1), 100)).hits).toHaveLength(3);
		for (const limit of [0, 101, 500, 501])
			await expect(application.getPrintings(oracle(1), limit)).rejects.toThrow();
	});
	it('searches exact, prefix, typo, oracle text, and localized substrings', async () => {
		for (const query of ['Llanowar Elves', 'Llanow', 'Llanowr', 'ラノワール', 'エルフ']) {
			const result = await search({ query });
			expect(result.estimatedTotalHits).toBe(1);
			expect(result.hits[0].oracle_id).toBe(oracle(1));
		}
		expect((await search({ query: 'green mana' })).estimatedTotalHits).toBe(4);
		expect((await search({ query: 'ラノワール' })).hits[0].lang).toBe('ja');
	});
	it('matches complete CJK rules-text tokens without an unbounded substring fallback', async () => {
		expect((await search({ query: '緑のマナを加える' })).estimatedTotalHits).toBe(1);
		expect((await search({ query: 'マナ' })).estimatedTotalHits).toBe(0);
	});
	it('deduplicates after filtering and counts canonical cards per facet bucket', async () => {
		const result = await search({ facets: true });
		expect(result).toMatchObject({
			estimatedTotalHits: 4,
			generationId: generation,
			facets: {
				rarity: { common: 2, uncommon: 2 },
				colors: { G: 1, U: 1, R: 1, C: 1, W: 1 },
				set_code: { dom: 1, lea: 1, tst: 3 }
			}
		});
		expect(result.hits.find((card) => card.oracle_id === oracle(1))?.id).toBe(id(1));
		const subset = await search({ filters: { sets: ['LEA'] }, facets: true });
		expect(subset.estimatedTotalHits).toBe(1);
		expect(subset.hits[0].id).toBe(id(3));
		expect(subset.facets?.set_code).toEqual({ lea: 1 });
	});
	it('counts each Oracle once per bucket across duplicate colors and differing printing facets', async () => {
		const cards = [
			document(50, 50, { colors: ['G', 'G'], rarity: 'rare', set_code: 'fca' }),
			document(51, 50, { colors: ['G', 'R'], rarity: 'mythic', set_code: 'fcb' }),
			document(52, 50, { colors: [], rarity: 'rare', set_code: 'fca' }),
			document(53, 51, { colors: ['R'], rarity: 'rare', set_code: 'fcb' })
		];
		try {
			for (const card of cards) await insertDocument(card);
			for (const pagination of [{ limit: 0 }, { limit: 1, offset: 1 }]) {
				const result = await search({
					...pagination,
					filters: { sets: ['fca', 'fcb'] },
					facets: true
				});
				expect(result).toMatchObject({
					estimatedTotalHits: 2,
					generationId: generation,
					facets: {
						colors: { G: 1, R: 2, C: 1 },
						rarity: { rare: 2, mythic: 1 },
						set_code: { fca: 1, fcb: 2 }
					}
				});
			}
			expect((await search({ filters: { sets: ['fca'] }, facets: true })).facets).toEqual({
				colors: { G: 1, C: 1 },
				rarity: { rare: 1 },
				set_code: { fca: 1 }
			});
		} finally {
			await modules.pool.query('DELETE FROM catalog_printings WHERE id=ANY($1::uuid[])', [
				cards.map((card) => card.id)
			]);
		}
	});
	it('reuses only complete unfiltered facets and isolates returned DTO mutation', async () => {
		const reads = vi.spyOn(modules.pool, 'query');
		try {
			const first = await search({ facets: true, limit: 1 });
			first.facets!.colors.G = 999;
			const warm = await search({ facets: true, limit: 0, filters: { sets: [] } });
			expect(warm.facets?.colors.G).toBe(1);
			expect((await search({ facets: true, offset: 1, limit: 1 })).facets).toEqual(warm.facets);
			const facetReads = () =>
				reads.mock.calls.filter(([sql]) => typeof sql === 'string' && sql.includes("'colors',"))
					.length;
			expect(facetReads()).toBe(1);
			await search({ query: 'Llanowar', facets: true });
			await search({ filters: { sets: ['lea'] }, facets: true });
			expect(facetReads()).toBe(3);
		} finally {
			reads.mockRestore();
		}
	});
	it('replaces memoized facets on publication and never reuses empty or unpublished generations', async () => {
		await search({ facets: true });
		await insertDocument(
			document(60, 60, { colors: ['B'], set_code: 'stg', rarity: 'rare' }),
			staged
		);
		try {
			await modules.pool.query('UPDATE catalog_state SET active_generation=$1 WHERE id=1', [
				staged
			]);
			expect(await search({ facets: true })).toMatchObject({
				generationId: staged,
				estimatedTotalHits: 1,
				facets: { colors: { B: 1 }, rarity: { rare: 1 }, set_code: { stg: 1 } }
			});
			await modules.pool.query('UPDATE catalog_state SET active_generation=NULL WHERE id=1');
			expect(await search({ facets: true })).toMatchObject({
				generationId: null,
				estimatedTotalHits: 0,
				facets: { colors: {}, rarity: {}, set_code: {} }
			});
			await modules.pool.query('DELETE FROM catalog_printings WHERE generation_id=$1', [staged]);
			await modules.pool.query('UPDATE catalog_state SET active_generation=$1 WHERE id=1', [
				staged
			]);
			expect(await search({ facets: true })).toMatchObject({
				generationId: staged,
				estimatedTotalHits: 0,
				facets: { colors: {}, rarity: {}, set_code: {} }
			});
			await insertDocument(
				document(60, 60, { colors: ['B'], set_code: 'stg', rarity: 'rare' }),
				staged
			);
			expect((await search({ facets: true })).facets?.colors).toEqual({ B: 1 });
		} finally {
			await modules.pool.query('UPDATE catalog_state SET active_generation=$1 WHERE id=1', [
				generation
			]);
			await modules.pool.query('DELETE FROM catalog_printings WHERE generation_id=$1', [staged]);
		}
	});
	it('keeps a held old publication coherent without replacing a newer facet memo', async () => {
		await insertDocument(document(61, 61, { colors: ['B'], set_code: 'stg' }), staged);
		let captured!: () => void;
		let release!: () => void;
		const arrived = new Promise<void>((resolve) => {
			captured = resolve;
		});
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		const query = modules.pool.query.bind(modules.pool);
		const reads = vi.spyOn(modules.pool, 'query').mockImplementationOnce(async (sql, values) => {
			if (typeof sql !== 'string' || !Array.isArray(values)) throw Error('Expected Catalog SQL');
			const result = await query(sql, values);
			captured();
			await held;
			return result;
		});
		try {
			const oldRead = search({ facets: true });
			await arrived;
			await modules.pool.query('UPDATE catalog_state SET active_generation=$1 WHERE id=1', [
				staged
			]);
			const current = await search({ facets: true });
			expect(current).toMatchObject({
				generationId: staged,
				estimatedTotalHits: 1,
				facets: { colors: { B: 1 } }
			});
			release();
			expect(await oldRead).toMatchObject({
				generationId: generation,
				estimatedTotalHits: 4,
				facets: { colors: { G: 1, U: 1, R: 1, C: 1, W: 1 } }
			});
			expect((await search({ facets: true, limit: 0 })).facets).toEqual(current.facets);
			expect(
				reads.mock.calls.filter(([sql]) => typeof sql === 'string' && sql.includes("'colors',"))
			).toHaveLength(2);
			const nextArrived = new Promise<void>((resolve) => {
				captured = resolve;
			});
			const nextHeld = new Promise<void>((resolve) => {
				release = resolve;
			});
			reads.mockImplementationOnce(async (sql, values) => {
				if (typeof sql !== 'string' || !Array.isArray(values)) throw Error('Expected Catalog SQL');
				const result = await query(sql, values);
				captured();
				await nextHeld;
				return result;
			});
			const warmRead = search({ facets: true });
			await nextArrived;
			await modules.pool.query('UPDATE catalog_state SET active_generation=$1 WHERE id=1', [
				generation
			]);
			release();
			expect(await warmRead).toMatchObject({
				generationId: staged,
				estimatedTotalHits: 1,
				facets: current.facets
			});
			expect(await search({ facets: true })).toMatchObject({
				generationId: generation,
				estimatedTotalHits: 4,
				facets: { colors: { G: 1, U: 1, R: 1, C: 1, W: 1 } }
			});
			expect(
				reads.mock.calls.filter(([sql]) => typeof sql === 'string' && sql.includes("'colors',"))
			).toHaveLength(3);
		} finally {
			release();
			reads.mockRestore();
			await modules.pool.query('UPDATE catalog_state SET active_generation=$1 WHERE id=1', [
				generation
			]);
			await modules.pool.query('DELETE FROM catalog_printings WHERE generation_id=$1', [staged]);
		}
	});
	it('implements color subsets and OR within filter groups with AND between groups', async () => {
		expect((await search({ filters: { colors: ['U'] } })).estimatedTotalHits).toBe(0);
		expect(
			(await search({ filters: { colors: ['U', 'R'] } })).hits.map((card) => card.name)
		).toEqual(['Fire // Ice']);
		expect(
			(await search({ filters: { colors: ['W', 'C'] } })).hits.map((card) => card.name)
		).toEqual(['Sol Ring', 'Swords to Plowshares']);
		expect(
			(
				await search({
					filters: {
						types: ['Creature', 'Artifact'],
						rarities: ['uncommon'],
						legalities: ['standard', 'commander']
					}
				})
			).hits.map((card) => card.name)
		).toEqual(['Sol Ring']);
	});
	it('resolves requested set names in one batch independently of owned printing IDs', async () => {
		await expect(modules.getCatalogPrinting(id(999))).rejects.toThrow('Catalog printing not found');
		expect(await modules.getCatalogSetNames([' DOM ', 'dom', 'LEA', 'missing'])).toEqual({
			dom: 'Dominaria',
			lea: 'Limited Edition Alpha'
		});
		expect(await modules.getCatalogSetNames([])).toEqual({});
	});
	it('omits missing and blank set names while using another printing with a usable name', async () => {
		const cards = [
			document(30, 30, { set_code: 'blank', set_name: '   ' }),
			document(31, 31, { set_code: 'mixed', set_name: '' }),
			document(32, 32, { set_code: 'mixed', set_name: '  Test Set  ' })
		];
		try {
			for (const card of cards) await insertDocument(card);
			expect(await modules.getCatalogSetNames(['blank', 'mixed', 'absent'])).toEqual({
				mixed: 'Test Set'
			});
		} finally {
			await modules.pool.query('DELETE FROM catalog_printings WHERE id=ANY($1::uuid[])', [
				cards.map((card) => card.id)
			]);
		}
	});
	it('loads set names only from the active generation and follows publication changes', async () => {
		await insertDocument(document(1, 1, { set_name: 'Published Dominaria' }), staged);
		try {
			expect(await modules.getCatalogSetNames(['dom'])).toEqual({ dom: 'Dominaria' });
			await modules.pool.query('UPDATE catalog_state SET active_generation=$1 WHERE id=1', [
				staged
			]);
			expect(await modules.getCatalogSetNames(['dom', 'lea'])).toEqual({
				dom: 'Published Dominaria'
			});
		} finally {
			await modules.pool.query('UPDATE catalog_state SET active_generation=$1 WHERE id=1', [
				generation
			]);
			await modules.pool.query('DELETE FROM catalog_printings WHERE generation_id=$1', [staged]);
		}
	});
	it('fits identity subsets into a red-green palette including colorless cards', async () => {
		const cards = [
			document(20, 20, { name: 'Lightning Bolt', colors: ['R'], color_identity: ['R'] }),
			document(21, 21, {
				name: 'Burning-Tree Emissary',
				mana_cost: '{R/G}{R/G}',
				colors: ['R', 'G'],
				color_identity: ['R', 'G']
			}),
			document(22, 22, {
				name: 'Gruul Signet',
				colors: [],
				color_identity: ['R', 'G'],
				card_types: ['Artifact'],
				oracle_text: '{1}, {T}: Add {R}{G}.'
			}),
			document(23, 23, {
				name: 'Elves of Deep Shadow',
				colors: ['G'],
				color_identity: ['B', 'G'],
				oracle_text: '{T}: Add {B}. This creature deals 1 damage to you.'
			}),
			document(24, 24, {
				name: 'Azorius Signet',
				colors: [],
				color_identity: ['W', 'U'],
				card_types: ['Artifact'],
				oracle_text: '{1}, {T}: Add {W}{U}.'
			})
		];
		const names = async (filters: unknown) =>
			(await search({ filters })).hits.map((card) => card.name);
		try {
			for (const card of cards) await insertDocument(card);
			const palette = ['R', 'G'];
			const expected = [
				'Burning-Tree Emissary',
				'Gruul Signet',
				'Lightning Bolt',
				'Llanowar Elves',
				'Sol Ring'
			];
			expect(await names({ colorIdentity: palette })).toEqual(expected);
			expect(await names({ colorIdentity: ['G', 'R', 'C'] })).toEqual(expected);
			expect(await names({ colorIdentity: ['C'] })).toEqual(['Sol Ring']);
			expect(await names({ colorIdentity: ['G'] })).toEqual(['Llanowar Elves', 'Sol Ring']);
			expect(await names({ colorIdentity: [] })).toEqual(await names({}));
			expect(await names({ colors: ['G'], colorIdentity: palette })).toEqual(['Llanowar Elves']);
			expect(await names({ colors: ['G'] })).toEqual(['Elves of Deep Shadow', 'Llanowar Elves']);
			expect(await names({ colors: ['C'] })).toEqual([
				'Azorius Signet',
				'Gruul Signet',
				'Sol Ring'
			]);
			const result = await search({ filters: { colorIdentity: palette }, facets: true, limit: 2 });
			expect(result).toMatchObject({
				estimatedTotalHits: 5,
				generationId: generation,
				facets: { colors: { R: 2, G: 2, C: 2 } }
			});
			expect(result.hits.map((card) => card.name)).toEqual(expected.slice(0, 2));
			expect(
				(await search({ filters: { colorIdentity: palette }, offset: 2 })).hits.map(
					(card) => card.name
				)
			).toEqual(expected.slice(2));
			expect(
				(await search({ query: 'Elves of Deep Shadow', filters: { colorIdentity: palette } })).hits
			).toEqual([]);
		} finally {
			await modules.pool.query('DELETE FROM catalog_printings WHERE id=ANY($1::uuid[])', [
				cards.map((card) => card.id)
			]);
		}
	});

	it('projects every MTG identity subset without accepting unknown or missing identities', async () => {
		const colors = ['W', 'U', 'B', 'R', 'G'];
		const palette = (mask: number) => colors.filter((_, index) => mask & (1 << index));
		const identities: unknown[] = [
			...Array.from({ length: 32 }, (_, mask) => palette(mask)),
			['R', 'R'],
			['X'],
			['R', 'X'],
			'G',
			{},
			null,
			42
		];
		const cards = [...identities, undefined].map((identity, index) => {
			const card: Record<string, unknown> = {
				...document(8000 + index, 8000 + index, { set_code: 'masktest' })
			};
			if (identity === undefined) delete card.color_identity;
			else card.color_identity = identity;
			return card;
		});
		await modules.pool.query(
			`INSERT INTO catalog_printings(generation_id,id,oracle_id,name,normalized_name,printed_name,lang,set_code,collector_number,rarity,cmc,colors,card_types,legalities,search_name,search_text,document)
			SELECT $1,(d->>'id')::uuid,(d->>'oracle_id')::uuid,d->>'name',d->>'normalized_name','',d->>'lang',d->>'set_code',d->>'collector_number',d->>'rarity',(d->>'cmc')::float8,ARRAY['G'],ARRAY['Creature'],d->'legalities',lower(d->>'name'),lower(d->>'name'),d
			FROM jsonb_array_elements($2::jsonb) AS d`,
			[generation, JSON.stringify(cards)]
		);
		try {
			const masks = await modules.pool.query<{ id: string; color_identity_mask: number | null }>(
				"SELECT id,color_identity_mask FROM catalog_printings WHERE set_code='masktest' ORDER BY id"
			);
			expect(masks.rows.map((row) => row.color_identity_mask)).toEqual([
				...Array.from({ length: 32 }, (_, mask) => mask),
				8,
				null,
				null,
				16,
				null,
				null,
				null,
				null
			]);
			for (let mask = 0; mask < 32; mask++) {
				const selected = palette(mask);
				const expected = await modules.pool.query<{ id: string }>(
					"SELECT id FROM catalog_printings WHERE set_code='masktest' AND document->'color_identity' <@ $1::jsonb ORDER BY id",
					[JSON.stringify(selected)]
				);
				const result = await search({
					filters: { sets: ['masktest'], colorIdentity: selected.length ? selected : ['C'] },
					limit: 100,
					facets: true
				});
				expect(result.hits.map((card) => card.id).sort()).toEqual(
					expected.rows.map((row) => row.id)
				);
				expect(result.estimatedTotalHits).toBe(expected.rows.length);
				expect(result.facets?.set_code.masktest ?? 0).toBe(expected.rows.length);
			}
		} finally {
			await modules.pool.query("DELETE FROM catalog_printings WHERE set_code='masktest'");
		}
	});
	it('derives identity masks for a new publication without changing its printing writer', async () => {
		const card = document(9000, 9000, { name: 'Published Identity', color_identity: ['R', 'G'] });
		await insertDocument(card, staged);
		try {
			expect(
				(
					await modules.pool.query(
						'SELECT color_identity_mask FROM catalog_printings WHERE generation_id=$1 AND id=$2',
						[staged, card.id]
					)
				).rows[0].color_identity_mask
			).toBe(24);
			await modules.pool.query('UPDATE catalog_state SET active_generation=$1 WHERE id=1', [
				staged
			]);
			expect(await search({ filters: { colorIdentity: ['R', 'G'] }, facets: true })).toMatchObject({
				generationId: staged,
				estimatedTotalHits: 1,
				hits: [card],
				facets: { colors: { G: 1 } }
			});
			expect((await search({ filters: { colorIdentity: ['R'] } })).estimatedTotalHits).toBe(0);
		} finally {
			await modules.pool.query('UPDATE catalog_state SET active_generation=$1 WHERE id=1', [
				generation
			]);
			await modules.pool.query('DELETE FROM catalog_printings WHERE generation_id=$1 AND id=$2', [
				staged,
				card.id
			]);
		}
	});
	it('does not repeatedly scan all canonical names for a broad identity filter', async () => {
		const count = 1200;
		await modules.pool.query(
			`INSERT INTO catalog_printings(generation_id,id,oracle_id,name,normalized_name,printed_name,lang,set_code,collector_number,rarity,cmc,colors,card_types,legalities,search_name,search_text,document)
			SELECT generation_id,md5('broad-printing-' || n)::uuid,md5('broad-oracle-' || n)::uuid,
			'Broad ' || n,'broad ' || n,'',lang,'broad',n::text,rarity,cmc,colors,card_types,legalities,'broad ' || n,'broad ' || n,
			document || jsonb_build_object('id',md5('broad-printing-' || n)::uuid,'oracle_id',md5('broad-oracle-' || n)::uuid,'name','Broad ' || n,'set_code','broad')
			FROM catalog_printings CROSS JOIN generate_series(1,$2::int) AS n WHERE id=$1::uuid`,
			[id(1), count]
		);
		const reads = vi.spyOn(modules.pool, 'query');
		try {
			const result = await search({ filters: { colorIdentity: ['G'] }, limit: 20 });
			expect(result.estimatedTotalHits).toBe(count + 2);
			const [statement, parameters] = reads.mock.calls[0];
			reads.mockRestore();
			const plan = await modules.pool.query(
				'EXPLAIN (ANALYZE, FORMAT JSON) ' + statement,
				parameters
			);
			type Plan = { 'CTE Name'?: string; 'Actual Loops': number; Plans?: Plan[] };
			const visits = (node: Plan): Plan[] => [node, ...(node.Plans ?? []).flatMap(visits)];
			const names = visits(plan.rows[0]['QUERY PLAN'][0].Plan).filter(
				(node) => node['CTE Name'] === 'names'
			);
			expect(names.length).toBeGreaterThan(0);
			// Bound repeated work rather than wall-clock time on different CI machines.
			expect(names.every((node) => node['Actual Loops'] <= 1)).toBe(true);
		} finally {
			reads.mockRestore();
			await modules.pool.query("DELETE FROM catalog_printings WHERE set_code='broad'");
		}
	});
	it('orders by the chosen printing even when one oracle has different matching names', async () => {
		const cards = [
			document(40, 40, { name: 'Alpha', released_at: '2020-01-01', set_code: 'old' }),
			document(41, 40, { name: 'Zulu', released_at: '2024-01-01', set_code: 'new' }),
			document(42, 40, {
				name: 'Aardvark',
				lang: 'ja',
				released_at: '2026-01-01',
				set_code: 'foreign'
			}),
			document(43, 41, { name: 'Equal Release', released_at: '2024-01-01' }),
			document(44, 41, { name: 'Equal Release', released_at: '2024-01-01' })
		];
		try {
			for (const card of cards) await insertDocument(card);
			const descending = await search({ limit: 1, sort: 'name:desc', facets: true });
			expect(descending.hits.map((card) => card.id)).toEqual([id(41)]);
			expect(descending.estimatedTotalHits).toBe(6);
			expect(descending.facets?.set_code).toMatchObject({ old: 1, new: 1, foreign: 1 });
			expect((await search({ limit: 1, offset: 5 })).hits.map((card) => card.id)).toEqual([id(41)]);
			expect((await search({ query: 'Equal Release' })).hits[0].id).toBe(id(43));
			expect((await search({ filters: { sets: ['old'] } })).hits[0].id).toBe(id(40));
			expect((await search({ filters: { sets: ['foreign'] } })).hits[0].id).toBe(id(42));
			expect(await search({ limit: 0, facets: true })).toMatchObject({
				hits: [],
				estimatedTotalHits: 6,
				facets: { set_code: { old: 1, new: 1, foreign: 1 } }
			});
		} finally {
			await modules.pool.query('DELETE FROM catalog_printings WHERE id=ANY($1::uuid[])', [
				cards.map((card) => card.id)
			]);
		}
	});
	it('keeps exact localized relevance ahead of English preference and newer dates', async () => {
		const cards = [
			document(45, 42, { name: 'Exact Alias Variant', released_at: '2026-01-01' }),
			document(46, 42, {
				name: 'Localized Alias',
				printed_name: 'Exact Alias',
				lang: 'ja',
				released_at: '2020-01-01'
			})
		];
		try {
			for (const card of cards) await insertDocument(card);
			expect((await search({ query: 'Exact Alias' })).hits[0].id).toBe(id(46));
			expect((await search({ query: 'Exact Alias', sort: 'name:desc' })).hits[0].id).toBe(id(46));
		} finally {
			await modules.pool.query('DELETE FROM catalog_printings WHERE id=ANY($1::uuid[])', [
				cards.map((card) => card.id)
			]);
		}
	});
	it('returns stable pagination, complete counts, and query-scoped facets', async () => {
		expect((await search({ limit: 1, offset: 1 })).hits[0].name).toBe('Llanowar Elves');
		expect((await search({ limit: 1, sort: 'name:desc' })).hits[0].name).toBe(
			'Swords to Plowshares'
		);
		expect(await search({ query: 'Llanowar', limit: 0, facets: true })).toMatchObject({
			hits: [],
			estimatedTotalHits: 1,
			facets: { rarity: { common: 1 } }
		});
		expect((await search({ query: '%_' })).estimatedTotalHits).toBe(0);
	});
	it('preserves printing IDs, languages, and exact import ambiguity', async () => {
		const printings = await modules.getPrintings(oracle(1), 2, 0);
		expect(printings).toMatchObject({ estimatedTotalHits: 3, generationId: generation });
		expect(printings.hits.map((card) => card.id)).toEqual([id(1), id(2)]);
		expect((await modules.getPrintings(oracle(1), 2, 2)).hits.map((card) => card.id)).toEqual([
			id(3)
		]);
		expect((await modules.getCatalogPrinting(id(2))).lang).toBe('ja');
		expect(
			await modules.resolveCatalogCandidates(
				parseArenaDecklist('1 Llanowar Elves (DOM) 168').lines[0]
			)
		).toHaveLength(2);
		expect(
			(await modules.resolveCatalogCandidates(parseArenaDecklist('1 Llanowar Elves').lines[0])).map(
				(card) => card.id
			)
		).toEqual([id(1)]);
		expect(
			(
				await modules.resolveCatalogCandidates(
					parseArenaDecklist('1 ラノワールのエルフ (DOM) 168').lines[0]
				)
			).map((card) => card.id)
		).toEqual([id(2)]);
		await expect(modules.getCatalogPrinting('../invalid')).rejects.toThrow(
			'Invalid catalog card ID'
		);
	});
	it('resolves exact split, adventure, and transforming face aliases without fuzzy imports', async () => {
		const cards = [
			document(7, 5, {
				name: 'Bonecrusher Giant // Stomp',
				normalized_name: 'bonecrusher giant // stomp',
				set_code: 'eld',
				collector_number: '115'
			}),
			document(8, 5, {
				name: 'Bonecrusher Giant // Stomp',
				normalized_name: 'bonecrusher giant // stomp',
				printed_name: '骨砕きの巨人 // 踏みつけ',
				lang: 'ja',
				set_code: 'eld',
				collector_number: '115'
			}),
			document(9, 6, {
				name: 'Delver of Secrets // Insectile Aberration',
				normalized_name: 'delver of secrets // insectile aberration',
				set_code: 'isd',
				collector_number: '51'
			})
		];
		const resolve = async (line: string) =>
			(await modules.resolveCatalogCandidates(parseArenaDecklist(line).lines[0])).map(
				(card) => card.id
			);
		try {
			for (const card of cards) await insertDocument(card);
			for (const name of ['Fire', 'Ice', 'Fire//Ice'])
				expect(await resolve(`1 ${name}`)).toEqual([id(4)]);
			for (const name of ['Bonecrusher Giant', 'Stomp', 'Bonecrusher Giant // Stomp'])
				expect(await resolve(`4 ${name}`)).toEqual([id(7)]);
			expect(await resolve('4 Bonecrusher Giant (ELD) 115')).toEqual([id(7), id(8)]);
			expect(await resolve('4 Stomp (ELD)')).toEqual([id(7), id(8)]);
			expect(await resolve('4 骨砕きの巨人 (ELD) 115')).toEqual([id(8)]);
			expect(await resolve('4 踏みつけ')).toEqual([id(8)]);
			for (const name of ['Delver of Secrets', 'Insectile Aberration'])
				expect(await resolve(`4 ${name} (ISD) 51`)).toEqual([id(9)]);
			for (const line of ['1 Bonecrusher', '1 Bonecrushr Giant', '1 Ice (ELD) 115'])
				expect(await resolve(line)).toEqual([]);
			// A face shared by different canonical cards remains ambiguous.
			await insertDocument(document(10, 7, { name: 'Ice', normalized_name: 'ice' }));
			expect(await resolve('1 Ice')).toEqual([id(4), id(10)]);
		} finally {
			await modules.pool.query('DELETE FROM catalog_printings WHERE id=ANY($1::uuid[])', [
				[...cards.map((card) => card.id), id(10)]
			]);
		}
	});
	it('ignores unpublished generations and preserves the previous snapshot on failed publication', async () => {
		const client = await modules.pool.connect();
		try {
			await client.query('BEGIN');
			await client.query(
				'UPDATE catalog_state SET active_generation=$1,previous_generation=$2 WHERE id=1',
				[staged, generation]
			);
			expect((await search({})).generationId).toBe(generation);
			await client.query('ROLLBACK');
		} finally {
			client.release();
		}
		expect(await search({})).toMatchObject({ generationId: generation, estimatedTotalHits: 4 });
	});
	it('returns an empty catalog with explicit generation identity before publication', async () => {
		await modules.pool.query('UPDATE catalog_state SET active_generation=NULL WHERE id=1');
		try {
			expect(await modules.getCatalogSetNames(['dom', 'lea'])).toEqual({});
			expect(await search({ facets: true })).toMatchObject({
				generationId: null,
				hits: [],
				estimatedTotalHits: 0,
				facets: { colors: {}, rarity: {}, set_code: {} }
			});
		} finally {
			await modules.pool.query('UPDATE catalog_state SET active_generation=$1 WHERE id=1', [
				generation
			]);
		}
	});
});

async function loadModules() {
	const [{ pool }, search] = await Promise.all([
		import('../../src/lib/server/db/client'),
		import('../../src/lib/server/catalog/search')
	]);
	return { pool, ...search };
}
