import { describe, expect, it } from 'vitest';
import {
	assertCondition,
	assertDeckOperation,
	assertFinish,
	assertInventoryOperation,
	assertRequestId
} from '../../src/lib/server/mtg/validation';

describe('MTG validation helpers', () => {
	it.each([assertInventoryOperation, assertDeckOperation])(
		'rejects nonpositive decrements',
		(validate) => {
			for (const quantity of [-3, 0, NaN, Infinity])
				expect(() =>
					validate({
						op: 'decrement',
						target: { entryId: '11111111-1111-1111-1111-111111111111' },
						quantity
					})
				).toThrow();
			expect(
				validate({
					op: 'decrement',
					target: { entryId: '11111111-1111-1111-1111-111111111111' },
					quantity: 3
				})
			).toMatchObject({ quantity: 3 });
		}
	);
	it('validates deck role moves', () => {
		expect(
			assertDeckOperation({
				op: 'move',
				target: { entryId: '11111111-1111-1111-1111-111111111111' },
				role: 'sideboard'
			})
		).toMatchObject({ role: 'sideboard' });
		expect(() =>
			assertDeckOperation({
				op: 'move',
				target: { entryId: '11111111-1111-1111-1111-111111111111' },
				role: 'invalid'
			})
		).toThrow('Invalid role');
	});

	it('rejects invalid inventory operations', () => {
		expect(() => assertInventoryOperation({ op: 'replace' })).toThrow('Invalid operation');
	});

	it('preserves omitted versus empty inventory notes', () => {
		expect(
			assertInventoryOperation({
				op: 'set',
				target: { entryId: '11111111-1111-1111-1111-111111111111' },
				quantity: 1
			})
		).not.toHaveProperty('notes');
		expect(
			assertInventoryOperation({
				op: 'set',
				target: { entryId: '11111111-1111-1111-1111-111111111111' },
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
