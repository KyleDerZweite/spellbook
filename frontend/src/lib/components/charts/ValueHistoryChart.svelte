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
	const bottom = $derived(expanded ? 288 : 196);
	const height = $derived(bottom + 34);
	const chart = $derived(historyChart(points));
	const observations = $derived(chart.segments.flat());
	const selectedIndex = $derived(
		selected < 0 ? observations.length - 1 : Math.min(selected, observations.length - 1)
	);
	const current = $derived(observations[selectedIndex]?.point);
	const currentObservation = $derived(observations[selectedIndex]);
	const right = $derived(Math.max(260, width) - 16);
	const x = $derived(
		scaleUtc()
			.domain([new Date(`${from}T00:00:00Z`), new Date(`${to}T00:00:00Z`)])
			.range([62, right])
	);
	const relative = $derived(chart.axis.upper > BigInt(Number.MAX_SAFE_INTEGER));
	const fraction = (value: bigint) =>
		Number(((value - chart.axis.lower) * 1_000_000n) / (chart.axis.upper - chart.axis.lower)) /
		1_000_000;
	const y = $derived(scaleLinear().domain([0, 1]).range([bottom, 56]));
	const currentX = $derived(current ? x(new Date(`${current.day}T00:00:00Z`)) : 62);
	const calloutLeft = $derived(Math.max(62, Math.min(right - 176, currentX - 88)));
	const position = (observation: (typeof observations)[number]) => y(fraction(observation.value));
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
	const tickLabel = (tick: bigint) =>
		relative
			? `${Math.round(fraction(tick) * 100)}%`
			: formatValueEUR(`${tick / 100n}.${(tick % 100n).toString().padStart(2, '0')}`);
	const dateLabel = new Intl.DateTimeFormat('en-GB', {
		day: 'numeric',
		month: 'short',
		timeZone: 'UTC'
	});
</script>

<div class="history-chart" bind:clientWidth={width}>
	{#if current}
		<div
			class="history-callout"
			style:left={`clamp(0px, ${(calloutLeft / Math.max(260, width)) * 100}%, calc(100% - 176px))`}
			aria-hidden="true"
		>
			<span>{dateLabel.format(new Date(`${current.day}T00:00:00Z`))}</span>
			<strong>{formatValueEUR(current.estimate.coveredValue)}</strong>
		</div>
	{/if}
	<svg
		viewBox={`0 0 ${Math.max(260, width)} ${height}`}
		style:height={`${height}px`}
		onpointermove={inspect}
		onpointerdown={inspect}
		role="img"
		aria-label="Covered value history with an adaptive value axis. Exact values and coverage are available below."
	>
		{#each chart.axis.ticks as tick}
			<line x1="62" x2={right} y1={y(fraction(tick))} y2={y(fraction(tick))} class="grid-line" />
			<text x="54" y={y(fraction(tick)) + 4} text-anchor="end">{tickLabel(tick)}</text>
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
				y1="48"
				y2={bottom + 4}
				class="cursor-line"
			/>
			{#if currentObservation}
				<circle cx={currentX} cy={position(currentObservation)} r="8" class="cursor-halo" />
				<circle cx={currentX} cy={position(currentObservation)} r="4" class="cursor-point" />
			{/if}
		{/if}
		<text x="62" y={height - 6}>{dateLabel.format(new Date(`${from}T00:00:00Z`))}</text>
		<text x={right} y={height - 6} text-anchor="end"
			>{dateLabel.format(new Date(`${to}T00:00:00Z`))}</text
		>
	</svg>
	{#if relative}<p class="history-inspect">
			Axis shows position within the captured value range. Inspect a day for its exact amount.
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
		position: relative;
	}
	.history-callout {
		position: absolute;
		top: 0;
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
		width: 176px;
		max-width: calc(100% - 62px);
		padding: 0.55rem 0.65rem;
		border: 1px solid var(--color-border);
		border-radius: 0.65rem;
		background: var(--color-surface);
		font-size: 0.6875rem;
		color: var(--color-text-secondary);
		pointer-events: none;
	}
	.history-callout strong {
		color: var(--color-text-primary);
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		overflow-wrap: anywhere;
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
		stroke-dasharray: 3 6;
		opacity: 0.6;
	}
	.value-area {
		fill: var(--color-chart-primary);
		opacity: 0.1;
	}
	.value-line {
		stroke: var(--color-chart-primary);
		stroke-width: 2.5;
		stroke-linejoin: round;
		stroke-linecap: round;
	}
	.cursor-line {
		stroke: var(--color-chart-primary);
		stroke-dasharray: 3 4;
		opacity: 0.7;
	}
	.cursor-halo {
		fill: var(--color-chart-primary);
		fill-opacity: 0.2;
	}
	.cursor-point {
		fill: var(--color-chart-primary);
		stroke: var(--color-card);
		stroke-width: 2.5;
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
		padding-top: 0.75rem;
		border-top: 1px solid var(--color-border);
	}
	.history-readout strong {
		color: var(--color-text-primary);
		font-weight: 500;
		overflow-wrap: anywhere;
		min-width: 0;
	}
</style>
