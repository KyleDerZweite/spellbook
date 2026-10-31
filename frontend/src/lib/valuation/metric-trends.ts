import type { InventoryValueHistory } from '@spellbook/contracts/inventory-value.ts';
import { hasPlottableValue } from './history-chart.ts';
import { formatValueEUR } from './money.ts';
export type MetricKey = 'value' | 'total' | 'names' | 'sets' | 'decks';
export function metricTrend(history: InventoryValueHistory | null, key: MetricKey) {
	if (!history) return { points: [], delta: null, captured: 0, partial: false, from: '', to: '' };
	const to = history.window.to;
	const points = Array.from({ length: 7 }, (_, index) => {
		const day = new Date(to + 'T00:00:00Z');
		day.setUTCDate(day.getUTCDate() - 6 + index);
		const label = day.toISOString().slice(0, 10);
		const point = history.points.find((p) => p.day === label);
		let value: bigint | null = null;
		if (point?.kind === 'Captured') {
			if (key === 'value' && hasPlottableValue(point.estimate))
				value = BigInt(point.estimate.coveredValue.replace('.', ''));
			else if (key !== 'value' && point.totals?.[key] !== null && point.totals?.[key] !== undefined)
				value = BigInt(point.totals[key]!);
		}
		return {
			day: label,
			value,
			partial: key === 'value' && point?.kind === 'Captured' && !point.estimate.complete
		};
	});
	const first = points[0].value,
		last = points[6].value;
	return {
		points,
		delta: first !== null && last !== null ? last - first : null,
		captured: points.filter((p) => p.value !== null).length,
		partial: points.some((p) => p.partial),
		from: points[0].day,
		to
	};
}
export function metricChange(value: bigint, currency = false) {
	const absolute = value < 0n ? -value : value;
	const amount = currency
		? formatValueEUR(`${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`)
		: absolute.toLocaleString();
	return `${value > 0n ? '+' : value < 0n ? '−' : ''}${amount}`;
}
