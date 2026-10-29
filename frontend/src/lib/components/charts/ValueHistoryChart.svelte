<script lang="ts">
	import { scaleLinear, scaleUtc } from 'd3-scale';
	import { line } from 'd3-shape';
	import type { InventoryValueHistoryPoint } from '@spellbook/contracts/inventory-value.ts';
	import { historyChart, observationTime } from '#lib/valuation/history-chart.ts';
	import { formatValueEUR } from '#lib/valuation/money.ts';
	let { points, from, to }: { points: InventoryValueHistoryPoint[]; from: string; to: string } =
		$props();
	let width = $state(640);
	let selected = $state(0);
	const chart = $derived(historyChart(points));
	const observations = $derived(chart.segments.flat());
	const current = $derived(observations[Math.min(selected, observations.length - 1)]?.point);
	const right = $derived(Math.max(260, width) - 16);
	const x = $derived(
		scaleUtc()
			.domain([new Date(`${from}T00:00:00Z`), new Date(`${to}T00:00:00Z`)])
			.range([62, right])
	);
	const relative = $derived(chart.maximum > BigInt(Number.MAX_SAFE_INTEGER));
	const factor = $derived(relative ? 10000 : Number(chart.maximum));
	const ceiling = $derived(relative ? 10000 : Math.max(100, Number(chart.maximum)));
	const y = $derived(scaleLinear().domain([0, ceiling]).nice(4).range([174, 22]));
	const position = (observation: (typeof observations)[number]) =>
		y(((148 - observation.y) / 120) * factor);
	const path = $derived(
		line<(typeof observations)[number]>()
			.x(({ point }) => x(new Date(`${point.day}T00:00:00Z`)))
			.y(position)
	);
	const tickLabel = (tick: number) =>
		relative ? `${tick / 100}%` : formatValueEUR((tick / 100).toFixed(2));
	const dateLabel = new Intl.DateTimeFormat('en-GB', {
		day: 'numeric',
		month: 'short',
		timeZone: 'UTC'
	});
</script>

<div class="history-chart" bind:clientWidth={width}>
	<svg
		viewBox={`0 0 ${Math.max(260, width)} 208`}
		role="img"
		aria-label="Covered value history. Exact values and coverage are available below."
	>
		{#each y.ticks(4) as tick}
			<line x1="62" x2={right} y1={y(tick)} y2={y(tick)} class="grid-line" />
			<text x="54" y={y(tick) + 4} text-anchor="end">{tickLabel(tick)}</text>
		{/each}
		{#each chart.segments as segment}
			<path d={path(segment) ?? ''} fill="none" class="value-line" />
			{#each segment as observation}
				<circle
					cx={x(new Date(`${observation.point.day}T00:00:00Z`))}
					cy={position(observation)}
					r="3.5"
					stroke="var(--color-chart-primary)"
					stroke-width="2"
					fill={observation.point.estimate.complete
						? 'var(--color-chart-primary)'
						: 'var(--color-card)'}
				>
					<title
						>{observation.point.day}: {formatValueEUR(
							observation.point.estimate.coveredValue
						)}</title
					>
				</circle>
			{/each}
		{/each}
		{#if current}
			<line
				x1={x(new Date(`${current.day}T00:00:00Z`))}
				x2={x(new Date(`${current.day}T00:00:00Z`))}
				y1="16"
				y2="178"
				class="cursor-line"
			/>
		{/if}
		<text x="62" y="202">{dateLabel.format(new Date(`${from}T00:00:00Z`))}</text>
		<text x={right} y="202" text-anchor="end">{dateLabel.format(new Date(`${to}T00:00:00Z`))}</text>
	</svg>
	{#if relative}<p class="history-inspect">
			Axis shows a percentage of the highest captured covered value.
		</p>{/if}
	{#if current}
		<label class="history-inspect"
			>Inspect observation
			<input
				type="range"
				min="0"
				max={Math.max(0, observations.length - 1)}
				step="1"
				bind:value={selected}
				aria-label="History observation"
			/>
		</label>
		<p class="history-readout" aria-live="polite">
			<time datetime={current.observedAt}>{current.day}</time><strong
				>{formatValueEUR(current.estimate.coveredValue)}</strong
			><span
				>{current.estimate.coveredQuantity} / {current.estimate.totalQuantity} copies covered · {current
					.estimate.complete
					? 'complete'
					: 'partial'}</span
			><span>{observationTime(current.observedAt, current.timezone)} ({current.timezone})</span>
		</p>
	{/if}
</div>

<style>
	.history-chart {
		min-width: 0;
	}
	svg {
		display: block;
		width: 100%;
		overflow: visible;
	}
	text {
		fill: var(--color-text-muted);
		font-family: var(--font-body);
		font-size: 10px;
	}
	.grid-line {
		stroke: var(--color-border);
		stroke-dasharray: 2 4;
	}
	.value-line {
		stroke: var(--color-chart-primary);
		stroke-width: 2;
		stroke-linejoin: round;
		stroke-linecap: round;
	}
	.cursor-line {
		stroke: var(--color-text-muted);
		stroke-dasharray: 3 4;
		opacity: 0.5;
	}
	.history-inspect {
		display: flex;
		gap: 1rem;
		align-items: center;
		font-size: 0.7rem;
		color: var(--color-text-secondary);
	}
	input {
		min-width: 0;
		flex: 1;
		accent-color: var(--color-chart-primary);
		height: 44px;
	}
	.history-readout {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.4rem 1rem;
		font-size: 0.7rem;
		color: var(--color-text-secondary);
	}
	.history-readout strong {
		color: var(--color-text-primary);
		font-weight: 500;
	}
</style>
