export class DatabaseIntegerRangeError extends Error {
	constructor() {
		super('Stored integer cannot be represented as an exact JSON number.');
	}
}

/** Decode exact PostgreSQL integer/numeric aggregates without rounding. */
export function databaseInteger(value: unknown): number {
	if (typeof value === 'number') {
		if (Number.isSafeInteger(value)) return value;
		throw new DatabaseIntegerRangeError();
	}
	if ((typeof value !== 'string' || !/^-?\d+$/.test(value)) && typeof value !== 'bigint')
		throw new DatabaseIntegerRangeError();
	const integer = BigInt(value);
	if (integer < BigInt(Number.MIN_SAFE_INTEGER) || integer > BigInt(Number.MAX_SAFE_INTEGER))
		throw new DatabaseIntegerRangeError();
	return Number(integer);
}
