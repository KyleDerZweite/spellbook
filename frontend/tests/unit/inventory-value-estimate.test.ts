import { describe, expect, it } from 'vitest';
import { valueEstimate } from '@spellbook/backend/valuation/estimate.ts';
import type { PriceReference } from '@spellbook/contracts/valuation.ts';
function known(amount: string, freshness: 'Fresh' | 'Stale' = 'Fresh'): PriceReference {
	return {
		printingId: 'test',
		finish: 'nonfoil',
		links: [],
		kind: 'Known',
		amount,
		currency: 'EUR',
		source: 'Scryfall',
		measure: 'prices.eur',
		sourceTime: '2026-10-08T00:00:00Z',
		timePrecision: 'Instant',
		freshness,
		publicationId: 'p',
		observationId: 'o',
		matchedPrintingId: 'test',
		matchedFinish: 'nonfoil',
		provenance: 'Exact'
	};
}
describe('exact value estimates', () => {
	it('sums exact products before rounding and counts stale as covered', () => {
		expect(
			valueEstimate([
				{ quantity: 3, reference: known('0.005') },
				{ quantity: 1, reference: known('0.005', 'Stale') },
				{
					quantity: 2,
					reference: {
						printingId: 'u',
						finish: 'nonfoil',
						links: [],
						kind: 'Unknown',
						reason: 'AmountMissing'
					}
				}
			])
		).toEqual({
			currency: 'EUR',
			coveredValue: '0.02',
			coveredQuantity: 4,
			staleQuantity: 1,
			unknownQuantity: 2,
			totalQuantity: 6,
			complete: false
		});
	});
	it('keeps empty and known zero complete', () => {
		expect(valueEstimate([])).toMatchObject({
			coveredValue: '0.00',
			totalQuantity: 0,
			complete: true
		});
		expect(valueEstimate([{ quantity: 3, reference: known('0') }])).toMatchObject({
			coveredValue: '0.00',
			coveredQuantity: 3,
			complete: true
		});
	});
	it('rejects unsafe quantities and excessive decimal input before arithmetic', () => {
		expect(() =>
			valueEstimate([
				{ quantity: Number.MAX_SAFE_INTEGER, reference: known('1') },
				{ quantity: 1, reference: known('1') }
			])
		).toThrow();
		expect(() => valueEstimate([{ quantity: 1, reference: known('1'.repeat(129)) }])).toThrow();
		expect(() => valueEstimate([{ quantity: -1, reference: known('1') }])).toThrow();
	});
});
