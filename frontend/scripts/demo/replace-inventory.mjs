import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
	replaceDemoInventory as replaceDemoInventoryOperation,
	requireDemoDatabase,
	matchesLegacy
} from '@spellbook/backend/operators/demo.ts';
import { precon } from './precon.mjs';

export { requireDemoDatabase, matchesLegacy };

export async function legacyInventory() {
	const cards = JSON.parse(await readFile(new URL('./cards.json', import.meta.url), 'utf8'));
	const commander = cards.find((card) => card.name === 'Lathril, Blade of the Elves');
	const forest = cards.find((card) => card.name === 'Forest');
	const sol = cards.find((card) => card.name === 'Sol Ring');
	const alternate = cards.find((card) => card.name === 'Sol Ring' && card.id !== sol.id);
	const spells = [
		...cards
			.filter((card) => card !== commander && card !== forest && card.name !== 'Sol Ring')
			.slice(0, 63),
		sol
	];
	return [commander, ...spells.slice(0, 40), alternate, forest].map((d, position) => ({
		catalog_card_id: d.id,
		canonical_card_id: d.oracle_id,
		name: d.name,
		set_code: d.set_code,
		image_uri: d.image_uri,
		quantity: d === forest ? 30 : 1,
		finish: 'nonfoil',
		condition: 'NM',
		spellbook_position: position,
		notes: '',
		notes_revision: '0',
		game: 'mtg'
	}));
}

export async function replaceDemoInventory({ apply = false } = {}) {
	return replaceDemoInventoryOperation(process.env.DATABASE_URL, {
		apply,
		precon,
		legacyInventory: await legacyInventory()
	});
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	requireDemoDatabase(process.env.DATABASE_URL);
	if (process.argv.slice(2).some((arg) => arg !== '--apply'))
		throw new Error('Only --apply is accepted; omission previews.');
	console.log(
		JSON.stringify(await replaceDemoInventory({ apply: process.argv.includes('--apply') }))
	);
}
