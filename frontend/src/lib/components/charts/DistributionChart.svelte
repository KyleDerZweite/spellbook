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
	const ticks = $derived(scale.ticks(4));
	const percent = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 });
	const active = $derived(items.find((item) => item.label === selected));
</script>

<div class="distribution-chart" role="group" aria-label={label}>
	<div class="chart-axis" aria-hidden="true">
		{#each ticks as tick}<span style:left={`${scale(tick)}%`}>{tick.toLocaleString()}</span>{/each}
	</div>
	{#each items as item (item.label)}
		<button
			type="button"
			class="chart-row"
			class:active={selected === item.label}
			aria-label={`${item.label}: ${item.value.toLocaleString()} copies, ${percent.format(item.share)}`}
			aria-pressed={selected === item.label}
			onclick={() => (selected = item.label)}
			onfocus={() => (selected = item.label)}
			onpointerenter={() => (selected = item.label)}
		>
			<span class="chart-label">{item.label}</span>
			<svg viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
				{#each ticks as tick}<line
						x1={scale(tick)}
						x2={scale(tick)}
						y1="0"
						y2="24"
						class="chart-grid"
					/>{/each}
				<rect
					x="0"
					y="4"
					width={scale(item.value)}
					height="16"
					rx="1"
					fill={item.color ?? 'var(--color-chart-primary)'}
				/>
			</svg>
			<span class="chart-value"
				>{item.value.toLocaleString()}<small>{percent.format(item.share)}</small></span
			>
		</button>
	{/each}
	<p class="chart-readout" aria-live="polite">
		{active
			? `${active.label} · ${active.value.toLocaleString()} copies · ${percent.format(active.share)} of inventory`
			: 'Select a bar to inspect its share of your inventory.'}
	</p>
</div>

<style>
	.distribution-chart {
		--label-width: 7rem;
		--value-width: 4.25rem;
	}
	.chart-axis {
		position: relative;
		height: 1.5rem;
		margin: 0 var(--value-width) 0 var(--label-width);
		color: var(--color-text-muted);
		font-size: 0.65rem;
	}
	.chart-axis span {
		position: absolute;
		transform: translateX(-50%);
	}
	.chart-row {
		display: grid;
		grid-template-columns: var(--label-width) minmax(0, 1fr) var(--value-width);
		align-items: center;
		width: 100%;
		min-height: 48px;
		padding: 0.25rem 0;
		border: 0;
		border-radius: 0.375rem;
		background: transparent;
		color: var(--color-text-primary);
		text-align: left;
		cursor: pointer;
	}
	.chart-row:hover,
	.chart-row.active {
		background: var(--color-surface);
	}
	.chart-label {
		overflow-wrap: anywhere;
		padding-right: 0.75rem;
		font-size: 0.75rem;
	}
	svg {
		width: 100%;
		height: 24px;
		overflow: visible;
	}
	.chart-grid {
		stroke: var(--color-border);
		stroke-width: 0.2;
		stroke-dasharray: 1 2;
	}
	.chart-value {
		text-align: right;
		font-size: 0.8rem;
		font-variant-numeric: tabular-nums;
	}
	small {
		display: block;
		color: var(--color-text-muted);
		font-size: 0.65rem;
	}
	.chart-readout {
		min-height: 2.5em;
		margin-top: 0.75rem;
		color: var(--color-text-secondary);
		font-size: 0.7rem;
		line-height: 1.6;
	}
	@media (max-width: 600px) {
		.distribution-chart {
			--label-width: 5.25rem;
			--value-width: 3.5rem;
		}
	}
</style>
