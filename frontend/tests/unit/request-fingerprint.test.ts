import { describe, expect, it } from 'vitest';
import {
	mutationFingerprint,
	RequestConflictError
} from '../../src/lib/server/data/request-fingerprint';
import { ValidationError } from '../../src/lib/server/mtg/validation';

describe('mutation request fingerprints', () => {
	it('ignores property order recursively', () => {
		expect(
			mutationFingerprint({
				game: 'mtg',
				operations: [{ quantity: 2, target: { role: 'main', card: 'a' } }]
			})
		).toBe(
			mutationFingerprint({
				operations: [{ target: { card: 'a', role: 'main' }, quantity: 2 }],
				game: 'mtg'
			})
		);
	});
	it('distinguishes operation order, values, and operation kinds', () => {
		const first = { op: 'set', quantity: 2 };
		const second = { op: 'decrement', quantity: 1 };
		expect(mutationFingerprint([first, second])).not.toBe(mutationFingerprint([second, first]));
		expect(mutationFingerprint(first)).not.toBe(mutationFingerprint({ ...first, quantity: 3 }));
		expect(mutationFingerprint({ kind: 'import', operations: [first] })).not.toBe(
			mutationFingerprint({ kind: 'bulk', operations: [first] })
		);
	});
	it('provides a distinct validation error for conflicting request IDs', () => {
		const error = new RequestConflictError();
		expect(error).toBeInstanceOf(ValidationError);
		expect(error.name).toBe('RequestConflictError');
	});
});
