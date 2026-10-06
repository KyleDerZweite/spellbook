import { readFile } from 'node:fs/promises';
import type { Pool } from 'pg';
import type { CardDocument } from '@spellbook/contracts/catalog.ts';

export async function seedAccountScaleInventory(pool: Pool, accountId: string, path: string) {
	const source = await readFile(path, 'utf8');
	const records = source
		.trim()
		.split('\n')
		.map(
			(line) => JSON.parse(line) as { document: CardDocument; supportedInventoryFinishes: string[] }
		);
	if (records.length !== 10000)
		throw new Error('Scale fixture must contain 10,000 actual printings.');
	const inventoryId = crypto.randomUUID();
	await pool.query("INSERT INTO inventories(id,account_id,game) VALUES($1,$2,'mtg')", [
		inventoryId,
		accountId
	]);
	const entries = records.flatMap(({ document: card, supportedInventoryFinishes }) =>
		['NM', 'LP', 'MP', 'HP', 'DMG'].map((condition) => ({
			id: crypto.randomUUID(),
			catalogCardId: card.id,
			canonicalCardId: card.oracle_id,
			name: card.name,
			setCode: card.set_code,
			imageUri: card.image_uri,
			quantity: 1,
			finish: supportedInventoryFinishes[0],
			condition
		}))
	);
	for (let offset = 0; offset < entries.length; offset += 1000)
		await pool.query(
			`INSERT INTO inventory_cards(id,inventory_id,account_id,game,catalog_card_id,canonical_card_id,name,set_code,image_uri,quantity,finish,condition,spellbook_position) SELECT x.id::uuid,$1::uuid,$2,'mtg',x."catalogCardId",x."canonicalCardId",x.name,x."setCode",x."imageUri",x.quantity,x.finish,x.condition,0 FROM jsonb_to_recordset($3::jsonb) AS x(id text,"catalogCardId" text,"canonicalCardId" text,name text,"setCode" text,"imageUri" text,quantity int,finish text,condition text)`,
			[inventoryId, accountId, JSON.stringify(entries.slice(offset, offset + 1000))]
		);
	return { records, entries };
}
