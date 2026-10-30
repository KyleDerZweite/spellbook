import type {
	InventoryValueHistoryPoint,
	ValueEstimate
} from '@spellbook/contracts/inventory-value.ts';

export function estimateLabel(estimate: ValueEstimate): string {
	return estimate.complete ? 'Market value estimate' : 'Covered value';
}

export function hasPlottableValue(estimate: ValueEstimate): boolean {
	return estimate.coveredQuantity > 0 || estimate.totalQuantity === 0;
}

function cents(amount: string): bigint {
	const [whole, fraction] = amount.split('.');
	return BigInt(whole) * 100n + BigInt(fraction);
}

function valueAxis(values: bigint[]) {
	const minimum = values.reduce((min, value) => (value < min ? value : min), values[0] ?? 0n);
	const maximum = values.reduce((max, value) => (value > max ? value : max), 0n);
	const padding = (maximum - minimum + 9n) / 10n || 1n;
	let lower = minimum > padding ? minimum - padding : 0n;
	let upper = maximum + padding;
	const targetStep = (upper - lower + 3n) / 4n;
	const magnitude = 10n ** BigInt(targetStep.toString().length - 1);
	const step = [1n, 2n, 5n, 10n]
		.map((factor) => factor * magnitude)
		.find((value) => value >= targetStep)!;
	lower = (lower / step) * step;
	upper = ((upper + step - 1n) / step) * step;
	const ticks: bigint[] = [];
	for (let tick = lower; tick <= upper; tick += step) ticks.push(tick);
	return { lower, upper, ticks };
}

export function historyChart(points: InventoryValueHistoryPoint[]) {
	const values = points.flatMap((point) =>
		point.kind === 'Captured' && hasPlottableValue(point.estimate)
			? [cents(point.estimate.coveredValue)]
			: []
	);
	const maximum = values.reduce((max, value) => (value > max ? value : max), 0n);
	const segments: {
		x: number;
		y: number;
		value: bigint;
		point: Extract<InventoryValueHistoryPoint, { kind: 'Captured' }>;
	}[][] = [];
	let previousDay: string | null = null;
	let active: (typeof segments)[number] | null = null;
	for (const [index, point] of points.entries()) {
		const adjacent =
			previousDay === null ||
			Date.parse(point.day + 'T00:00:00Z') - Date.parse(previousDay + 'T00:00:00Z') === 86_400_000;
		previousDay = point.day;
		if (!adjacent) active = null;
		if (point.kind === 'Gap' || !hasPlottableValue(point.estimate)) {
			active = null;
			continue;
		}
		if (!active) {
			active = [];
			segments.push(active);
		}
		const ratio =
			maximum === 0n
				? 0
				: Number((cents(point.estimate.coveredValue) * 10_000n) / maximum) / 10_000;
		active.push({
			x: points.length <= 1 ? 320 : 24 + (index * 592) / (points.length - 1),
			y: 148 - ratio * 120,
			value: cents(point.estimate.coveredValue),
			point
		});
	}
	return { segments, maximum, axis: valueAxis(values) };
}

export function observationTime(instant: string, timezone: string): string {
	return new Intl.DateTimeFormat('en-GB', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		timeZone: timezone
	}).format(new Date(instant));
}

/** Compare captured subtotals; holdings and coverage may also have changed. */
export function historyOverview(points: InventoryValueHistoryPoint[]) {
	const priced = points.filter(
		(point): point is Extract<InventoryValueHistoryPoint, { kind: 'Captured' }> =>
			point.kind === 'Captured' && hasPlottableValue(point.estimate)
	);
	const first = priced[0],
		latest = priced.at(-1);
	const change =
		first && latest && priced.length > 1
			? cents(latest.estimate.coveredValue) - cents(first.estimate.coveredValue)
			: null;
	const magnitude = change === null ? null : change < 0n ? -change : change;
	return {
		latest,
		change,
		changeAmount:
			magnitude === null
				? null
				: `${magnitude / 100n}.${(magnitude % 100n).toString().padStart(2, '0')}`,
		captured: points.filter((point) => point.kind === 'Captured').length,
		gaps: points.filter((point) => point.kind === 'Gap').length
	};
}
