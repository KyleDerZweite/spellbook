import { describe, it, expect } from 'vitest';
import { formatReferenceEUR } from '#lib/valuation/money.ts';
describe('exact displayed reference money', () => {
	it('multiplies before half-up display rounding', () => {
		expect(formatReferenceEUR('0.005', 3)).toContain('0.02');
		expect(formatReferenceEUR('0', 2147483647)).toContain('0.00');
		expect(formatReferenceEUR('9007199254740993.005', 1)).toContain('9,007,199,254,740,993.01');
	});
});
