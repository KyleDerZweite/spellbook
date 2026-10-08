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
			point
		});
	}
	return { segments, maximum };
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
