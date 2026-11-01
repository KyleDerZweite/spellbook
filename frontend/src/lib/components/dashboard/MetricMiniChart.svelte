<script lang="ts">
	import { line } from 'd3-shape';
	import { metricChange, type metricTrend } from '#lib/valuation/metric-trends.ts';
	let {
		trend,
		label,
		kind = 'bars'
	}: { trend: ReturnType<typeof metricTrend>; label: string; kind?: 'bars' | 'line' } = $props();
	const values = $derived(trend.points.flatMap((p) => (p.value === null ? [] : [p.value])));
	const minimum = $derived(values.reduce((n, value) => (value < n ? value : n), values[0] ?? 0n));
	const maximum = $derived(values.reduce((n, value) => (value > n ? value : n), values[0] ?? 0n));
	const points = $derived(
		trend.points.map((point, index) => ({
			...point,
			x: 4 + index * 12,
			y:
				point.value === null
					? 40
					: kind === 'bars'
						? 40 - Number((point.value * 3400n) / (maximum || 1n)) / 100
						: maximum === minimum
							? 23
							: 40 - Number(((point.value - minimum) * 3400n) / (maximum - minimum)) / 100
		}))
	);
	const path = $derived(
		line<(typeof points)[number]>()
			.defined((point) => point.value !== null)
			.x((point) => point.x)
			.y((point) => point.y)(points)
	);
	const description = $derived(
		points
			.map(
				(point) =>
					`${point.day}: ${point.value === null ? 'unavailable' : metricChange(point.value, kind === 'line').replace(/^\+/, '')}`
			)
			.join('; ')
	);
</script>

{#if values.length}
	<svg
		class="metric-mini-chart"
		viewBox="0 0 80 44"
		role="img"
		aria-label={`${label}. ${description}`}
	>
		{#if kind === 'line'}<path
				d={path ?? ''}
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		{:else}{#each points as point}{#if point.value !== null}<rect
						x={point.x - 3}
						y={point.y}
						width="6"
						height={40 - point.y}
						rx="1"
						opacity={point.day === trend.to ? 1 : 0.45}
						><title>{point.day}: {point.value.toLocaleString()}</title></rect
					>{/if}{/each}{/if}
	</svg>
{/if}

<style>
	.metric-mini-chart {
		display: block;
		width: 80px;
		height: 44px;
		color: var(--color-text-secondary);
		fill: currentColor;
	}
</style>
