import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseSortPredicates } from '../src/cardstation-sort-rule.ts';
import { physicalBoxLabelPayload } from '../src/physical-boxes.ts';

test('physical box labels encode only the version and canonical UUID', () => {
	const id = '6f107d8b-8f65-4f4e-9834-70b5d4b86612';
	assert.equal(physicalBoxLabelPayload(id), `sbx:1:${id}`);
	for (const bad of [id.toUpperCase(), `https://example.com/${id}`, `${id}\n`])
		assert.throws(() => physicalBoxLabelPayload(bad));
});

test('physical box conditions use the same slot-free predicates as a sort rule', () => {
	const predicates = [{ field: 'setCode', oneOf: ['mh3'] }];
	assert.deepEqual(parseSortPredicates(predicates), predicates);
	assert.throws(() => parseSortPredicates([{ ...predicates[0], slot: 1 }]));
	assert.throws(() => parseSortPredicates([{ field: 'toString', oneOf: ['mh3'] }]));

	const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
	const { description, ...condition } =
		read('../openapi.json').components.schemas.PhysicalBoxCondition;
	const sort = read('../schemas/cardstation-sort-rule.v1.schema.json');
	assert.ok(description);
	assert.deepEqual(condition, sort.properties.rules.items.properties.when);
});
