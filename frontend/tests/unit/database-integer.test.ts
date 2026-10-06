import { describe, expect, it } from 'vitest';
import { databaseInteger, DatabaseIntegerRangeError } from '@spellbook/backend/db/numbers.ts';

describe('PostgreSQL integer aggregate JSON conversion', () => {
	it('preserves signed totals wider than an entry quantity and safe integer boundaries', () => {
		expect(databaseInteger('4294967294')).toBe(4_294_967_294);
		expect(databaseInteger('-4294967294')).toBe(-4_294_967_294);
		expect(databaseInteger(BigInt(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER);
		expect(databaseInteger(String(Number.MIN_SAFE_INTEGER))).toBe(Number.MIN_SAFE_INTEGER);
		expect(databaseInteger(0)).toBe(0);
	});

	it.each([
		'9007199254740992',
		'-9007199254740992',
		9_007_199_254_740_992n,
		Number.MAX_SAFE_INTEGER + 1,
		'1.5',
		'1e3',
		'',
		null,
		undefined,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		1.5
	])('rejects unsafe or noninteger database values without rounding: %s', (value) => {
		expect(() => databaseInteger(value)).toThrow(DatabaseIntegerRangeError);
	});
});
