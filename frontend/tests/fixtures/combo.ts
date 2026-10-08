import { createHash, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import type { CardDocument } from '@spellbook/contracts/catalog.ts';
import type { ComboVariant } from '@spellbook/contracts/combo.ts';

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

/** Recorded Oak/Denizen printings and raw facts, independent of the ambient Catalog. */
export async function publishComboCatalogFixture(pool: Pool) {
	const bundle = await verifyBundle();
	const selected: RecordedPrinting[] = [];
	// Finish the stream to verify its digest and counts, retaining only real ingredient printings.
	for await (const batch of bundleBatches(bundle)) {
		for (const record of batch) {
			if (
				[oakOracleId, denizenOracleId].includes(record.raw_oracle_id) &&
				!selected.some((row) => row.raw_oracle_id === record.raw_oracle_id)
			)
				selected.push(record);
		}
	}
	if (selected.length !== 2) throw new Error('Recorded Catalog lacks Oak/Denizen raw facts');
	const generationId = randomUUID();
	const client = await pool.connect();
	let previous;
	try {
		await client.query('BEGIN');
		await client.query('SELECT pg_advisory_xact_lock($1,$2)', [1936747619, 1]);
		previous = (
			await client.query(
				'SELECT id,active_generation,previous_generation,updated_at::text AS updated_at FROM catalog_state WHERE id=1 FOR UPDATE'
			)
		).rows[0];
		// Bundle time identifies this recorded fixture, not verified upstream freshness.
		await client.query(
			"INSERT INTO catalog_generations(id,source_type,source_updated_at,document_count,schema_version,published_at) VALUES($1,'test-recorded-combo-bundle',$2,2,$3,now())",
			[generationId, bundle.manifest.bundleVersion, bundle.manifest.catalogTransformVersion]
		);
		for (let offset = 0; offset < selected.length; offset += 500) {
			const batch = JSON.stringify(selected.slice(offset, offset + 500));
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
			const restored = (
				await cleanup.query(
					'SELECT id,active_generation,previous_generation,updated_at::text AS updated_at FROM catalog_state WHERE id=1'
				)
			).rows[0];
			assert.deepEqual(
				restored,
				previous,
				'Category fixture must restore the complete prior Catalog state'
			);
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

// Recorded official bulk variant 2850-4186, retrieved 2026-10-08.
export const recordedOakVariant: ComboVariant = {
	id: '2850-4186',
	status: 'OK',
	ingredients: [
		{
			oracleId: 'eee6c02b-7d6a-4445-ad27-8b03176147d4',
			name: 'Scurry Oak',
			quantity: '1',
			mustBeCommander: false,
			zones: ['H'],
			usedFace: null,
			states: {
				battlefieldCardState: '',
				exileCardState: '',
				graveyardCardState: '',
				libraryCardState: ''
			}
		},
		{
			oracleId: 'a5da5ad6-4ed2-4041-a983-76a8c87fa109',
			name: 'Ivy Lane Denizen',
			quantity: '1',
			mustBeCommander: false,
			zones: ['B'],
			usedFace: null,
			states: {
				battlefieldCardState: '',
				exileCardState: '',
				graveyardCardState: '',
				libraryCardState: ''
			}
		}
	],
	outcomeIds: ['2244', '21', '4'],
	producedOutcomes: [
		{
			id: '2244',
			name: 'Infinite +1/+1 counters on a creature',
			status: 'C',
			uncountable: true,
			quantity: '1'
		},
		{
			id: '21',
			name: 'Infinite creature tokens',
			status: 'S',
			uncountable: true,
			quantity: '1'
		},
		{
			id: '4',
			name: 'Infinite creature ETB',
			status: 'H',
			uncountable: true,
			quantity: '1'
		}
	],
	unsupportedReasons: [],
	mana: '{2}{G}',
	prerequisites: '\n',
	steps:
		"Cast Scurry Oak by paying {2}{G}.\nIvy Lane Denizen triggers, putting a +1/+1 counter on Scurry Oak.\nScurry Oak's last ability triggers, allowing you to create a 1/1 Squirrel token.\nRepeat from step 2.",
	notes: '',
	templates: []
};
export const oakOracleId = recordedOakVariant.ingredients[0].oracleId!;
export const denizenOracleId = recordedOakVariant.ingredients[1].oracleId!;

/** Transactional local fixture publication. Synthetic variants are explicit policy cases. */
export async function publishComboFixture(
	pool: Pool,
	variants: ComboVariant[] = [recordedOakVariant]
) {
	const publicationId = randomUUID();
	const client = await pool.connect();
	let previous:
		| {
				active_publication: string | null;
				previous_publication: string | null;
				refresh_status: unknown;
		  }
		| undefined;
	try {
		await client.query('BEGIN');
		await client.query('SELECT pg_advisory_xact_lock($1,$2)', [1936747619, 23]);
		previous = (
			await client.query(
				'SELECT active_publication,previous_publication,refresh_status FROM combo_state WHERE id=1 FOR UPDATE'
			)
		).rows[0];
		const outcomes = [
			...new Map(variants.flatMap((v) => v.producedOutcomes).map((o) => [o.id, o])).values()
		];
		await client.query(
			`INSERT INTO combo_publications(id,descriptor,source_updated_at,source_version,payload_digest,decoded_digest,parser_version,policy_version,variant_count,outcome_count,alias_count)
		 VALUES($1,$2,'2026-10-08T00:00:00Z','recorded-test-subset',$3,$3,1,'ingredients-v1',$4,$5,0)`,
			[
				publicationId,
				JSON.stringify({ fixture: 'recorded Oak/Denizen subset, not a complete upstream import' }),
				createHash('sha256').update(JSON.stringify(variants)).digest('hex'),
				variants.length,
				outcomes.length
			]
		);
		for (const o of outcomes)
			await client.query('INSERT INTO combo_outcomes VALUES($1,$2,$3,$4,$5)', [
				publicationId,
				o.id,
				o.name,
				o.status,
				o.uncountable
			]);
		for (const v of variants) {
			await client.query('INSERT INTO combo_variants VALUES($1,$2,$3)', [
				publicationId,
				v.id,
				JSON.stringify(v)
			]);
			for (const [position, i] of v.ingredients.entries())
				await client.query('INSERT INTO combo_variant_ingredients VALUES($1,$2,$3,$4,$5,$6)', [
					publicationId,
					v.id,
					position,
					i.oracleId,
					i.quantity,
					i.mustBeCommander
				]);
			for (const o of v.producedOutcomes)
				await client.query('INSERT INTO combo_variant_outcomes VALUES($1,$2,$3,$4)', [
					publicationId,
					v.id,
					o.id,
					o.quantity
				]);
		}
		await client.query(
			`INSERT INTO combo_state(id,active_publication,refresh_status) VALUES(1,$1,'{"kind":"Succeeded"}') ON CONFLICT(id) DO UPDATE SET active_publication=excluded.active_publication,refresh_status=excluded.refresh_status`,
			[publicationId]
		);
		await client.query('COMMIT');
	} catch (cause) {
		await client.query('ROLLBACK');
		throw cause;
	} finally {
		client.release();
	}
	return {
		publicationId,
		restore: async () => {
			const cleanup = await pool.connect();
			try {
				await cleanup.query('BEGIN');
				const current = (
					await cleanup.query('SELECT active_publication FROM combo_state WHERE id=1 FOR UPDATE')
				).rows[0];
				if (current?.active_publication !== publicationId)
					throw new Error('Combo fixture lost publication ownership');
				if (previous)
					await cleanup.query(
						'UPDATE combo_state SET active_publication=$1,previous_publication=$2,refresh_status=$3 WHERE id=1',
						[
							previous.active_publication,
							previous.previous_publication,
							JSON.stringify(previous.refresh_status)
						]
					);
				else await cleanup.query('DELETE FROM combo_state WHERE id=1');
				assert.deepEqual(
					(
						await cleanup.query(
							'SELECT active_publication,previous_publication,refresh_status FROM combo_state WHERE id=1'
						)
					).rows[0],
					previous
				);
				await cleanup.query('DELETE FROM combo_publications WHERE id=$1', [publicationId]);
				await cleanup.query('COMMIT');
			} catch (cause) {
				await cleanup.query('ROLLBACK');
				throw cause;
			} finally {
				cleanup.release();
			}
		}
	};
}
