import { describe, expect, it } from 'vitest';
import type {
	InventoryValueHistoryPoint,
	ValueEstimate
} from '@spellbook/contracts/inventory-value.ts';
import {
	estimateLabel,
	hasPlottableValue,
	historyChart,
	observationTime
} from '#lib/valuation/history-chart.ts';
import { formatValueEUR } from '#lib/valuation/money.ts';

function captured(day: string, overrides: Partial<ValueEstimate> = {}): InventoryValueHistoryPoint {
	return {
		kind: 'Captured',
		day,
		timezone: 'Europe/Berlin',
		dayStart: day + 'T00:00:00Z',
		dayEnd: day + 'T23:00:00Z',
		observedAt: day + 'T21:59:30Z',
		estimate: {
			currency: 'EUR',
			coveredValue: '12.50',
			coveredQuantity: 2,
			staleQuantity: 0,
			unknownQuantity: 0,
			totalQuantity: 2,
			complete: true,
			...overrides
		}
	};
}

describe('personal Inventory history presentation', () => {
	it('breaks lines at explicit gaps, wholly unknown observations and absent dates', () => {
		const chart = historyChart([
			captured('2026-10-01'),
			{ kind: 'Gap', day: '2026-10-02' },
			captured('2026-10-03'),
			captured('2026-10-04', {
				coveredValue: '0.00',
				coveredQuantity: 0,
				unknownQuantity: 2,
				complete: false
			}),
			captured('2026-10-05'),
			captured('2026-10-07')
		]);
		expect(chart.segments.map((segment) => segment.map(({ point }) => point.day))).toEqual([
			['2026-10-01'],
			['2026-10-03'],
			['2026-10-05'],
			['2026-10-07']
		]);
	});
	it('plots captured empty holdings as known zero and preserves partial coverage', () => {
		const chart = historyChart([
			captured('2026-10-01', { coveredValue: '0.00', totalQuantity: 0, coveredQuantity: 0 }),
			captured('2026-10-02', { unknownQuantity: 1, totalQuantity: 3, complete: false })
		]);
		expect(chart.segments).toHaveLength(1);
		expect(chart.segments[0][0].y).toBe(148);
		const partial = chart.segments[0][1].point.estimate;
		expect(estimateLabel(partial)).toBe('Covered value');
		expect(hasPlottableValue(partial)).toBe(true);
		expect(estimateLabel(chart.segments[0][0].point.estimate)).toBe('Market value estimate');
	});
	it('normalizes arbitrary exact amounts without losing or overflowing display values', () => {
		const amount = '9'.repeat(144) + '.99';
		const chart = historyChart([
			captured('2026-10-01', { coveredValue: amount }),
			captured('2026-10-02', { coveredValue: '0.01' })
		]);
		expect(chart.segments[0].map(({ y }) => y)).toEqual([28, 148]);
		expect(formatValueEUR(amount)).toContain('.99');
	});
	it('handles empty and single-day windows without invalid coordinates', () => {
		expect(historyChart([]).segments).toEqual([]);
		expect(historyChart([captured('2026-10-01')]).segments[0][0].x).toBe(320);
	});
	it('shows the actual observation clock in its saved calendar across DST changes', () => {
		expect(observationTime('2026-10-24T21:59:30Z', 'Europe/Berlin')).toContain('23:59:30');
		expect(observationTime('2026-10-25T22:59:30Z', 'Europe/Berlin')).toContain('23:59:30');
	});
});
