import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createDatabase, createLocalAuth, createValuation } from '@spellbook/backend';
const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;
run('configured source priority and explicit Day precision', () => {
	let database: ReturnType<typeof createDatabase>, valuation: ReturnType<typeof createValuation>;
	let original: Record<string, unknown>, optional: Record<string, unknown>[];
	let clock = new Date('2026-10-07T00:00:00Z');
	const printing = randomUUID(),
		baseline = randomUUID(),
		cardmarket = randomUUID(),
		mtgjson = randomUUID();
	beforeAll(async () => {
		database = createDatabase(process.env.TEST_DATABASE_URL!);
		valuation = createValuation(
			database.pool,
			createLocalAuth(database.db, { demoMode: false }),
			() => clock
		);
		original = (await database.pool.query('SELECT * FROM price_state WHERE id=1')).rows[0];
		optional = (await database.pool.query('SELECT * FROM optional_price_state')).rows;
		await database.pool.query(
			`INSERT INTO price_publications(id,catalog_generation_id,descriptor,source_type,source_updated_at,payload_digest,extractor_version,mapping_version) VALUES($1,$2,'{}','all_cards','2026-10-07T00:00:00Z','fixture',3,1)`,
			[baseline, randomUUID()]
		);
		await database.pool.query(
			`INSERT INTO price_printings(publication_id,id,oracle_id,set_id,set_code,collector_number,lang,finishes,identity,links) VALUES($1,$2,$3,$4,'cmm','703','en',ARRAY['nonfoil'],'{"lang":"en"}','[]')`,
			[baseline, printing, randomUUID(), randomUUID()]
		);
		await database.pool.query(
			`INSERT INTO price_observations(publication_id,printing_id,finish,measure,amount,supported) VALUES($1,$2,'nonfoil','prices.eur',2,true)`,
			[baseline, printing]
		);
		await database.pool.query('UPDATE price_state SET active_publication=$1 WHERE id=1', [
			baseline
		]);
		for (const [id, source, precision, instant, day, measure, amount] of [
			[cardmarket, 'Cardmarket', 'Instant', '2026-10-07T00:00:00Z', null, 'trend', '1.01'],
			[mtgjson, 'MTGJSON', 'Day', null, '2026-10-06', 'paper.cardmarket.retail.normal', '0']
		]) {
			await database.pool.query(
				`INSERT INTO optional_price_publications(id,source,time_precision,source_instant,source_date,descriptor,payload_digest,extractor_version,mapping_version) VALUES($1,$2,$3,$4,$5,'{}','fixture',1,1)`,
				[id, source, precision, instant, day]
			);
			await database.pool.query(
				`INSERT INTO optional_price_printings(publication_id,printing_id,identity,finishes) VALUES($1,$2,'{"lang":"en"}',ARRAY['nonfoil'])`,
				[id, printing]
			);
			await database.pool.query(
				`INSERT INTO optional_price_observations(publication_id,printing_id,finish,measure,amount,supported,provider_id) VALUES($1,$2,'nonfoil',$3,$4,true,$5)`,
				[id, printing, measure, amount, source === 'Cardmarket' ? '7' : randomUUID()]
			);
			await database.pool.query(
				`UPDATE optional_price_state SET enabled=true,active_publication=$1,refresh_status='{"kind":"Succeeded"}' WHERE source=$2`,
				[id, source]
			);
		}
	});
	afterAll(async () => {
		if (!database) return;
		await database.pool.query(
			'UPDATE price_state SET active_publication=$1,previous_publication=$2,refresh_status=$3 WHERE id=1',
			[original.active_publication, original.previous_publication, original.refresh_status]
		);
		for (const state of optional)
			await database.pool.query(
				'UPDATE optional_price_state SET enabled=$1,active_publication=$2,previous_publication=$3,refresh_status=$4 WHERE source=$5',
				[
					state.enabled,
					state.active_publication,
					state.previous_publication,
					state.refresh_status,
					state.source
				]
			);
		await database.pool.query('DELETE FROM optional_price_publications WHERE id=ANY($1::uuid[])', [
			[cardmarket, mtgjson]
		]);
		await database.pool.query('DELETE FROM price_publications WHERE id=$1', [baseline]);
		await database.pool.end();
	});
	it('prefers fresh Cardmarket, then fresh Scryfall over stale Cardmarket', async () => {
		const read = () => valuation.printingReferences([{ printingId: printing, finish: 'nonfoil' }]);
		expect((await read()).results[0]).toMatchObject({
			kind: 'Known',
			source: 'Cardmarket',
			amount: '1.01',
			freshness: 'Fresh',
			upstream: 'Cardmarket'
		});
		await database.pool.query(
			`UPDATE optional_price_publications SET source_instant='2026-10-05T00:00:00Z' WHERE id=$1`,
			[cardmarket]
		);
		expect((await read()).results[0]).toMatchObject({
			kind: 'Known',
			source: 'Scryfall',
			amount: '2',
			freshness: 'Fresh'
		});
	});
	it('retains Day precision and known zero at the inclusive freshness boundaries', async () => {
		await database.pool.query('UPDATE optional_price_state SET enabled=false WHERE source=$1', [
			'Cardmarket'
		]);
		await database.pool.query('UPDATE price_state SET active_publication=NULL WHERE id=1');
		const read = () => valuation.printingReferences([{ printingId: printing, finish: 'nonfoil' }]);
		expect((await read()).results[0]).toMatchObject({
			kind: 'Known',
			source: 'MTGJSON',
			amount: '0',
			timePrecision: 'Day',
			sourceDate: '2026-10-06',
			freshness: 'Fresh',
			freshnessPolicy: 'day-upper-bound-utc-start-v1',
			asOf: '2026-10-07T00:00:00.000Z'
		});
		expect((await read()).results[0]).not.toHaveProperty('sourceTime');
		clock = new Date('2026-10-07T00:00:00.001Z');
		expect((await read()).results[0]).toMatchObject({ freshness: 'Stale' });
		clock = new Date('2026-10-13T00:00:00Z');
		expect((await read()).results[0]).toMatchObject({ kind: 'Known', freshness: 'Stale' });
		clock = new Date('2026-10-13T00:00:00.001Z');
		expect((await read()).results[0]).toMatchObject({
			kind: 'Unknown',
			reason: 'ReferenceExpired'
		});
	});
	it('windows actual source dates, preserves gaps and separates AllPrices history from current Today', async () => {
		clock = new Date('2026-10-07T12:00:00Z');
		await database.pool.query('UPDATE price_state SET active_publication=$1 WHERE id=1', [
			baseline
		]);
		const providerId = randomUUID();
		const evidence = {
			publication: {
				source: 'MTGJSON',
				descriptor: { sourceDate: '2026-10-06', history: { digest: 'history-fixture' } },
				publicationId: mtgjson,
				payloadDigest: 'today-fixture',
				extractorVersion: 1,
				mappingVersion: 1,
				ingestedAt: '2026-10-07T00:00:00Z',
				pointArtifact: 'AllPrices',
				pointPayloadDigest: 'history-fixture'
			},
			identity: { lang: 'en' },
			providerId
		};
		try {
			await database.pool.query("INSERT INTO price_history_publications VALUES($1,'MTGJSON',$2)", [
				mtgjson,
				evidence.publication
			]);
			await database.pool.query('INSERT INTO price_history_printings VALUES($1,$2,$3,NULL)', [
				mtgjson,
				printing,
				evidence.identity
			]);
			for (const [day, amount] of [
				['2026-10-01', '7'],
				['2026-10-05', '0'],
				['2026-10-07', '1.234567890123456789']
			])
				await database.pool.query(
					`INSERT INTO price_source_history(source,printing_id,finish,day,time_precision,amount,measure,provider_id,publication_id,evidence) VALUES('MTGJSON',$1,'nonfoil',$2,'Day',$3,'paper.cardmarket.retail.normal',$4,$5,$6)`,
					[printing, day, amount, providerId, mtgjson, evidence]
				);
			const result = await valuation.printingHistory({
				printingId: printing,
				finish: 'nonfoil',
				days: 3,
				sources: ['MTGJSON']
			});
			expect(result.window).toEqual({ from: '2026-10-05', to: '2026-10-07', days: 3 });
			expect(result.points.map((point) => [point.day, point.amount])).toEqual([
				['2026-10-05', '0'],
				['2026-10-07', '1.234567890123456789']
			]);
			expect(result.points[0]).toMatchObject({
				timePrecision: 'Day',
				sourceDate: '2026-10-05',
				pointArtifact: 'AllPrices',
				pointPayloadDigest: 'history-fixture'
			});
			expect(result.points[0]).not.toHaveProperty('sourceTime');
			expect(result.points[0]).not.toHaveProperty('freshness');
			expect(result.points[0]).not.toHaveProperty('quantity');
			expect(result.publications[0]).toMatchObject({
				sourceDate: '2026-10-06',
				payloadDigest: 'today-fixture'
			});
			await expect(
				valuation.printingHistory({ printingId: printing, finish: 'nonfoil', days: 91 })
			).rejects.toMatchObject({ name: 'ValidationError' });
			await expect(
				valuation.printingHistory({
					printingId: printing,
					finish: 'nonfoil',
					sources: ['MTGJSON', 'MTGJSON']
				})
			).rejects.toMatchObject({ name: 'ValidationError' });
		} finally {
			await database.pool.query('DELETE FROM price_source_history WHERE printing_id=$1', [
				printing
			]);
			await database.pool.query('DELETE FROM price_history_publications WHERE publication_id=$1', [
				mtgjson
			]);
		}
	});
	it('retains optional English history when the baseline identity is pruned', async () => {
		clock = new Date('2026-10-07T12:00:00Z');
		const localized = randomUUID();
		try {
			await database.pool.query(
				`UPDATE optional_price_state SET enabled=true WHERE source='MTGJSON'`
			);
			await database.pool.query(
				`INSERT INTO optional_price_printings(publication_id,printing_id,identity,finishes) VALUES($1,$2,'{"lang":"de"}',ARRAY['nonfoil'])`,
				[mtgjson, localized]
			);
			await database.pool.query(
				`UPDATE optional_price_printings SET variant_key='approved-fixture' WHERE publication_id=$1 AND printing_id=$2`,
				[mtgjson, printing]
			);
			await database.pool.query(
				`INSERT INTO optional_price_observations(publication_id,printing_id,finish,measure,supported,english_printing_id) VALUES($1,$2,'nonfoil','paper.cardmarket.retail.normal',true,$3)`,
				[mtgjson, localized, printing]
			);
			await database.pool.query(`INSERT INTO price_history_publications VALUES($1,'MTGJSON',$2)`, [
				mtgjson,
				{
					source: 'MTGJSON',
					descriptor: {},
					publicationId: mtgjson,
					payloadDigest: 'fixture',
					extractorVersion: 1,
					mappingVersion: 1,
					ingestedAt: '2026-10-07T00:00:00Z',
					sourceDate: '2026-10-06',
					pointArtifact: 'AllPrices',
					pointPayloadDigest: 'history-fixture'
				}
			]);
			await database.pool.query(
				`INSERT INTO price_history_printings VALUES($1,$2,'{"lang":"en"}','approved-fixture')`,
				[mtgjson, printing]
			);
			await database.pool.query(
				`INSERT INTO price_source_history(source,printing_id,finish,day,time_precision,amount,measure,provider_id,publication_id,evidence) VALUES('MTGJSON',$1,'nonfoil','2026-10-06','Day',0,'paper.cardmarket.retail.normal',$2,$3,'{}')`,
				[printing, randomUUID(), mtgjson]
			);
			await database.pool.query('UPDATE price_state SET active_publication=NULL WHERE id=1');
			expect(
				(await valuation.printingReferences([{ printingId: localized, finish: 'nonfoil' }]))
					.results[0]
			).toMatchObject({ kind: 'Known', provenance: 'EnglishFallback', amount: '0' });
			const result = await valuation.printingHistory({
				printingId: localized,
				finish: 'nonfoil',
				sources: ['MTGJSON']
			});
			expect(result.points).toHaveLength(1);
			expect(result.points[0]).toMatchObject({
				provenance: 'EnglishFallback',
				printingId: localized,
				matchedPrintingId: printing,
				amount: '0',
				pointPayloadDigest: 'history-fixture'
			});
		} finally {
			await database.pool.query('DELETE FROM price_source_history WHERE printing_id=$1', [
				printing
			]);
			await database.pool.query('DELETE FROM price_history_publications WHERE publication_id=$1', [
				mtgjson
			]);
			await database.pool.query(
				'DELETE FROM optional_price_printings WHERE publication_id=$1 AND printing_id=$2',
				[mtgjson, localized]
			);
			await database.pool.query('UPDATE price_state SET active_publication=$1 WHERE id=1', [
				baseline
			]);
		}
	});
	it('freezes configured Known and Unknown evidence inside the caller transaction and clock', async () => {
		await database.pool.query(
			`UPDATE optional_price_state SET enabled=true WHERE source='Cardmarket'`
		);
		await database.pool.query(
			`UPDATE optional_price_publications SET source_instant='2026-10-07T00:00:00Z' WHERE id=$1`,
			[cardmarket]
		);
		const application = createValuation(
			database.pool,
			createLocalAuth(database.db, { demoMode: false }),
			() => {
				throw Error('Standalone clock must not run');
			}
		);
		const client = await database.pool.connect();
		try {
			await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
			const result = await application.freezeInTransaction(
				client,
				[
					{ printingId: printing, finish: 'nonfoil' },
					{ printingId: randomUUID(), finish: 'nonfoil' }
				],
				new Date('2026-10-07T03:00:00Z')
			);
			expect(result.evidence).toHaveLength(2);
			expect(result.evidence[0]).toMatchObject({
				reference: { kind: 'Known', source: 'Cardmarket', amount: '1.01' },
				evaluatedAt: '2026-10-07T03:00:00.000Z',
				known: { rawValue: null, requestedIdentity: { lang: 'en' } }
			});
			expect(result.evidence[1]).toMatchObject({
				reference: { kind: 'Unknown', reason: 'PrintingMissing' },
				known: null
			});
			expect(result.evidence[1].sourceSelections.map((s) => s.source)).toEqual([
				'Scryfall',
				'Cardmarket',
				'MTGJSON'
			]);
			expect(result.evidence[1].sourceSelections.every((s) => s.publication && s.descriptor)).toBe(
				true
			);
			result.response.results[0].links.push({
				provider: 'Cardmarket',
				url: 'https://www.cardmarket.com/changed',
				printingId: printing,
				provenance: 'Exact'
			});
			expect(result.evidence[0].reference.links).toHaveLength(0);
			result.evidence[0].sourceSelections[1].selection!.identity = { lang: 'changed' };
			expect(result.evidence[0].known!.requestedIdentity.lang).toBe('en');
			await client.query('ROLLBACK');
		} finally {
			await client.query('ROLLBACK');
			client.release();
		}
	});
});
