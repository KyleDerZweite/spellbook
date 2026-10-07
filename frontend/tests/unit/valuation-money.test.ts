import { describe, it, expect } from 'vitest';
import { formatReferenceEUR } from '#lib/valuation/money.ts';
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
