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
			icon: 'M3 7c0-2 4-4 9-4s9 2 9 4-4 4-9 4-9-2-9-4Zm0 5c0 2 4 4 9 4s9-2 9-4M3 17c0 2 4 4 9 4s9-2 9-4'
		},
		{
			key: 'total' as const,
			label: 'Total / unique cards',
			value: dashboard.totals.total.toLocaleString(),
			secondary: `/ ${dashboard.totals.names.toLocaleString()}`,
			href: '/mtg/inventory',
			icon: 'M12 5v16M12 5C9 2 5 2 2 4v16c3-2 7-2 10 1 3-3 7-3 10-1V4c-3-2-7-2-10 1Z'
		},
		{
			key: 'sets' as const,
			label: 'Sets',
			value: dashboard.totals.sets.toLocaleString(),
			secondary: '',
			href: '/mtg/inventory',
			icon: 'm12 2 10 5v10l-10 5-10-5V7l10-5Zm0 10L2 7m10 5L22 7M12 12v10'
		},
		{
			key: 'decks' as const,
			label: 'Decks',
			value: dashboard.totals.decks.toLocaleString(),
			secondary: '',
			href: '/mtg/decks',
			icon: 'm10 2 12 3-4 17-12-3 4-17ZM6 4 2 5l3 15M6 8l-1 1 2 8'
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
			<span class="metric-visual"
				><MetricMiniChart
					{trend}
					kind={metric.key === 'value' ? 'line' : 'bars'}
					label={`${metric.label}, seven closed reporting dates${trend.partial ? ', covered subtotal with partial price coverage' : ''}`}
				/></span
			>
		</li>
	{/each}
</ul>
{#snippet card(metric: (typeof metrics)[number], trend: ReturnType<typeof metricTrend>)}
	<svg
		class="metric-icon"
		width="40"
		height="40"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.6"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"><path d={metric.icon} /></svg
	>
	<span class="metric-heading">{metric.label}</span>
	<span class="metric-value"
		><strong>{metric.value}</strong>{#if metric.secondary}<span>{metric.secondary}</span>{/if}</span
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
		position: relative;
		min-width: 0;
	}
	.metric-card {
		display: grid;
		grid-template-columns: 40px minmax(0, 1fr);
		grid-template-rows: auto auto 1fr;
		align-content: start;
		gap: 12px 22px;
		width: 100%;
		min-height: 170px;
		height: 100%;
		padding: 26px 24px;
		background: var(--color-card);
		border: 1px solid var(--color-border);
		border-radius: 10px;
		color: var(--color-text-primary);
		text-align: left;
		text-decoration: none;
	}
	.metric-card:hover {
		border-color: var(--color-text-muted);
	}
	.metric-card:focus-visible {
		outline: 2px solid var(--color-violet);
		outline-offset: 3px;
	}
	.metric-icon {
		grid-column: 1;
		grid-row: 1 / 4;
		color: var(--color-violet);
	}
	.metric-heading {
		grid-column: 2;
		color: var(--color-text-secondary);
		font: 400 13px/1.4 var(--font-body);
	}
	.metric-value {
		display: flex;
		grid-column: 2;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 4px 8px;
		min-width: 0;
		font-variant-numeric: tabular-nums;
	}
	.metric-value strong {
		font: 400 clamp(28px, 2.2vw, 36px)/1.1 var(--font-display);
		overflow-wrap: anywhere;
	}
	.metric-value > span {
		color: var(--color-text-secondary);
		font: 400 24px/1.1 var(--font-display);
	}
	.metric-visual {
		position: absolute;
		right: 18px;
		bottom: 25px;
		width: 80px;
		height: 44px;
		pointer-events: none;
	}
	.metric-footer {
		display: flex;
		flex-wrap: wrap;
		align-self: end;
		gap: 4px 12px;
		grid-column: 2;
		padding-right: 76px;
		font: 400 12px/1.5 var(--font-body);
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
	@media (min-width: 1150px) and (max-width: 1450px) {
		.metric-card {
			gap: 10px 12px;
			padding: 22px 16px;
		}
		.metric-icon {
			grid-row: 1 / 3;
		}
		.metric-footer {
			grid-column: 1 / -1;
			padding-right: 76px;
		}
	}
	@media (max-width: 1149px) {
		.metric-cards {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 650px) {
		.metric-cards {
			gap: 12px;
		}
		.metric-card {
			gap: 12px;
			padding: 18px 14px;
		}
		.metric-icon {
			grid-row: 1;
			width: 32px;
			height: 32px;
		}
		.metric-card {
			grid-template-columns: 32px minmax(0, 1fr);
		}
		.metric-value,
		.metric-footer {
			grid-column: 1 / -1;
		}
		.metric-value strong {
			font-size: 28px;
		}
		.metric-value > span {
			font-size: 20px;
		}
		.metric-footer {
			padding-right: 0;
			padding-bottom: 48px;
		}
		.metric-visual {
			right: 14px;
			bottom: 14px;
		}
	}
	@media (max-width: 360px) {
		.metric-cards {
			grid-template-columns: 1fr;
		}
	}
</style>
