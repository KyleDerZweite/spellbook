<script lang="ts">
	import { scaleLinear } from 'd3-scale';
	let {
		label,
		items
	}: {
		label: string;
		items: { label: string; value: number; share: number; color?: string }[];
	} = $props();
	let selected = $state<string | null>(null);
	const scale = $derived(
		scaleLinear()
			.domain([0, Math.max(1, ...items.map((item) => item.value))])
			.nice(4)
			.range([0, 100])
	);
	const ticks = $derived(scale.ticks(4).filter(Number.isInteger));
	const tickFormat = $derived(scale.tickFormat(4, '~s'));
	const percent = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 });
	const active = $derived(items.find((item) => item.label === selected));
</script>

<div class="distribution-chart" role="group" aria-label={label}>
	{#each items as item (item.label)}
		<button
			type="button"
			class="chart-row"
			class:active={selected === item.label}
			style:--bar-color={item.color ?? 'var(--color-chart-primary)'}
			aria-label={`${item.label}: ${item.value.toLocaleString()} copies, ${percent.format(item.share)}`}
			aria-pressed={selected === item.label}
			onclick={() => (selected = item.label)}
			onfocus={() => (selected = item.label)}
			onpointerenter={() => (selected = item.label)}
		>
			<span class="chart-row-heading"
				><span class="chart-label">{item.label}</span><span class="chart-value"
					>{item.value.toLocaleString()} <small>{percent.format(item.share)}</small></span
				></span
			>
			<span class="chart-track" aria-hidden="true">
				<span class="chart-fill" style:width={`${scale(item.value)}%`}></span>
			</span>
		</button>
	{/each}
	<div class="chart-axis" aria-hidden="true">
		{#each ticks as tick}<span style:left={`${scale(tick)}%`}>{tickFormat(tick)}</span>{/each}
	</div>
	<p class="chart-readout" aria-live="polite">
		{active
			? `${active.label} · ${active.value.toLocaleString()} copies · ${percent.format(active.share)} of inventory`
			: label}
	</p>
</div>

<style>
	.chart-row {
		display: block;
		min-height: 64px;
		padding: 0.65rem 0.5rem;
		margin-inline: -0.5rem;
		width: calc(100% + 1rem);
		border: 0;
		border-radius: 0.5rem;
		background: transparent;
		color: var(--color-text-primary);
		text-align: left;
		cursor: pointer;
	}
	.chart-row:hover,
	.chart-row.active {
		background: var(--color-surface);
	}
	.chart-row-heading {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.65rem;
	}
	.chart-label {
		overflow-wrap: anywhere;
		font-size: 0.75rem;
	}
	.chart-value {
		flex-shrink: 0;
		font-size: 0.875rem;
		font-variant-numeric: tabular-nums;
	}
	small {
		display: inline-block;
		margin-left: 0.75rem;
		width: 3.5rem;
		color: var(--color-text-muted);
		font-size: 0.6875rem;
		text-align: right;
	}
	.chart-track {
		display: block;
		width: 100%;
		height: 12px;
		border-radius: 6px;
		background: var(--color-chart-track);
		overflow: hidden;
	}
	.chart-fill {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--bar-color);
		opacity: 0.7;
	}
	.chart-row:hover .chart-fill,
	.chart-row.active .chart-fill {
		opacity: 1;
	}
	.chart-axis {
		position: relative;
		height: 1.25rem;
		margin-top: 0.5rem;
		color: var(--color-text-muted);
		font-size: 0.6875rem;
	}
	.chart-axis span {
		position: absolute;
		transform: translateX(-50%);
	}
	.chart-axis span:first-child {
		transform: none;
	}
	.chart-axis span:last-child {
		transform: translateX(-100%);
	}
	.chart-readout {
		margin-top: 0.5rem;
		min-height: 1.6em;
		color: var(--color-text-secondary);
		font-size: 0.6875rem;
		line-height: 1.6;
	}
</style>
