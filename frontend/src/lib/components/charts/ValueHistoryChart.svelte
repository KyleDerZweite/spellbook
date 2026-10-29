<script lang="ts">
	import { scaleLinear, scaleUtc } from 'd3-scale';
	import { area, line } from 'd3-shape';
	import type { InventoryValueHistoryPoint } from '@spellbook/contracts/inventory-value.ts';
	import { historyChart } from '#lib/valuation/history-chart.ts';
	import { formatValueEUR } from '#lib/valuation/money.ts';
	let {
		points,
		from,
		to,
		expanded = false
	}: {
		points: InventoryValueHistoryPoint[];
		from: string;
		to: string;
		expanded?: boolean;
	} = $props();
	let width = $state(640);
	let selected = $state(-1);
	const bottom = $derived(expanded ? 258 : 174);
	const height = $derived(bottom + 34);
	const chart = $derived(historyChart(points));
	const observations = $derived(chart.segments.flat());
	const selectedIndex = $derived(
		selected < 0 ? observations.length - 1 : Math.min(selected, observations.length - 1)
	);
	const current = $derived(observations[selectedIndex]?.point);
	const right = $derived(Math.max(260, width) - 16);
	const x = $derived(
		scaleUtc()
			.domain([new Date(`${from}T00:00:00Z`), new Date(`${to}T00:00:00Z`)])
			.range([62, right])
	);
	const relative = $derived(chart.maximum > BigInt(Number.MAX_SAFE_INTEGER));
	const factor = $derived(relative ? 10000 : Number(chart.maximum));
	const ceiling = $derived(relative ? 10000 : Math.max(100, Number(chart.maximum)));
	const y = $derived(scaleLinear().domain([0, ceiling]).nice(4).range([bottom, 22]));
	const position = (observation: (typeof observations)[number]) =>
		y(((148 - observation.y) / 120) * factor);
	const path = $derived(
		line<(typeof observations)[number]>()
			.x(({ point }) => x(new Date(`${point.day}T00:00:00Z`)))
			.y(position)
	);
	const fillPath = $derived(
		area<(typeof observations)[number]>()
			.x(({ point }) => x(new Date(`${point.day}T00:00:00Z`)))
			.y0(bottom)
			.y1(position)
	);
	function inspect(event: PointerEvent) {
		const bounds =
			event.currentTarget instanceof SVGElement
				? event.currentTarget.getBoundingClientRect()
				: null;
		if (!bounds || !observations.length) return;
		const position = ((event.clientX - bounds.left) * Math.max(260, width)) / bounds.width;
		let nearest = 0;
		for (let index = 1; index < observations.length; index++) {
			if (
				Math.abs(x(new Date(`${observations[index].point.day}T00:00:00Z`)) - position) <
				Math.abs(x(new Date(`${observations[nearest].point.day}T00:00:00Z`)) - position)
			)
				nearest = index;
		}
		selected = nearest;
	}
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
		viewBox={`0 0 ${Math.max(260, width)} ${height}`}
		style:height={`${height}px`}
		onpointermove={inspect}
		onpointerdown={inspect}
		role="img"
		aria-label="Covered value history. Exact values and coverage are available below."
	>
		{#each y.ticks(4) as tick}
			<line x1="62" x2={right} y1={y(tick)} y2={y(tick)} class="grid-line" />
			<text x="54" y={y(tick) + 4} text-anchor="end">{tickLabel(tick)}</text>
		{/each}
		{#each chart.segments as segment}
			<path d={fillPath(segment) ?? ''} class="value-area" />
			<path d={path(segment) ?? ''} fill="none" class="value-line" />
			{#each segment as observation}
				<circle
					cx={x(new Date(`${observation.point.day}T00:00:00Z`))}
					cy={position(observation)}
					r={observations.length > 60 ? 1.5 : 2.5}
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
				y2={bottom + 4}
				class="cursor-line"
			/>
		{/if}
		<text x="62" y={height - 6}>{dateLabel.format(new Date(`${from}T00:00:00Z`))}</text>
		<text x={right} y={height - 6} text-anchor="end"
			>{dateLabel.format(new Date(`${to}T00:00:00Z`))}</text
		>
	</svg>
	{#if relative}<p class="history-inspect">
			Axis shows a percentage of the highest captured covered value.
		</p>{/if}
	{#if current}
		<label class="history-inspect"
			>Choose day
			<input
				type="range"
				min="0"
				max={Math.max(0, observations.length - 1)}
				step="1"
				value={selectedIndex}
				oninput={(event) => (selected = Number(event.currentTarget.value))}
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
			>
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
	.value-area {
		fill: var(--color-chart-primary);
		opacity: 0.07;
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
		font-size: 0.625rem;
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
