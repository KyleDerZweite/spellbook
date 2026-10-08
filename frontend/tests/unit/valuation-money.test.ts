import { describe, it, expect } from 'vitest';
import { formatReferenceEUR, formatValueEUR } from '#lib/valuation/money.ts';
describe('exact displayed reference money', () => {
	it('multiplies before half-up display rounding', () => {
		expect(formatReferenceEUR('0.005', 3)).toContain('0.02');
		expect(formatReferenceEUR('0', 2147483647)).toContain('0.00');
		expect(formatReferenceEUR('9007199254740993.005', 1)).toContain('9,007,199,254,740,993.01');
	});

	it('rejects excessive literals and fractional scales before exact arithmetic', () => {
		expect(() => formatReferenceEUR('1'.repeat(129))).toThrow();
		expect(() => formatReferenceEUR('0.' + '1'.repeat(19))).toThrow();
	});
});

describe('exact displayed value subtotals', () => {
	it('displays aggregates above the source-price size limit without numeric conversion', () => {
		const source = '9'.repeat(128);
		const cents = BigInt(source) * BigInt(Number.MAX_SAFE_INTEGER) * 100n;
		const subtotal = `${cents / 100n}.00`;
		expect(subtotal.length).toBeGreaterThan(128);
		expect(formatValueEUR(subtotal)).toBe(formatReferenceEUR(source, Number.MAX_SAFE_INTEGER));
		expect(formatValueEUR('9007199254740993.01')).toContain('9,007,199,254,740,993.01');
		expect(formatValueEUR('0.00')).toContain('0.00');
	});
	it('requires bounded nonnegative ordinary already-rounded amounts', () => {
		for (const amount of [
			'1',
			'1.0',
			'1.001',
			'-1.00',
			'+1.00',
			'01.00',
			'1e2',
			'Infinity',
			' 1.00',
			'1.00\n',
			'9'.repeat(158) + '.99'
		]) {
			expect(() => formatValueEUR(amount), amount).toThrow();
		}
		expect(() => formatValueEUR('9'.repeat(157) + '.99')).not.toThrow();
		expect(() => formatReferenceEUR('9'.repeat(129))).toThrow();
	});
});
