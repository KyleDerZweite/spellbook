<script lang="ts">
	import type { DashboardSummary } from '@spellbook/contracts/dashboard.ts';
	import ProportionChart from '#lib/components/charts/ProportionChart.svelte';
	let { dashboard }: { dashboard: DashboardSummary } = $props();
	const groups = $derived([
		{ name: 'Finish', values: dashboard.finishes },
		{ name: 'Condition', values: dashboard.conditions }
	]);
</script>

<section class="composition">
	<h2>Inventory</h2>
	{#each groups as group}
		<div class="breakdown">
			<header>
				<h3>{group.name}</h3>
				<span>{group.values.find((v) => v.quantity > 0)?.label ?? 'No cards'}</span>
			</header>
			<ProportionChart
				label={`Owned copies by ${group.name.toLowerCase()}`}
				kind="bar"
				items={group.values.map((v, i) => ({
					label: v.label,
					value: v.quantity,
					color: i === 0 ? 'var(--color-chart-primary)' : 'var(--color-text-muted)'
				}))}
			/>
		</div>
	{/each}
</section>

<style>
	.composition {
		min-width: 0;
		padding: 20px;
		background: var(--color-card);
		border: 1px solid color-mix(in srgb, var(--color-border) 45%, transparent);
		border-radius: 12px;
	}
	h2 {
		font: 500 16px var(--font-interface);
		margin-bottom: 24px;
	}
	.breakdown + .breakdown {
		margin-top: 24px;
	}
	header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 12px;
	}
	h3 {
		font: 400 12px var(--font-interface);
		color: var(--color-text-secondary);
	}
	span {
		font: 400 11px var(--font-interface);
		color: var(--color-text-muted);
	}
</style>
