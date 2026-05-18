import { describe, expect, it } from 'vitest';
import {
	assertCondition,
	assertDeckOperation,
	assertFinish,
	assertInventoryOperation,
	assertRequestId
} from '../../src/lib/server/mtg/validation';

describe('MTG validation helpers', () => {
	it('rejects invalid inventory operations', () => {
		expect(() => assertInventoryOperation({ op: 'replace' })).toThrow('Invalid operation');
	});

	it('preserves omitted versus empty inventory notes', () => {
		expect(
			assertInventoryOperation({ op: 'set', target: { entryId: 'entry' }, quantity: 1 })
		).not.toHaveProperty('notes');
		expect(
			assertInventoryOperation({
				op: 'set',
				target: { entryId: 'entry' },
				quantity: 1,
				notes: ''
			})
		).toMatchObject({ notes: '' });
	});

	it('rejects missing requestId', () => {
		expect(() => assertRequestId('')).toThrow('requestId is required');
	});

	it('rejects invalid finish', () => {
		expect(() => assertFinish('etched')).toThrow('Invalid finish');
	});

	it('rejects invalid condition', () => {
		expect(() => assertCondition('mint')).toThrow('Invalid condition');
	});

	it('rejects invalid deck role', () => {
		expect(() =>
			assertDeckOperation({
				op: 'add',
				card: {
					catalogCardId: 'card',
					canonicalCardId: 'oracle',
					name: 'Opt',
					setCode: 'sta',
					imageUri: ''
				},
				quantity: 1,
				role: 'maybe'
			})
		).toThrow('Invalid role');
	});
});
