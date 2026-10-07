import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

export const precon = JSON.parse(
	await readFile(new URL('./upgrades-unleashed.json', import.meta.url), 'utf8')
);

/** Caller owns the transaction and Inventory parent lock. */
export async function insertPrecon(client, account, inventory) {
	const deck = randomUUID();
	await client.query(
		"INSERT INTO decks(id,account_id,game,name,format,description) VALUES($1,$2,'mtg',$3,'Commander',$4)",
		[deck, account, precon.name, precon.description]
	);
	for (const entry of precon.cards) {
		const d = entry.card;
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
				entry.quantity,
				entry.role
			]
		);
	}
	for (const [position, entry] of [...precon.cards, ...precon.inventoryExtras].entries()) {
		const d = entry.card;
		await client.query(
			"INSERT INTO inventory_cards(id,inventory_id,account_id,game,catalog_card_id,canonical_card_id,name,set_code,image_uri,quantity,finish,condition,spellbook_position,notes) VALUES($1,$2,$3,'mtg',$4,$5,$6,$7,$8,$9,$10,$11,$12,'')",
			[
				randomUUID(),
				inventory,
				account,
				d.id,
				d.oracle_id,
				d.name,
				d.set_code,
				d.image_uri,
				entry.quantity,
				entry.finish,
				entry.condition,
				position
			]
		);
	}
	await client.query('UPDATE inventories SET revision=revision+1 WHERE id=$1', [inventory]);
	return deck;
}
