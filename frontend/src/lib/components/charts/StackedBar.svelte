<script lang="ts">
	import { scaleLinear } from 'd3-scale';
	let {
		label,
		segments
	}: { label: string; segments: { label: string; value: number; color: string }[] } = $props();
	const total = $derived(segments.reduce((sum, segment) => sum + segment.value, 0));
	const scale = $derived(
		scaleLinear()
			.domain([0, total || 1])
			.range([0, 100])
	);
</script>

<svg
	class="stacked-bar"
	viewBox="0 0 100 12"
	preserveAspectRatio="none"
	role="img"
	aria-label={label}
>
	<title
		>{segments
			.map((segment) => `${segment.label}: ${segment.value.toLocaleString()}`)
			.join(', ')}</title
	>
	{#each segments as segment, i}
		{#if segment.value > 0}
			<rect
				x={scale(segments.slice(0, i).reduce((sum, part) => sum + part.value, 0))}
				y="0"
				width={scale(segment.value)}
				height="12"
				fill={segment.color}
			/>
			{#if segments.slice(i + 1).some((part) => part.value > 0)}
				<line
					x1={scale(segments.slice(0, i + 1).reduce((sum, part) => sum + part.value, 0))}
					x2={scale(segments.slice(0, i + 1).reduce((sum, part) => sum + part.value, 0))}
					y1="0"
					y2="12"
					class="segment-divider"
				/>
			{/if}
		{/if}
	{/each}
</svg>

<style>
	.stacked-bar {
		display: block;
		width: 100%;
		height: 12px;
		border-radius: 6px;
		overflow: hidden;
		background: var(--color-chart-track);
	}
	.segment-divider {
		stroke: var(--color-card);
		stroke-width: 2px;
		vector-effect: non-scaling-stroke;
	}
</style>
