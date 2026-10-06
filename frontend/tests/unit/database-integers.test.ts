import { describe, expect, it } from 'vitest';
import { databaseInteger, DatabaseIntegerRangeError } from '@spellbook/backend/db/numbers.ts';
import { summaryNumber } from '@spellbook/backend/profile/summary-number.ts';

describe('exact database integer to JSON boundary', () => {
	it('decodes signed counts and large aggregates without narrowing to32bits', () => {
		expect(databaseInteger('4294967294')).toBe(4294967294);
		expect(databaseInteger('9007199254740991')).toBe(9007199254740991);
		expect(databaseInteger('-9007199254740991')).toBe(-9007199254740991);
		expect(databaseInteger(0n)).toBe(0);
		expect(JSON.stringify({ quantity: databaseInteger('4294967294') })).toBe(
			'{"quantity":4294967294}'
		);
	});
	it('rejects rounding, nonintegers and malformed persisted values', () => {
		for (const value of [
			'9007199254740992',
			'-9007199254740992',
			9007199254740992,
			'1.5',
			NaN,
			Infinity,
			undefined
		])
			expect(() => databaseInteger(value)).toThrow(DatabaseIntegerRangeError);
		for (const value of ['9007199254740992', '-1'])
			expect(() => summaryNumber(value)).toThrow('supported reporting range');
	});
});
