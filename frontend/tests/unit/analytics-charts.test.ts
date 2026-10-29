import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import DistributionChart from '#lib/components/charts/DistributionChart.svelte';
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
		const { body } = await render(DistributionChart, {
			props: {
				label: 'Copies by set',
				items: [
					{ label: 'NEC', value: 71, share: 0.71 },
					{ label: 'NEO', value: 0, share: 0 }
				]
			}
		});
		expect(body).toContain('NEC: 71 copies, 71%');
		expect(body).toContain('NEO: 0 copies, 0%');
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
