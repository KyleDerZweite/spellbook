import assert from 'node:assert/strict';
import test from 'node:test';
import * as seed from './seed.mjs';
import * as replacement from './replace-inventory.mjs';
import * as fixture from './precon.mjs';
import { validPassword, normalizeUsername } from '@spellbook/backend/operators/local-password.ts';

test('native Demo adapters expose inputs/results and fixture data without raw persistence handles', () => {
	assert.deepEqual(Object.keys(seed), ['seedDemo']);
	assert.deepEqual(Object.keys(fixture), ['precon']);
	assert.deepEqual(Object.keys(replacement), [
		'legacyInventory',
		'matchesLegacy',
		'replaceDemoInventory',
		'requireDemoDatabase'
	]);
});

test('native password validation retains username normalization and the 12 to 128 character contract', () => {
	assert.equal(normalizeUsername(' Native_Owner '), 'native_owner');
	assert.equal(normalizeUsername('invalid username'), null);
	assert.equal(validPassword('x'.repeat(11)), false);
	assert.equal(validPassword('x'.repeat(12)), true);
	assert.equal(validPassword('x'.repeat(128)), true);
	assert.equal(validPassword('x'.repeat(129)), false);
});

test('Demo database rejection does not include malformed credential-bearing input', () => {
	const input = 'postgresql://private_owner:protected_password@[broken/spellbook_design';
	assert.throws(
		() => replacement.requireDemoDatabase(input),
		(error) => {
			assert.equal(error.message, 'Requires a database name ending in _demo or _design.');
			assert.equal(String(error).includes('protected_password'), false);
			return true;
		}
	);
});
