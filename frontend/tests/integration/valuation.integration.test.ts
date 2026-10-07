import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createDatabase, createLocalAuth, createValuation } from '@spellbook/backend';
import type { AuthUser } from '@spellbook/contracts/auth.ts';
const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;
run('published exact references and private quantity coverage', () => {
	let database: ReturnType<typeof createDatabase>,
		auth: ReturnType<typeof createLocalAuth>,
		valuation: ReturnType<typeof createValuation>,
		actor: AuthUser;
	const nullPublication = randomUUID();
	const publication = randomUUID(),
		printing = randomUUID(),
		english = randomUUID(),
		oracle = randomUUID(),
		edition = randomUUID(),
		entry = randomUUID(),
		inventory = randomUUID();
	let previous: Record<string, unknown>,
		clock = new Date('2026-10-07T00:00:00Z');
	beforeAll(async () => {
		database = createDatabase(process.env.TEST_DATABASE_URL!);
		auth = createLocalAuth(database.db, { demoMode: false });
		valuation = createValuation(database.pool, auth, () => clock);
		const login = await auth.authenticate(
			'register',
			'price_' + randomUUID().slice(0, 8),
			'reference-test-password'
		);
		if (!login) throw Error('Auth fixture');
		actor = login.user;
		previous = (await database.pool.query('SELECT * FROM price_state WHERE id=1')).rows[0];
		await database.pool.query(
			`INSERT INTO price_publications(id,catalog_generation_id,descriptor,source_type,source_updated_at,payload_digest,extractor_version,mapping_version) VALUES($1,$2,'{"source":"Scryfall"}','all_cards','2026-10-07T00:00:00Z','fixture',1,1)`,
			[publication, randomUUID()]
		);
		for (const [id, lang] of [
			[printing, 'de'],
			[english, 'en']
		])
			await database.pool.query(
				`INSERT INTO price_printings(publication_id,id,oracle_id,set_id,set_code,collector_number,lang,finishes,variant_key,identity,links) VALUES($1,$2,$3,$4,'cmm','703',$5,ARRAY['nonfoil','foil'],'matched',jsonb_build_object('lang',$5::text),'[{"provider":"Cardmarket","url":"https://www.cardmarket.com/en/Magic/Products"}]')`,
				[publication, id, oracle, edition, lang]
			);
		await database.pool.query(
			`INSERT INTO price_observations(publication_id,printing_id,finish,measure,amount,supported,english_printing_id) VALUES($1,$2,'nonfoil','prices.eur',NULL,true,$3),($1,$3,'nonfoil','prices.eur',0.005,true,NULL),($1,$2,'foil','prices.eur_foil',0,true,NULL)`,
			[publication, printing, english]
		);
		await database.pool.query(
			'UPDATE price_state SET active_publication=$1,previous_publication=NULL,refresh_status=\'{"kind":"Succeeded"}\' WHERE id=1',
			[publication]
		);
		await database.pool.query(`INSERT INTO inventories(id,account_id,game) VALUES($1,$2,'mtg')`, [
			inventory,
			actor.accountId
		]);
		await database.pool.query(
			`INSERT INTO inventory_cards(id,inventory_id,account_id,game,catalog_card_id,canonical_card_id,name,set_code,image_uri,quantity,finish,condition,notes,spellbook_position) VALUES($1,$2,$3,'mtg',$4,$5,'Sol Ring','cmm','',3,'nonfoil','NM','',0)`,
			[entry, inventory, actor.accountId, printing, oracle]
		);
	});
	afterAll(async () => {
		await database.pool.query(
			'UPDATE price_state SET active_publication=$1,previous_publication=$2,refresh_status=$3 WHERE id=1',
			[previous.active_publication, previous.previous_publication, previous.refresh_status]
		);
		await database.pool.query('DELETE FROM price_publications WHERE id=ANY($1::uuid[])', [
			[publication, nullPublication]
		]);
		await database.pool.query('DELETE FROM user_profiles WHERE account_id=$1', [actor.accountId]);
		await database.pool.end();
	});
	it('returns exact known zero, marked fallback and trusted frozen evidence', async () => {
		const response = await valuation.printingReferences([
			{ printingId: printing, finish: 'nonfoil' },
			{ printingId: printing, finish: 'foil' }
		]);
		expect(response.results[0]).toMatchObject({
			kind: 'Known',
			amount: '0.005',
			provenance: 'EnglishFallback',
			matchedPrintingId: english,
			freshness: 'Fresh'
		});
		expect(response.results[1]).toMatchObject({ kind: 'Known', amount: '0', provenance: 'Exact' });
		const frozen = await valuation.freezePrintingReferences([
			{ printingId: printing, finish: 'nonfoil' }
		]);
		expect(frozen.evidence[0]).toMatchObject({
			publication: { id: publication },
			requestedIdentity: { lang: 'de' },
			matchedIdentity: { lang: 'en' }
		});
		const saved = structuredClone(frozen.evidence[0]);
		const responsePublication = frozen.response.publications[0];
		if (responsePublication.timePrecision === 'Instant')
			responsePublication.sourceTime = 'relabelled';
		else responsePublication.sourceDate = 'relabelled';
		frozen.response.results[0].links[0].url = 'https://evil.example';
		if (frozen.response.results[0].kind === 'Known') frozen.response.results[0].amount = '99';
		expect(frozen.evidence[0]).toEqual(saved);
	});
	it('evaluates every freshness boundary without changing original source time', async () => {
		for (const [instant, state] of [
			['2026-10-08T00:00:00Z', 'Fresh'],
			['2026-10-08T00:00:00.001Z', 'Stale'],
			['2026-10-14T00:00:00Z', 'Stale'],
			['2026-10-14T00:00:00.001Z', 'ReferenceExpired']
		]) {
			clock = new Date(instant);
			const r = (await valuation.printingReferences([{ printingId: printing, finish: 'foil' }]))
				.results[0];
			expect(r.kind === 'Known' ? r.freshness : r.reason).toBe(state);
		}
		clock = new Date('2026-10-07T00:00:00Z');
	});
	it('derives quantities from owned entries and ignores mutable actor DTO authority', async () => {
		const original = actor.accountId;
		actor.accountId = 'copied-account';
		const r = await valuation.inventoryReferences(actor, { entryIds: [entry] });
		actor.accountId = original;
		expect(r.coverage).toEqual({ coveredQuantity: 3, staleQuantity: 0, unknownQuantity: 0 });
		expect(r.results[0].quantity).toBe(3);
		await expect(
			valuation.inventoryReferences({ ...actor }, { entryIds: [entry] })
		).rejects.toMatchObject({ kind: 'Unauthenticated' });
		await expect(
			valuation.inventoryReferences(actor, { entryIds: [randomUUID()] })
		).rejects.toMatchObject({ kind: 'InventoryPriceNotFound' });
	});
	it('separates invalid stored printing identity from invalid request validation', async () => {
		try {
			await database.pool.query('UPDATE inventory_cards SET catalog_card_id=$1 WHERE id=$2', [
				'corrupt-storage',
				entry
			]);
			await expect(
				valuation.inventoryReferences(actor, { entryIds: [entry] })
			).rejects.toMatchObject({ kind: 'PriceReadUnavailable' });
			await expect(
				valuation.inventoryReferences(actor, { entryIds: ['invalid-request'] })
			).rejects.toMatchObject({ kind: 'ValidationFailed' });
		} finally {
			await database.pool.query('UPDATE inventory_cards SET catalog_card_id=$1 WHERE id=$2', [
				printing,
				entry
			]);
		}
	});
	it('treats corrupt oversized stored amounts as read failure even when expired', async () => {
		try {
			clock = new Date('2026-10-15T00:00:00Z');
			for (const amount of ['1'.repeat(129), '0.' + '1'.repeat(19)]) {
				await database.pool.query(
					"UPDATE price_observations SET amount=$1 WHERE publication_id=$2 AND printing_id=$3 AND finish='nonfoil'",
					[amount, publication, english]
				);
				await expect(
					valuation.printingReferences([{ printingId: printing, finish: 'nonfoil' }])
				).rejects.toMatchObject({ kind: 'PriceReadUnavailable' });
			}
		} finally {
			clock = new Date('2026-10-07T00:00:00Z');
			await database.pool.query(
				"UPDATE price_observations SET amount=0.005 WHERE publication_id=$1 AND printing_id=$2 AND finish='nonfoil'",
				[publication, english]
			);
		}
	});
	it('does not resurrect a same-source amount after successful null; links survive', async () => {
		await database.pool.query(
			'INSERT INTO price_publications SELECT $1,catalog_generation_id,descriptor,source_type,source_updated_at,payload_digest,extractor_version,mapping_version,ingested_at FROM price_publications WHERE id=$2',
			[nullPublication, publication]
		);
		await database.pool.query(
			'INSERT INTO price_printings SELECT $1,id,oracle_id,set_id,set_code,collector_number,lang,finishes,variant_key,identity,links FROM price_printings WHERE publication_id=$2',
			[nullPublication, publication]
		);
		await database.pool.query(
			'INSERT INTO price_observations SELECT $1,printing_id,finish,measure,NULL,raw_value,supported,english_printing_id,mapping_reason FROM price_observations WHERE publication_id=$2',
			[nullPublication, publication]
		);
		await database.pool.query(
			'UPDATE price_state SET active_publication=$1,previous_publication=$2 WHERE id=1',
			[nullPublication, publication]
		);
		const r = (await valuation.printingReferences([{ printingId: printing, finish: 'nonfoil' }]))
			.results[0];
		expect(r).toMatchObject({ kind: 'Unknown', reason: 'AmountMissing' });
		expect(r.links).toHaveLength(1);
	});
	it('rejects unsupported fields, invalid IDs and unbounded reads', async () => {
		await expect(
			valuation.printingReferences([{ printingId: printing, finish: 'etched' }])
		).rejects.toMatchObject({ kind: 'ValidationFailed' });
		await expect(
			valuation.inventoryReferences(actor, { entryIds: [entry], accountId: actor.accountId })
		).rejects.toMatchObject({ kind: 'ValidationFailed' });
		await expect(
			valuation.printingReferences(
				Array.from({ length: 101 }, () => ({ printingId: randomUUID(), finish: 'foil' }))
			)
		).rejects.toMatchObject({ kind: 'ValidationFailed' });
	});
});
