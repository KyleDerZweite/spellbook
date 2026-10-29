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
		<rect
			x={scale(segments.slice(0, i).reduce((sum, part) => sum + part.value, 0))}
			y="0"
			width={scale(segment.value)}
			height="12"
			fill={segment.color}
		/>
	{/each}
</svg>

<style>
	.stacked-bar {
		display: block;
		width: 100%;
		height: 8px;
		border-radius: 4px;
		overflow: hidden;
		background: var(--color-muted);
	}
</style>
