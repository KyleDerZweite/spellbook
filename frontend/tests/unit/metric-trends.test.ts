import { describe, expect, it } from 'vitest';
import type {
	InventoryValueHistory,
	InventoryValueHistoryPoint
} from '@spellbook/contracts/inventory-value.ts';
import { metricTrend, metricChange } from '#lib/valuation/metric-trends.ts';
function history(points: InventoryValueHistoryPoint[]): InventoryValueHistory {
	return {
		asOf: '2026-10-31T10:00:00Z',
		timezone: 'Europe/Berlin',
		nextDayBoundary: '',
		nextRefreshAt: '',
		identity: null,
		window: { from: '2026-10-01', to: '2026-10-30', days: 30 },
		points
	};
}
function captured(
	day: string,
	total: number,
	amount = '1.00',
	decks: number | null = null
): InventoryValueHistoryPoint {
	return {
		kind: 'Captured',
		day,
		timezone: 'Europe/Berlin',
		dayStart: '',
		dayEnd: '',
		observedAt: '',
		estimate: {
			currency: 'EUR',
			coveredValue: amount,
			coveredQuantity: total,
			unknownQuantity: 0,
			staleQuantity: 0,
			totalQuantity: total,
			complete: true
		},
		totals: { total, names: total, sets: total ? 1 : 0, decks }
	};
}
describe('daily metric trends', () => {
	it('uses the last seven closed reporting dates and the actual endpoints', () => {
		const r = metricTrend(
			history([captured('2026-10-23', 100), captured('2026-10-24', 4), captured('2026-10-30', 9)]),
			'total'
		);
		expect(r.points).toHaveLength(7);
		expect(r.from).toBe('2026-10-24');
		expect(r.delta).toBe(5n);
		expect(r.captured).toBe(2);
		expect(r.points[1].value).toBeNull();
	});
	it('does not invent legacy Deck counts or a missing comparison', () => {
		const h = history([captured('2026-10-24', 4), captured('2026-10-30', 9, '1.00', 5)]);
		expect(metricTrend(h, 'decks').delta).toBeNull();
		expect(metricTrend(h, 'decks').captured).toBe(1);
		expect(metricTrend(history([captured('2026-10-30', 9)]), 'total').delta).toBeNull();
	});
	it('preserves actual zeroes and exact currency beyond JavaScript number precision', () => {
		const h = history([
			captured('2026-10-24', 0, '9007199254740993.01'),
			captured('2026-10-30', 0, '9007199254740993.03')
		]);
		expect(metricTrend(h, 'value').delta).toBe(2n);
		expect(metricTrend(h, 'total').delta).toBe(0n);
		expect(metricChange(-2n, true)).toBe('−€0.02');
	});
	it('does not turn wholly unknown prices or filtered totals into zero trends', () => {
		const first = captured('2026-10-24', 2);
		if (first.kind === 'Captured') {
			first.estimate.coveredQuantity = 0;
			first.estimate.unknownQuantity = 2;
			first.totals = null;
		}
		const h = history([first, captured('2026-10-30', 3)]);
		expect(metricTrend(h, 'value').delta).toBeNull();
		expect(metricTrend(h, 'total').delta).toBeNull();
		expect(metricTrend(null, 'value').points).toEqual([]);
	});
	it('marks historical partial coverage independently of the current estimate', () => {
		const first = captured('2026-10-24', 2);
		if (first.kind === 'Captured') {
			first.estimate.complete = false;
			first.estimate.coveredQuantity = 1;
			first.estimate.unknownQuantity = 1;
		}
		const h = history([first, captured('2026-10-30', 3, '2.00')]);
		expect(metricTrend(h, 'value').delta).toBe(100n);
		expect(metricTrend(h, 'value').partial).toBe(true);
		expect(metricTrend(h, 'total').partial).toBe(false);
	});
});
