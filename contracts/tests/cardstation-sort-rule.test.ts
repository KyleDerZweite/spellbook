import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
	parseCardstationSortRule,
	selectCardstationSortSlot
} from '../src/cardstation-sort-rule.ts';

const fixture = JSON.parse(
	readFileSync(new URL('../fixtures/cardstation-sort-rule.v1.json', import.meta.url), 'utf8')
);

test('shared versioned sort fixture returns the same output as Python', () => {
	const document = parseCardstationSortRule(fixture.rule);
	for (const entry of fixture.cases)
		assert.equal(selectCardstationSortSlot(document, entry.observation), entry.slot);
});

test('unknown fields, future versions and ambiguous predicates fail closed', () => {
	for (const invalid of fixture.invalid)
		assert.throws(() => parseCardstationSortRule(invalid));
	assert.throws(() => parseCardstationSortRule({ ...fixture.rule, accountId: 'private' }));
	assert.throws(() =>
		parseCardstationSortRule({
			...fixture.rule,
			rules: [{ when: [{ field: 'price', oneOf: ['10'] }], slot: 1 }]
		})
	);
});

test('normalization copies arrays so editor changes cannot mutate a run snapshot', () => {
	const parsed = parseCardstationSortRule(fixture.rule);
	fixture.rule.rules[0].when[0].oneOf[0] = 'red';
	assert.equal(parsed.rules[0].when[0].oneOf[0], 'white');
});
