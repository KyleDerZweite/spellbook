import { readFile } from 'node:fs/promises';
import type { Pool } from 'pg';
import type { CardDocument } from '@spellbook/contracts/catalog.ts';
export async function seedWideSummary(pool: Pool, accountId: string) {
	const cards = JSON.parse(
		await readFile(new URL('../../scripts/demo/cards.json', import.meta.url), 'utf8')
	) as CardDocument[];
	const card = cards.find((card) => card.name === 'Sol Ring')!;
	const missing = cards.find((other) => other.oracle_id !== card.oracle_id)!;
	const inventoryId = crypto.randomUUID();
	await pool.query("INSERT INTO inventories(id,account_id,game) VALUES($1,$2,'mtg')", [
		inventoryId,
		accountId
	]);
	for (const finish of ['nonfoil', 'foil'])
		await pool.query(
			"INSERT INTO inventory_cards(id,inventory_id,account_id,game,catalog_card_id,canonical_card_id,name,set_code,image_uri,quantity,finish,condition,spellbook_position) VALUES($1,$2,$3,'mtg',$4,$5,$6,$7,$8,2147483647,$9,'NM',0)",
			[
				crypto.randomUUID(),
				inventoryId,
				accountId,
				card.id,
				card.oracle_id,
				card.name,
				card.set_code,
				card.image_uri,
				finish
			]
		);
	const deckIds: string[] = [];
	for (const [name, printing] of [
		['Owned', card],
		['Missing', missing]
	] as const) {
		const deckId = crypto.randomUUID();
		deckIds.push(deckId);
		await pool.query("INSERT INTO decks(id,account_id,game,name) VALUES($1,$2,'mtg',$3)", [
			deckId,
			accountId,
			name
		]);
		for (const role of ['main', 'sideboard'])
			await pool.query(
				"INSERT INTO deck_cards(id,deck_id,account_id,game,catalog_card_id,canonical_card_id,name,set_code,image_uri,quantity,role) VALUES($1,$2,$3,'mtg',$4,$5,$6,$7,$8,2147483647,$9)",
				[
					crypto.randomUUID(),
					deckId,
					accountId,
					printing.id,
					printing.oracle_id,
					printing.name,
					printing.set_code,
					printing.image_uri,
					role
				]
			);
	}
	return { setCode: card.set_code, deckIds };
}
