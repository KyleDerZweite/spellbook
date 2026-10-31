<script lang="ts">
	import { line, curveMonotoneX } from 'd3-shape';
	import { scaleLinear } from 'd3-scale';
	import type { metricTrend } from '#lib/valuation/metric-trends.ts';
	import { metricChange } from '#lib/valuation/metric-trends.ts';
	let {
		trend,
		label,
		currency = false
	}: { trend: ReturnType<typeof metricTrend>; label: string; currency?: boolean } = $props();
	const dailyValues = $derived(
		trend.points
			.map(
				(point) =>
					`${point.day}: ${point.value === null ? 'unavailable' : metricChange(point.value, currency).replace(/^\+/, '')}`
			)
			.join('; ')
	);
	const values = $derived(trend.points.flatMap((p) => (p.value === null ? [] : [p.value])));
	const minimum = $derived(values.reduce((n, v) => (v < n ? v : n), values[0] ?? 0n));
	const maximum = $derived(values.reduce((n, v) => (v > n ? v : n), values[0] ?? 0n));
	const x = scaleLinear().domain([0, 6]).range([4, 236]);
	const y = scaleLinear().domain([0, 10000]).range([44, 4]);
	const plotted = $derived(
		trend.points.map((p, i) => ({
			...p,
			x: x(i),
			y: y(
				p.value === null || maximum === minimum
					? 5000
					: Number(((p.value - minimum) * 10000n) / (maximum - minimum))
			)
		}))
	);
	const path = $derived(
		line<(typeof plotted)[number]>()
			.defined((p) => p.value !== null)
			.x((p) => p.x)
			.y((p) => p.y)
			.curve(curveMonotoneX)(plotted)
	);
</script>

<div
	class="metric-sparkline"
	class:positive={trend.delta !== null && trend.delta > 0n}
	class:negative={trend.delta !== null && trend.delta < 0n}
>
	{#if values.length}<svg
			viewBox="0 0 240 48"
			role="img"
			aria-label={`${label}. ${dailyValues}`}
			preserveAspectRatio="none"
			><path
				d={path ?? ''}
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				vector-effect="non-scaling-stroke"
			/>{#each plotted as point}{#if point.value !== null}<circle
						cx={point.x}
						cy={point.y}
						r="2"
						fill="currentColor"
						><title>{point.day}: {metricChange(point.value, currency).replace(/^\+/, '')}</title
						></circle
					>{/if}{/each}</svg
		>
	{:else}<span>History unavailable</span>{/if}
</div>

<style>
	.metric-sparkline {
		width: 100%;
		height: 48px;
		color: var(--color-text-muted);
	}
	.positive {
		color: var(--color-success);
	}
	.negative {
		color: var(--color-error);
	}
	svg {
		width: 100%;
		height: 48px;
		overflow: visible;
	}
	span {
		display: flex;
		align-items: center;
		height: 100%;
		color: var(--color-text-muted);
		font-size: 0.6875rem;
	}
</style>
