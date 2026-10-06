import { readFile } from 'node:fs/promises';
import type { Pool } from 'pg';
import type { CardDocument } from '@spellbook/contracts/catalog.ts';

/** Seed one public printing in the disposable test Catalog without replacing existing data. */
export async function ensureDeckCatalogFixture(pool: Pool) {
	const documents: CardDocument[] = JSON.parse(
		await readFile(new URL('../scripts/demo/cards.json', import.meta.url), 'utf8')
	);
	const card = documents.find((document) => document.name === 'Sol Ring');
	if (!card) throw new Error('Public Deck fixture printing is missing');
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		await client.query("SELECT pg_advisory_xact_lock(hashtextextended('deck-catalog-fixture',0))");
		let generation = (await client.query('SELECT active_generation FROM catalog_state WHERE id=1'))
			.rows[0]?.active_generation;
		if (!generation) {
			generation = crypto.randomUUID();
			await client.query(
				"INSERT INTO catalog_generations(id,source_type,source_updated_at,document_count,published_at) VALUES($1,'test-public-printing',now(),0,now())",
				[generation]
			);
			await client.query(
				'INSERT INTO catalog_state(id,active_generation) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET active_generation=excluded.active_generation',
				[generation]
			);
		}
		const inserted = await client.query(
			'INSERT INTO catalog_printings(generation_id,id,oracle_id,name,normalized_name,printed_name,lang,set_code,collector_number,rarity,cmc,colors,card_types,legalities,search_name,search_text,document) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) ON CONFLICT DO NOTHING',
			[
				generation,
				card.id,
				card.oracle_id,
				card.name,
				card.name.toLowerCase(),
				card.printed_name || '',
				card.lang,
				card.set_code,
				card.collector_number,
				card.rarity,
				card.cmc,
				card.colors,
				card.card_types,
				JSON.stringify(card.legalities),
				card.name.toLowerCase(),
				`${card.name} ${card.oracle_text}`,
				JSON.stringify(card)
			]
		);
		if (inserted.rowCount)
			await client.query(
				'UPDATE catalog_generations SET document_count=document_count+1 WHERE id=$1',
				[generation]
			);
		await client.query('COMMIT');
	} catch (cause) {
		await client.query('ROLLBACK');
		throw cause;
	} finally {
		client.release();
	}
	return {
		catalogCardId: card.id,
		canonicalCardId: card.oracle_id,
		name: card.name,
		setCode: card.set_code,
		imageUri: card.image_uri
	};
}
