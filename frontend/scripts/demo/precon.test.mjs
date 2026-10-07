import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import test from 'node:test';
import { precon } from './precon.mjs';
import { legacyInventory, matchesLegacy, requireDemoDatabase } from './replace-inventory.mjs';

test('the shipped English precon retains all 100 copies and the duplicate Mossfire Valley', async () => {
	assert.equal(precon.cards.length, 75);
	assert.equal(precon.inventoryExtras.length, 1);
	assert.equal(precon.inventoryExtras[0].finish, 'nonfoil');
	assert.equal(precon.inventoryExtras[0].quantity, 1);
	assert.equal(precon.inventoryExtras[0].card.id, precon.cards[0].card.id);
	assert.equal(precon.inventoryExtras[0].card.oracle_id, precon.cards[0].card.oracle_id);
	assert.ok(precon.inventoryExtras[0].provenance.includes('Owner confirmed'));
	assert.equal(
		precon.cards.reduce((sum, e) => sum + e.quantity, 0),
		100
	);
	assert.equal(precon.cards.find((e) => e.name === 'Mossfire Valley').quantity, 2);
	assert.equal(precon.cards.find((e) => e.name === 'Mountain').quantity, 12);
	assert.equal(precon.cards.find((e) => e.name === 'Forest').quantity, 14);
	assert.equal(precon.cards.filter((e) => e.role === 'commander').length, 1);
	assert.equal(
		precon.cards.find((e) => e.role === 'commander').card.id,
		'bffa36ac-137d-481c-b1b7-76a88ef15d54'
	);
	assert.equal(precon.cards.filter((e) => e.finish === 'foil').length, 2);
	assert.equal(precon.cards.filter((e) => e.card.set_code === 'neo').length, 6);
	assert.ok(
		precon.cards.every((e) => e.card.lang === 'en' && ['nec', 'neo'].includes(e.card.set_code))
	);
	const snapshot = JSON.parse(
		await readFile(new URL('../../src/lib/showcase/commander-deck.json', import.meta.url), 'utf8')
	);
	assert.equal(snapshot.source, 'Wizards of the Coast');
	assert.deepEqual(
		snapshot.cards.map((e) => [e.name, e.quantity, e.role, e.catalogCardId]),
		precon.cards.map((e) => [e.name, e.quantity, e.role, e.card.id])
	);
	assert.equal(snapshot.displayCards.length, 8);
	for (const name of snapshot.displayCards) {
		const card = snapshot.cards.find((e) => e.name === name);
		assert.equal(card.imageWidth, 488);
		assert.equal(card.imageHeight, 680);
		await access(new URL('../../static/showcase/' + card.localImage, import.meta.url));
	}
	assert.ok(
		!(
			await readFile(
				new URL('../../src/lib/components/showcase/LandingCommander.svelte', import.meta.url),
				'utf8'
			)
		).includes('Archidekt')
	);
});

test('legacy replacement rejects altered ownership, metadata, notes and order', async () => {
	const expected = await legacyInventory();
	assert.equal(expected.length, 43);
	assert.equal(
		expected.reduce((s, e) => s + e.quantity, 0),
		72
	);
	assert.ok(matchesLegacy(expected, expected));
	for (const [field, value] of [
		['quantity', 2],
		['notes', 'owned edit'],
		['notes_revision', '1'],
		['finish', 'foil'],
		['condition', 'LP'],
		['spellbook_position', 99],
		['catalog_card_id', 'other'],
		['canonical_card_id', 'other'],
		['image_uri', 'other']
	]) {
		const altered = structuredClone(expected);
		altered[0][field] = value;
		assert.equal(matchesLegacy(altered, expected), false, field);
	}
	assert.equal(matchesLegacy(expected.slice(1), expected), false);
	assert.throws(() => requireDemoDatabase('postgresql://localhost/spellbook'));
	assert.doesNotThrow(() => requireDemoDatabase('postgresql://localhost/spellbook_design'));
});
