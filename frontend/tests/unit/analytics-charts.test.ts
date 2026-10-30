import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import ProportionChart from '#lib/components/charts/ProportionChart.svelte';
import DeckAvailabilityRing from '#lib/components/charts/DeckAvailabilityRing.svelte';
import ValueSummary from '#lib/components/valuation/ValueSummary.svelte';
import ValueHistoryChart from '#lib/components/charts/ValueHistoryChart.svelte';
import type { InventoryValueHistoryPoint } from '@spellbook/contracts/inventory-value.ts';

function captured(day: string, value: string, covered = 1): InventoryValueHistoryPoint {
	return {
		kind: 'Captured',
		day,
		timezone: 'Europe/Berlin',
		dayStart: `${day}T00:00:00Z`,
		dayEnd: `${day}T23:00:00Z`,
		observedAt: `${day}T22:59:00Z`,
		estimate: {
			currency: 'EUR',
			coveredValue: value,
			coveredQuantity: covered,
			staleQuantity: 0,
			unknownQuantity: 1 - covered,
			totalQuantity: 1,
			complete: covered === 1
		}
	};
}

describe('shared analytics charts', () => {
	it('keeps exact counts and shares accessible without JavaScript, including zero', async () => {
		const { body } = await render(ProportionChart, {
			props: {
				label: 'Copies by set',
				items: [
					{ label: 'NEC', value: 71, color: 'blue' },
					{ label: 'NEO', value: 0, color: 'violet' },
					{ label: 'Other', value: 29, color: 'gray' }
				]
			}
		});
		expect(body).toContain('NEC: 71 copies, 71%');
		expect(body).toContain('<dt>NEO</dt>');
		expect(body).toContain('0 copies · 0%');
		expect(body).toContain('100 copies');
		expect(body).not.toMatch(/NaN|Infinity/);
	});
	it('renders separate paths across missing and unknown observations and retains exact readouts', async () => {
		const { body } = await render(ValueHistoryChart, {
			props: {
				from: '2026-10-01',
				to: '2026-10-05',
				points: [
					captured('2026-10-01', '12.50'),
					captured('2026-10-02', '13.25'),
					{ kind: 'Gap', day: '2026-10-03' },
					captured('2026-10-04', '0.00', 0),
					captured('2026-10-05', '15.75')
				]
			}
		});
		expect(body.match(/class="value-line /g)).toHaveLength(2);
		expect(body).toContain('€12.50');
		expect(body).toContain('History observation');
		expect(body).not.toMatch(/NaN|Infinity/);
	});
	it('supports a known zero and arbitrary exact amounts without converting them to floating point', async () => {
		for (const value of ['0.00', '9'.repeat(144) + '.99']) {
			const { body } = await render(ValueHistoryChart, {
				props: { from: '2026-10-01', to: '2026-10-01', points: [captured('2026-10-01', value)] }
			});
			expect(body).not.toMatch(/NaN|Infinity/);
			expect(body).toContain(value === '0.00' ? '€0.00' : '.99');
		}
	});
});

describe('compact collection composition', () => {
	it('does not round an incomplete Deck to complete availability', async () => {
		const { body } = await render(DeckAvailabilityRing, {
			props: {
				deck: {
					id: 'deck',
					name: 'Nearly complete',
					format: 'Commander',
					required: 1000,
					exact: 999,
					alternate: 0,
					missing: 1,
					commanders: []
				}
			}
		});
		expect(body).toContain('999');
		expect(body.replace(/<[^>]*>/g, '').replace(/\s+/g, '')).toContain(
			`999/${(1000).toLocaleString()}`
		);
		expect(body).toContain('Missing: 1 copy');
		expect(body).toContain('999 exact, 0 alternate, 1 missing');
	});
	it('exposes all finish quantities including zero without inventing a ring segment', async () => {
		const { body } = await render(ProportionChart, {
			props: {
				label: 'Owned copies by finish',
				kind: 'bar',
				items: [
					{ label: 'Nonfoil', value: 0, color: 'blue' },
					{ label: 'Foil', value: 0, color: 'violet' }
				]
			}
		});
		expect(body).toContain('0 copies');
		expect(body).toContain('<dt>Nonfoil</dt>');
		expect(body).toContain('0 copies · 0%');
		expect(body).not.toContain('<path');
		expect(body).not.toMatch(/NaN|Infinity/);
	});
	it('retains known and unknown coverage in a compact current estimate', async () => {
		const { body } = await render(ValueSummary, {
			props: {
				compact: true,
				estimate: {
					currency: 'EUR',
					coveredValue: '0.00',
					coveredQuantity: 0,
					staleQuantity: 0,
					unknownQuantity: 101,
					totalQuantity: 101,
					complete: false
				}
			}
		});
		expect(body).toContain('Unknown');
		expect(body).toContain('101 unknown');
		expect(body).toContain('Coverage details');
		expect(body).toContain('Copies with known price references');
		expect(body).not.toContain('€0.00');
	});
	it('keeps a captured empty inventory as a known zero rather than unknown', async () => {
		const { body } = await render(ValueSummary, {
			props: {
				compact: true,
				estimate: {
					currency: 'EUR',
					coveredValue: '0.00',
					coveredQuantity: 0,
					staleQuantity: 0,
					unknownQuantity: 0,
					totalQuantity: 0,
					complete: true
				}
			}
		});
		expect(body).toContain('€0.00');
		expect(body).not.toContain('>Unknown<');
		expect(body).not.toContain('<progress');
	});
});
