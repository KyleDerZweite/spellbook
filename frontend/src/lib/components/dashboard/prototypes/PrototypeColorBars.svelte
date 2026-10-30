<script lang="ts">
	import type { DashboardDistribution } from '@spellbook/contracts/dashboard.ts';
	import PrototypeMtgIcon from './PrototypeMtgIcon.svelte';
	import { manaColor } from './prototype-mtg.ts';
	let {
		items,
		label,
		height = 128
	}: { items: DashboardDistribution[]; label: string; height?: number } = $props();
	let inspected = $state<string | null>(null);
	const visible = $derived(items.filter((item) => item.label !== 'Unknown' || item.quantity > 0));
	const maximum = $derived(Math.max(1, ...items.map((item) => item.quantity)));
	const active = $derived(items.find((item) => item.label === inspected));
</script>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape') inspected = null;
	}}
/>
<div class="color-chart" role="group" aria-label={label} style:--plot-height={`${height}px`}>
	<div class="bars">
		{#each visible as item}<button
				type="button"
				class="column"
				aria-label={`${item.label}: ${item.quantity.toLocaleString()} copies`}
				aria-pressed={inspected === item.label}
				title={`${item.label}: ${item.quantity.toLocaleString()} copies`}
				onpointerenter={() => (inspected = item.label)}
				onfocus={() => (inspected = item.label)}
				onclick={() => (inspected = item.label)}
			>
				<strong>{item.quantity.toLocaleString()}</strong><span class="plot"
					><i
						style:height={`${(item.quantity / maximum) * 100}%`}
						style:background={manaColor(item.label)}
					></i></span
				>
				<PrototypeMtgIcon kind="color" label={item.label} />
			</button>{/each}
	</div>
	<p class="readout" aria-live="polite">
		{#if active}{active.label}<span
				>{(active.share * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%</span
			>{:else}<span class="sr-only">Focus a color to inspect its share</span>{/if}
	</p>
</div>

<style>
	.color-chart {
		min-width: 0;
	}
	.bars {
		display: flex;
		align-items: end;
		gap: 8px;
	}
	.column {
		display: grid;
		justify-items: center;
		grid-template-rows: 20px var(--plot-height) 24px;
		gap: 8px;
		flex: 1;
		min-width: 0;
		padding: 4px 0;
		color: var(--color-text-secondary);
		background: transparent;
		border: 0;
		border-radius: 4px;
		cursor: pointer;
	}
	strong {
		font: 400 11px var(--font-interface);
		font-variant-numeric: tabular-nums;
	}
	.plot {
		display: flex;
		align-items: end;
		justify-content: center;
		width: 100%;
		border-bottom: 1px solid var(--color-border);
	}
	.plot i {
		display: block;
		width: 72%;
		max-width: 40px;
		border-radius: 4px 4px 0 0;
	}
	.column:hover,
	.column[aria-pressed='true'] {
		background: var(--color-surface);
		color: var(--color-text-primary);
	}
	.readout {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		min-height: 16px;
		margin-top: 12px;
		font: 400 11px var(--font-interface);
		color: var(--color-text-secondary);
	}
	@media (max-width: 480px) {
		.column {
			grid-template-rows: 20px 112px 24px;
		}
	}
</style>
