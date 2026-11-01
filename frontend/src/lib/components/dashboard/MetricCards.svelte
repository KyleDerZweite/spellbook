<script lang="ts">
	import { onMount } from 'svelte';
	import type { DashboardSummary } from '@spellbook/contracts/dashboard.ts';
	import { metricTrend, metricChange } from '#lib/valuation/metric-trends.ts';
	import { formatValueEUR } from '#lib/valuation/money.ts';
	import InventoryHistoryDialog from '#lib/components/valuation/InventoryHistoryDialog.svelte';
	import MetricMiniChart from './MetricMiniChart.svelte';
	let { dashboard, demo = false }: { dashboard: DashboardSummary; demo?: boolean } = $props();
	let enhanced = $state(false);
	let historyOpen = $state(false);
	let historyTrigger: HTMLButtonElement | null = $state(null);
	onMount(() => {
		enhanced = true;
	});
	const estimate = $derived(dashboard.inventoryValue?.estimate);
	const metrics = $derived([
		{
			key: 'value' as const,
			label: 'Inventory value',
			value: !estimate
				? 'Unavailable'
				: estimate.totalQuantity > 0 && estimate.coveredQuantity === 0
					? 'Unknown'
					: formatValueEUR(estimate.coveredValue),
			secondary: '',
			href: '',
			icon: 'M3 3h8l10 10-8 8L3 11zM7 7h.01'
		},
		{
			key: 'total' as const,
			label: 'Total / unique cards',
			value: dashboard.totals.total.toLocaleString(),
			secondary: `/ ${dashboard.totals.names.toLocaleString()}`,
			href: '/mtg/inventory',
			icon: 'm12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5'
		},
		{
			key: 'sets' as const,
			label: 'Sets',
			value: dashboard.totals.sets.toLocaleString(),
			secondary: '',
			href: '/mtg/inventory',
			icon: 'M3 4h18v17H3zM3 9h18M9 9v12M7 2v4M17 2v4'
		},
		{
			key: 'decks' as const,
			label: 'Decks',
			value: dashboard.totals.decks.toLocaleString(),
			secondary: '',
			href: '/mtg/decks',
			icon: 'M7 3h13v15H7zM4 6v15h13'
		}
	]);
</script>

<ul class="metric-cards" aria-label="Collection overview">
	{#each metrics as metric}
		{@const trend = metricTrend(dashboard.inventoryValueHistory, metric.key)}
		<li>
			{#if metric.key === 'value'}<button
					bind:this={historyTrigger}
					class="metric-card"
					type="button"
					disabled={!enhanced}
					aria-haspopup="dialog"
					onclick={() => (historyOpen = true)}>{@render card(metric, trend)}</button
				>
			{:else}<a class="metric-card" href={metric.href}>{@render card(metric, trend)}</a>{/if}
		</li>
	{/each}
</ul>
{#snippet card(metric: (typeof metrics)[number], trend: ReturnType<typeof metricTrend>)}
	<span class="metric-heading"
		><svg
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"><path d={metric.icon} /></svg
		><span>{metric.label}</span></span
	>
	<span class="metric-value"
		><strong>{metric.value}</strong>{#if metric.secondary}<span>{metric.secondary}</span>{/if}</span
	>
	<span class="metric-visual"
		><MetricMiniChart
			{trend}
			kind={metric.key === 'value' ? 'line' : 'bars'}
			label={`${metric.label}, seven closed reporting dates${trend.partial ? ', covered subtotal with partial price coverage' : ''}`}
		/></span
	>
	<span class="metric-footer">
		<span
			class="metric-change"
			class:positive={trend.delta !== null && trend.delta > 0n}
			class:negative={trend.delta !== null && trend.delta < 0n}
			title={trend.partial
				? 'Change in covered value only; some historical copies have no price'
				: undefined}
		>
			{#if trend.delta !== null}<span aria-hidden="true"
					>{trend.delta > 0n ? '↗' : trend.delta < 0n ? '↘' : ''}</span
				>
				{metricChange(trend.delta, metric.key === 'value')}
				<span class="comparison">{trend.partial ? 'covered · 7 days' : 'over 7 days'}</span
				>{:else}<span class="comparison"
					>{trend.captured ? 'No comparison yet' : 'No history yet'}</span
				>{/if}
		</span>
		{#if metric.key === 'value' && estimate && !estimate.complete}<span
				class="coverage"
				title={`${estimate.coveredQuantity} of ${estimate.totalQuantity} copies priced`}
				>Partial value</span
			>{/if}
	</span>
{/snippet}
{#if historyOpen}<InventoryHistoryDialog
		initialHistory={dashboard.inventoryValueHistory}
		{demo}
		onCancel={() => (historyOpen = false)}
		onCloseAutoFocus={(event) => {
			if (historyTrigger?.isConnected) {
				event.preventDefault();
				historyTrigger.focus({ preventScroll: true });
			}
		}}
	/>{/if}

<style>
	.metric-cards {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 16px;
		padding: 0;
		margin: 24px 0;
		list-style: none;
	}
	li {
		min-width: 0;
	}
	.metric-card {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 80px;
		align-items: center;
		gap: 12px;
		width: 100%;
		min-height: 144px;
		height: 100%;
		padding: 20px;
		background: var(--color-card);
		border: 1px solid var(--color-border);
		border-radius: 12px;
		color: var(--color-text-primary);
		text-align: left;
		text-decoration: none;
	}
	.metric-card:hover {
		border-color: var(--color-text-muted);
	}
	.metric-heading {
		display: flex;
		align-items: center;
		gap: 8px;
		grid-column: 1/-1;
		color: var(--color-text-secondary);
		font: 400 12px var(--font-body);
	}
	.metric-heading svg {
		flex-shrink: 0;
	}
	.metric-value {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 8px;
		min-width: 0;
		font-variant-numeric: tabular-nums;
	}
	.metric-value strong {
		font: 400 clamp(28px, 2.2vw, 36px)/1.1 var(--font-display);
		overflow-wrap: anywhere;
	}
	.metric-value > span {
		color: var(--color-text-muted);
		font: 400 22px var(--font-display);
	}
	.metric-visual {
		display: block;
		width: 80px;
		height: 44px;
	}
	.metric-footer {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 4px 12px;
		grid-column: 1/-1;
		font: 400 11px var(--font-body);
	}
	.metric-change {
		color: var(--color-text-secondary);
		font-variant-numeric: tabular-nums;
	}
	.comparison,
	.coverage {
		color: var(--color-text-muted);
	}
	.positive {
		color: var(--color-success);
	}
	.negative {
		color: var(--color-error);
	}
	@media (max-width: 1150px) {
		.metric-cards {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 560px) {
		.metric-card {
			grid-template-columns: minmax(0, 1fr);
			padding: 16px;
		}
		.metric-visual {
			display: none;
		}
		.metric-value {
			min-height: 44px;
		}
		.metric-heading {
			align-items: start;
		}
	}
	@media (max-width: 360px) {
		.metric-cards {
			grid-template-columns: 1fr;
		}
		.metric-card {
			grid-template-columns: minmax(0, 1fr) 80px;
		}
		.metric-visual {
			display: block;
		}
	}
</style>
