<script lang="ts">
	import { arc, pie, type PieArcDatum } from 'd3-shape';
	import type { Snippet } from 'svelte';
	interface Item {
		label: string;
		value: number;
		color: string;
	}
	let {
		label,
		items,
		kind = 'pie',
		center
	}: {
		label: string;
		items: Item[];
		kind?: 'pie' | 'ring' | 'bar';
		center?: Snippet;
	} = $props();
	const infoId = $props.id();
	let root: HTMLDivElement;
	let selected = $state<string | null>(null);
	let pinned = $state(false);
	let focused = $state(false);
	const total = $derived(items.reduce((sum, item) => sum + item.value, 0));
	const active = $derived(items.find((item) => item.label === selected && item.value > 0));
	$effect(() => {
		if (selected && !items.some((item) => item.label === selected && item.value > 0)) clear();
	});
	const percent = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 });
	const share = (value: number) => percent.format(total ? value / total : 0);
	const copies = (value: number) => `${value.toLocaleString()} ${value === 1 ? 'copy' : 'copies'}`;
	const description = (item: Item) => `${item.label}: ${copies(item.value)}, ${share(item.value)}`;
	const slices = $derived(
		pie<Item>()
			.value((item) => item.value)
			.sort(null)(items)
	);
	const shape = $derived(
		arc<PieArcDatum<Item>>()
			.innerRadius(kind === 'ring' ? 66 : 0)
			.outerRadius(96)
			.padAngle(kind === 'ring' ? 0.015 : 0)
			.cornerRadius(kind === 'ring' ? 2 : 0)
	);
	const bars = $derived.by(() => {
		let offset = 0;
		return items.map((item) => {
			const width = total ? (item.value / total) * 1000 : 0;
			const part = { ...item, x: offset, width };
			offset += width;
			return part;
		});
	});
	function clear() {
		selected = null;
		pinned = false;
	}
	function inspect(item: Item) {
		selected = item.label;
		pinned = false;
	}
	function toggle(item: Item) {
		if (pinned && selected === item.label) clear();
		else {
			selected = item.label;
			pinned = true;
		}
	}
	function key(event: KeyboardEvent, item: Item) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			toggle(item);
		}
	}
</script>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape') clear();
	}}
	onclick={(event) => {
		if (event.target instanceof Node && !root?.contains(event.target)) clear();
	}}
/>
<div
	bind:this={root}
	class="proportion-chart"
	class:proportion-pie={kind === 'pie'}
	class:proportion-ring={kind === 'ring'}
	class:proportion-bar={kind === 'bar'}
	role="group"
	aria-label={label}
	onpointerleave={() => {
		if (!pinned && !focused) clear();
	}}
