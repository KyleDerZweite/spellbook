<script lang="ts">
	import type { DashboardSummary } from '@spellbook/contracts/dashboard.ts';
	import { formatValueEUR } from '#lib/valuation/money.ts';
	import PrototypeValueSpark from './PrototypeValueSpark.svelte';
	let { dashboard }: { dashboard: DashboardSummary } = $props();
	const estimate = $derived(dashboard.inventoryValue?.estimate);
	const value = $derived(
		!estimate
			? 'Unavailable'
			: estimate.totalQuantity > 0 && estimate.coveredQuantity === 0
				? 'Unknown'
				: formatValueEUR(estimate.coveredValue)
	);
</script>

<div class="prototype-metrics" aria-label="Collection overview">
	<a
		href="/mtg/history"
		class="metric"
		title={estimate
			? `${estimate.coveredQuantity} of ${estimate.totalQuantity} copies priced; ${estimate.unknownQuantity} unknown`
			: 'Inventory value unavailable'}
		><span>Inventory value</span>
		<div class="metric-main">
			<strong>{value}</strong><PrototypeValueSpark history={dashboard.inventoryValueHistory} />
		</div></a
	>
	<a
		href="/mtg/inventory"
		class="metric"
		aria-label={`${dashboard.totals.total} total cards, ${dashboard.totals.names} unique cards`}
		><span>Total / Unique Cards</span><strong
			>{dashboard.totals.total.toLocaleString()}<em>
				/ {dashboard.totals.names.toLocaleString()}</em
			></strong
		></a
	>
	<a href="/mtg/inventory" class="metric"
		><span>Sets</span><strong>{dashboard.totals.sets.toLocaleString()}</strong></a
	>
	<a href="/mtg/decks" class="metric"
		><span>Decks</span><strong>{dashboard.totals.decks.toLocaleString()}</strong></a
	>
</div>

<style>
	.prototype-metrics {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 1rem;
		margin-bottom: 1.5rem;
	}
	.metric {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.65rem;
		padding: 1rem 1.15rem;
		min-width: 0;
		min-height: 110px;
		background: var(--color-card);
		border: 1px solid color-mix(in srgb, var(--color-border) 45%, transparent);
		border-radius: 0.75rem;
		color: var(--color-text-primary);
		text-decoration: none;
	}
	.metric:hover {
		border-color: var(--color-border);
	}
	.metric > span {
		font: 400 0.75rem var(--font-interface);
		color: var(--color-text-secondary);
	}
	strong {
		font: 400 clamp(1.6rem, 2.2vw, 2.25rem)/1.2 var(--font-display);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	em {
		font-style: normal;
		color: var(--color-text-muted);
		font-size: 0.78em;
	}
	.metric-main {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		min-width: 0;
		flex-wrap: wrap;
	}
	@media (max-width: 760px) {
		.prototype-metrics {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 0.75rem;
		}
		.metric {
			min-height: 96px;
			padding: 0.875rem 1rem;
		}
	}
</style>
