<script lang="ts">
	import { useLanguage } from '#lib/i18n/context.ts';
	const language = useLanguage();
	import { line } from 'd3-shape';
	import { metricChange, type metricTrend } from '#lib/valuation/metric-trends.ts';
	let {
		trend,
		label,
		kind = 'bars'
	}: { trend: ReturnType<typeof metricTrend>; label: string; kind?: 'bars' | 'line' } = $props();
	const descriptionId = $props.id();
	const values = $derived(trend.points.flatMap((p) => (p.value === null ? [] : [p.value])));
	const minimum = $derived(values.reduce((n, value) => (value < n ? value : n), values[0] ?? 0n));
	const maximum = $derived(values.reduce((n, value) => (value > n ? value : n), values[0] ?? 0n));
	const points = $derived(
		trend.points.map((point, index) => ({
			...point,
			x: 4 + (index * 72) / Math.max(1, trend.points.length - 1),
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
	const barWidth = $derived(Math.min(6, 56 / Math.max(1, trend.points.length)));
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
					`${point.day}: ${point.value === null ? 'unavailable' : metricChange(point.value, kind === 'line', language.locale).replace(/^\+/, '')}`
			)
			.join('; ')
	);
</script>

{#if values.length}
	<svg
		class="metric-mini-chart"
		viewBox="0 0 80 44"
		role="img"
		aria-label={label}
		aria-describedby={descriptionId}
	>
		<desc id={descriptionId}>{description}</desc>
		{#if kind === 'line'}<path
				d={path ?? ''}
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		{:else}{#each points as point}{#if point.value === 0n}<line
						x1={point.x - barWidth / 2}
						x2={point.x + barWidth / 2}
						y1="40"
						y2="40"
						stroke="currentColor"
						stroke-width="1.5"><title>{point.day}: 0</title></line
					>
				{:else if point.value !== null}<rect
						x={point.x - barWidth / 2}
						y={point.y}
						width={barWidth}
						height={40 - point.y}
						rx="1"
						opacity={point.day === trend.to ? 1 : 0.6}
						><title>{point.day}: {point.value.toLocaleString(language.locale)}</title></rect
					>{/if}{/each}{/if}
	</svg>
{/if}

<style>
	.metric-mini-chart {
		display: block;
		width: 80px;
		height: 44px;
		color: inherit;
		fill: currentColor;
	}
</style>
