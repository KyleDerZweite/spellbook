<script lang="ts">
	let {
		src,
		box,
		start = 0,
		end = 0,
		horizontal = false
	}: {
		src: string;
		box: readonly [number, number, number, number];
		start?: number;
		end?: number;
		horizontal?: boolean;
	} = $props();
	let regions = $derived(
		horizontal
			? [
					[box[0], box[1], start, box[3]],
					[box[0] + start, box[1], box[2] - start - end, box[3]],
					[box[0] + box[2] - end, box[1], end, box[3]]
				]
			: [
					[box[0], box[1], box[2], start],
					[box[0], box[1] + start, box[2], box[3] - start - end],
					[box[0], box[1] + box[3] - end, box[2], end]
				]
	);
</script>

<div
	class="frame-region"
	class:horizontal
	aria-hidden="true"
	style={`--start: ${start / 7.45}cqw; --end: ${end / 7.45}cqw`}
>
	{#each regions as region, i (i)}
		{#if region[2] && region[3]}
			<svg viewBox={region.join(' ')} preserveAspectRatio="none" focusable="false">
				<image href={src} width="745" height="1040" />
			</svg>
		{:else}<span></span>{/if}
	{/each}
</div>

<style>
	.frame-region {
		position: absolute;
		inset: 0;
		display: grid;
		grid-template-rows: var(--start) minmax(0, 1fr) var(--end);
		pointer-events: none;
	}
	.horizontal {
		grid-template-rows: none;
		grid-template-columns: var(--start) minmax(0, 1fr) var(--end);
	}
	svg {
		display: block;
		width: 100%;
		height: 100%;
		min-width: 0;
		min-height: 0;
	}
</style>
