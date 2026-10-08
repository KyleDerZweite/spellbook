import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { CardDocument } from '@spellbook/contracts/catalog.ts';

type RecordedPrinting = {
	document: CardDocument;
	search_name: string;
	search_text: string;
	raw_oracle_id: string;
	types: string[] | null;
};
type VerifiedBundle = {
	file: URL;
	manifest: { bundleVersion: string; catalogTransformVersion: number };
};
// The native script is JavaScript; keep its test adapter typed without changing that owner.
const nativeBundleURL = new URL('../../scripts/demo/catalog-bundle.mjs', import.meta.url);
const {
	verifyBundle,
	bundleBatches
}: {
	verifyBundle(): Promise<VerifiedBundle>;
	bundleBatches(bundle: VerifiedBundle): AsyncGenerator<RecordedPrinting[]>;
} = await import(nativeBundleURL.href);

/** Recorded public printings and raw facts, independent of the ambient Catalog. */
export async function publishCategoryCatalogFixture(pool: Pool) {
	const bundle = await verifyBundle();
	const records: RecordedPrinting[] = [];
	let artifact: RecordedPrinting | undefined;
	// Consume the whole stream so the native verifier checks the payload digest and counts.
	for await (const batch of bundleBatches(bundle)) {
		for (const record of batch) {
			if (!record.raw_oracle_id || !Array.isArray(record.types)) continue;
			if (records.length < 1000) records.push(record);
			if (!artifact && record.types.includes('Artifact')) artifact = record;
		}
	}
	if (records.length !== 1000 || !artifact)
		throw new Error('Recorded Category fixture needs 1000 known printings and an Artifact');
	if (!records.some((record) => record.types?.includes('Artifact'))) records[999] = artifact;
	const generationId = randomUUID();
	const client = await pool.connect();
	let previous;
	try {
		await client.query('BEGIN');
		await client.query('SELECT pg_advisory_xact_lock($1,$2)', [1936747619, 1]);
		previous = (await client.query('SELECT * FROM catalog_state WHERE id=1 FOR UPDATE')).rows[0];
		// Bundle time identifies this recorded fixture, not verified upstream freshness.
		await client.query(
			"INSERT INTO catalog_generations(id,source_type,source_updated_at,document_count,schema_version,published_at) VALUES($1,'test-recorded-category-bundle',$2,1000,$3,now())",
			[generationId, bundle.manifest.bundleVersion, bundle.manifest.catalogTransformVersion]
		);
		for (let offset = 0; offset < records.length; offset += 500) {
			const batch = JSON.stringify(records.slice(offset, offset + 500));
			await client.query(
				`INSERT INTO catalog_printings(generation_id,id,oracle_id,name,normalized_name,printed_name,lang,set_code,collector_number,rarity,cmc,colors,card_types,legalities,search_name,search_text,document)
				 SELECT $1,d.id,d.oracle_id,d.name,d.normalized_name,d.printed_name,d.lang,d.set_code,d.collector_number,d.rarity,d.cmc,d.colors,d.card_types,d.legalities,r.search_name,r.search_text,r.document
				 FROM jsonb_to_recordset($2::jsonb) r(document jsonb,search_name text,search_text text)
				 CROSS JOIN LATERAL jsonb_to_record(r.document) d(id uuid,oracle_id uuid,name text,normalized_name text,printed_name text,lang text,set_code text,collector_number text,rarity text,cmc double precision,colors text[],card_types text[],legalities jsonb)`,
				[generationId, batch]
			);
			await client.query(
				`INSERT INTO catalog_oracle_facts(generation_id,printing_id,raw_oracle_id,types,transform_version)
				 SELECT $1,(r.document->>'id')::uuid,r.raw_oracle_id,r.types,$3
				 FROM jsonb_to_recordset($2::jsonb) r(document jsonb,raw_oracle_id uuid,types text[])`,
				[generationId, batch, bundle.manifest.catalogTransformVersion]
			);
		}
		await client.query(
			`INSERT INTO catalog_state(id,active_generation) VALUES(1,$1)
			 ON CONFLICT(id) DO UPDATE SET active_generation=excluded.active_generation`,
			[generationId]
		);
		await client.query('COMMIT');
	} catch (cause) {
		await client.query('ROLLBACK');
		throw cause;
	} finally {
		client.release();
	}
	return async () => {
		const cleanup = await pool.connect();
		try {
			await cleanup.query('BEGIN');
			await cleanup.query('SELECT pg_advisory_xact_lock($1,$2)', [1936747619, 1]);
			const current = (
				await cleanup.query('SELECT active_generation FROM catalog_state WHERE id=1 FOR UPDATE')
			).rows[0];
			if (current?.active_generation !== generationId)
				throw new Error('Category fixture cleanup found an unexpected Catalog publication');
			if (previous)
				await cleanup.query(
					'UPDATE catalog_state SET active_generation=$1,previous_generation=$2,updated_at=$3 WHERE id=1',
					[previous.active_generation, previous.previous_generation, previous.updated_at]
				);
			else await cleanup.query('DELETE FROM catalog_state WHERE id=1');
			await cleanup.query('DELETE FROM catalog_generations WHERE id=$1', [generationId]);
			await cleanup.query('COMMIT');
		} catch (cause) {
			await cleanup.query('ROLLBACK');
			throw cause;
		} finally {
			cleanup.release();
		}
	};
}