>
	{#if kind === 'bar'}
		<svg viewBox="0 0 1000 24" preserveAspectRatio="none" role="group" aria-label={label}>
			<rect width="1000" height="24" rx="5" fill="var(--color-chart-track)" />
			{#each bars as item (item.label)}{#if item.value > 0}
					<rect
						x={item.x}
						width={item.width}
						height="24"
						fill={item.color}
						class="chart-segment"
						role="button"
						tabindex="0"
						aria-label={description(item)}
						aria-pressed={pinned && selected === item.label}
						aria-describedby={active?.label === item.label ? infoId : undefined}
						onpointerenter={() => {
							if (!pinned) selected = item.label;
						}}
						onfocus={() => {
							focused = true;
							inspect(item);
						}}
						onblur={() => {
							focused = false;
							if (!pinned) clear();
						}}
						onclick={() => toggle(item)}
						onkeydown={(event) => key(event, item)}
					/>
				{/if}{/each}
		</svg>
	{:else}
		<svg viewBox="0 0 200 200" role="group" aria-label={label}>
			{#if total === 0}<circle
					cx="100"
					cy="100"
					r="81"
					fill="none"
					stroke="var(--color-chart-track)"
					stroke-width="30"
				/>{/if}
			<g transform="translate(100 100)">
				{#each slices as slice (slice.data.label)}{#if slice.value > 0}
						<path
							d={shape(slice) ?? ''}
							fill={slice.data.color}
							class="chart-segment"
							stroke={kind === 'pie' ? 'var(--color-card)' : 'none'}
							stroke-width="2"
							role="button"
							tabindex="0"
							aria-label={description(slice.data)}
							aria-pressed={pinned && selected === slice.data.label}
							aria-describedby={active?.label === slice.data.label ? infoId : undefined}
							onpointerenter={() => {
								if (!pinned) selected = slice.data.label;
							}}
							onfocus={() => {
								focused = true;
								inspect(slice.data);
							}}
							onblur={() => {
								focused = false;
								if (!pinned) clear();
							}}
							onclick={() => toggle(slice.data)}
							onkeydown={(event) => key(event, slice.data)}
						/>
					{/if}{/each}
			</g>
		</svg>
		{#if center}<div class="chart-center">{@render center()}</div>{/if}
	{/if}
	{#if active}
		<div id={infoId} class="inspection" role="tooltip">
			<span class="inspection-label"><i style:background={active.color}></i>{active.label}</span
			><strong>{copies(active.value)}</strong><small>{share(active.value)}</small>
		</div>
	{/if}
	<span class="sr-only">{total.toLocaleString()} copies total</span>
	<noscript
		><dl class="native-chart-data">
			{#each items as item}<div>
					<dt>{item.label}</dt>
					<dd>{copies(item.value)} · {share(item.value)}</dd>
				</div>{/each}
		</dl></noscript
	>
</div>

<style>
	.proportion-chart {
		position: relative;
		flex-shrink: 0;
		min-width: 0;
	}
	.proportion-pie {
		width: 192px;
		height: 192px;
	}
	.proportion-ring {
		width: 112px;
		height: 112px;
	}
	.proportion-bar {
		width: 100%;
	}
	svg {
		display: block;
		width: 100%;
		height: 100%;
		overflow: visible;
	}
	.proportion-bar svg {
		height: 13px;
		border-radius: 4px;
		overflow: hidden;
	}
	.chart-segment {
		cursor: pointer;
	}
	.chart-segment:hover,
	.chart-segment:focus-visible {
		opacity: 0.8;
		outline: none;
		stroke: var(--color-text-primary);
		stroke-width: 3;
	}
	.proportion-bar .chart-segment:focus-visible {
		stroke-width: 10;
	}
	.chart-center {
		position: absolute;
		inset: 0;
		display: grid;
		place-content: center;
		text-align: center;
		pointer-events: none;
	}
	.inspection {
		pointer-events: none;
		position: absolute;
		z-index: 20;
		top: 50%;
		left: 0;
		transform: translateY(-50%);
		width: 100%;
		border: 1px solid var(--color-border);
		border-radius: 0.6rem;
		padding: 0.65rem 0.5rem;
		background: var(--color-surface);
		box-shadow: 0 2px 10px #0002;
		text-align: center;
		overflow-wrap: anywhere;
	}
	.inspection-label {
		display: block;
		color: var(--color-text-secondary);
		font-size: 0.6875rem;
		line-height: 1.5;
	}
	.inspection-label i {
		display: inline-block;
		width: 6px;
		height: 6px;
		border-radius: 2px;
		margin-right: 5px;
	}
	strong {
		display: block;
		margin-top: 0.25rem;
		color: var(--color-text-primary);
		font-size: 0.8125rem;
		font-weight: 500;
		font-variant-numeric: tabular-nums;
	}
	small {
		display: block;
		margin-top: 0.2rem;
		color: var(--color-text-muted);
		font-size: 0.6875rem;
	}
	.proportion-bar .inspection {
		top: calc(100% + 6px);
		right: 0;
		left: auto;
		transform: none;
		width: max-content;
		max-width: 100%;
		padding: 0.5rem 0.75rem;
		text-align: left;
	}
	.native-chart-data {
		margin-top: 1rem;
		font-size: 0.75rem;
	}
	.native-chart-data div {
		display: block;
		margin-top: 0.5rem;
	}
	.proportion-ring:has(.native-chart-data),
	.proportion-pie:has(.native-chart-data) {
		height: auto;
	}
	.proportion-ring:has(.native-chart-data) svg {
		height: 112px;
	}
	.proportion-pie:has(.native-chart-data) svg {
		height: 192px;
	}
	.proportion-ring:has(.native-chart-data) .chart-center {
		bottom: auto;
		height: 112px;
	}

	@media (max-width: 600px) {
		.proportion-ring:has(.native-chart-data) svg,
		.proportion-ring:has(.native-chart-data) .chart-center {
			height: 118px;
		}
		.proportion-pie:has(.native-chart-data) svg {
			height: 164px;
		}
		.proportion-pie {
			width: 164px;
			height: 164px;
		}
		.proportion-ring {
			width: 118px;
			height: 118px;
		}
	}
</style>
