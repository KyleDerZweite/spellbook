import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDeviceName } from '../src/devices.ts';

test('device names match the Core validation rules', () => {
	assert.equal(normalizeDeviceName('  Cardstation  '), 'Cardstation');
	assert.equal(normalizeDeviceName('x'.repeat(64)), 'x'.repeat(64));
	assert.equal(normalizeDeviceName('Küche 🃏'), 'Küche 🃏');
	for (const invalid of [
		'',
		'   ',
		'x'.repeat(65),
		'🃏'.repeat(33),
		'bad\nname',
		'bad\u0000name',
		'evil‮gnp.exe',
		'zero​width',
		'line sep',
		null,
		42
	])
		assert.equal(normalizeDeviceName(invalid), null);
});
