<script lang="ts">
	import { onMount } from 'svelte';
	import type { DashboardSummary } from '@spellbook/contracts/dashboard.ts';
	import { metricTrend, metricChange, type MetricKey } from '#lib/valuation/metric-trends.ts';
	import { formatValueEUR } from '#lib/valuation/money.ts';
	import FormDialog from '#lib/components/ui/dialog/FormDialog.svelte';
	import MetricSparkline from './MetricSparkline.svelte';
	import ValueHistoryPreview from './ValueHistoryPreview.svelte';
	let { dashboard, demo = false }: { dashboard: DashboardSummary; demo?: boolean } = $props();
	let enhanced = $state(false);
	onMount(() => (enhanced = true));
	let selected = $state<MetricKey | null>(null);
	let trigger: HTMLElement | null = null;
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
			secondary: estimate && !estimate.complete ? 'Partial coverage' : '',
			href: '/mtg/history'
		},
		{
			key: 'total' as const,
			label: 'Total / unique cards',
			value: dashboard.totals.total.toLocaleString(),
			secondary: `/ ${dashboard.totals.names.toLocaleString()}`,
			href: '/mtg/inventory'
		},
		{
			key: 'sets' as const,
			label: 'Sets',
			value: dashboard.totals.sets.toLocaleString(),
			secondary: '',
			href: '/mtg/inventory'
		},
		{
			key: 'decks' as const,
			label: 'Decks',
			value: dashboard.totals.decks.toLocaleString(),
			secondary: '',
			href: '/mtg/decks'
		}
	]);
	const active = $derived(metrics.find((m) => m.key === selected));
</script>

<ul class="metric-cards" aria-label="Collection overview">
	{#each metrics as metric}
		{@const trend = metricTrend(dashboard.inventoryValueHistory, metric.key)}
		<li>
			{#if enhanced}<button
					class="metric-card"
					type="button"
					aria-haspopup="dialog"
					onclick={(event) => {
						trigger = event.currentTarget;
						selected = metric.key;
					}}>{@render card(metric, trend)}</button
				>
			{:else}<a class="metric-card" href={metric.href}>{@render card(metric, trend)}</a>{/if}
		</li>
	{/each}
</ul>
{#snippet card(metric: (typeof metrics)[number], trend: ReturnType<typeof metricTrend>)}
	<span class="metric-label">{metric.label}</span>
	<span class="metric-value"
		><strong>{metric.value}</strong>{#if metric.secondary}<span
				class:unique={metric.key === 'total'}>{metric.secondary}</span
			>{/if}</span
	>
	<div
		class="metric-change"
		class:positive={trend.delta !== null && trend.delta > 0n}
		class:negative={trend.delta !== null && trend.delta < 0n}
	>
		<span
			>{trend.delta === null
				? 'No comparison'
				: metricChange(trend.delta, metric.key === 'value')}</span
		><small>{trend.partial ? 'Partial history · 7 days' : 'Last 7 days'}</small>
	</div>
	<MetricSparkline
		{trend}
		currency={metric.key === 'value'}
		label={`${metric.label}: daily values ${trend.from} to ${trend.to}; ${trend.captured} recorded days${trend.partial ? '; covered value only, partial price coverage' : ''}`}
	/>
{/snippet}
{#if active}<FormDialog
		title={active.label}
		description=""
		variant="import"
		onCancel={() => (selected = null)}
		onCloseAutoFocus={(event) => {
			if (trigger?.isConnected) {
				event.preventDefault();
				trigger.focus({ preventScroll: true });
			}
		}}
	>
		{#if selected === 'value'}<ValueHistoryPreview
				initialHistory={dashboard.inventoryValueHistory}
				{demo}
			/>
		{:else}
			<div class="preview-count">
				<strong>{active.value}</strong>{#if active.secondary}<span>{active.secondary}</span>{/if}
			</div>
			{@const trend = metricTrend(dashboard.inventoryValueHistory, selected!)}
			<MetricSparkline {trend} label={`${active.label}, daily captured totals`} />
			<p class="preview-period">
				{trend.from} to {trend.to} · {dashboard.inventoryValueHistory?.timezone ??
					'Reporting calendar unavailable'}
			</p>
			{#if selected === 'sets'}<dl class="metric-details">
					{#each dashboard.sets as item}<div>
							<dt>
								{dashboard.catalogBreakdown?.setNames[item.label] ?? item.label.toUpperCase()}
							</dt>
							<dd>{item.quantity.toLocaleString()} copies</dd>
						</div>{/each}
				</dl>
			{:else if selected === 'decks'}<ul class="deck-preview">
					{#each dashboard.decks as deck}<li>
							<a href={`/mtg/decks?deck=${encodeURIComponent(deck.id)}`}
								>{#if deck.commanders[0]?.imageUri}<img
										src={deck.commanders[0].imageUri}
										alt=""
										width="40"
										height="56"
									/>{/if}<span
									>{deck.name}<small
										>{deck.required.toLocaleString()} cards · {deck.missing.toLocaleString()} missing</small
									></span
								></a
							>
						</li>{:else}<li>No decks yet</li>{/each}
				</ul>
			{:else}<dl class="metric-details">
					<div>
						<dt>Total copies</dt>
						<dd>{dashboard.totals.total.toLocaleString()}</dd>
					</div>
					<div>
						<dt>Unique cards</dt>
						<dd>{dashboard.totals.names.toLocaleString()}</dd>
					</div>
					<div>
						<dt>Printings</dt>
						<dd>{dashboard.totals.printings.toLocaleString()}</dd>
					</div>
				</dl>
				<h3>Unique cards</h3>
				<MetricSparkline
					trend={metricTrend(dashboard.inventoryValueHistory, 'names')}
					label="Daily unique Canonical Cards"
				/>{/if}
			<a class="btn btn-primary" href={active.href}
				>Open {selected === 'decks' ? 'decks' : 'inventory'}</a
			>
		{/if}
		<button class="btn btn-ghost close-preview" type="button" onclick={() => (selected = null)}
			>Close</button
		>
	</FormDialog>{/if}

<style>
	.metric-cards {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 1rem;
		margin: 1.5rem 0;
		padding: 0;
		list-style: none;
	}
	li {
		min-width: 0;
	}
	.metric-card {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		width: 100%;
		height: 100%;
		min-width: 0;
		padding: 1.25rem;
		text-align: left;
		background: var(--color-card);
		border: 1px solid var(--color-border);
		border-radius: 0.75rem;
		color: var(--color-text-primary);
		text-decoration: none;
	}
	.metric-card:hover {
		border-color: var(--color-accent);
	}
	.metric-label {
		font: 400 0.75rem var(--font-body);
		color: var(--color-text-secondary);
	}
	.metric-value {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0.5rem;
		min-height: 2.75rem;
	}
	.metric-value strong,
	.preview-count strong {
		font: 400 clamp(1.75rem, 2.5vw, 2.5rem)/1.2 var(--font-display);
		font-variant-numeric: tabular-nums;
		overflow-wrap: anywhere;
	}
	.metric-value > span {
		color: var(--color-text-muted);
		font-size: 0.6875rem;
	}
	.metric-value > .unique {
		font: 400 1.5rem var(--font-display);
	}
	.metric-change {
		display: flex;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.25rem;
		font-size: 0.6875rem;
		color: var(--color-text-muted);
		font-variant-numeric: tabular-nums;
	}
	.metric-change small {
		color: var(--color-text-muted);
		font: inherit;
	}
	.positive {
		color: var(--color-success);
	}
	.negative {
		color: var(--color-error);
	}
	.preview-count {
		display: flex;
		gap: 0.75rem;
		align-items: baseline;
		margin-bottom: 1rem;
	}
	.preview-count span,
	.preview-period {
		color: var(--color-text-secondary);
		font-size: 0.75rem;
	}
	.preview-period {
		margin: 0.75rem 0 1rem;
	}
	.metric-details {
		display: grid;
		gap: 0.75rem;
		margin: 1rem 0 1.5rem;
		font-size: 0.75rem;
	}
	.metric-details > div {
		display: flex;
		gap: 1rem;
		justify-content: space-between;
	}
	.metric-details dd {
		font-variant-numeric: tabular-nums;
	}
	.deck-preview {
		display: grid;
		gap: 0.75rem;
		margin: 1rem 0;
		list-style: none;
		padding: 0;
	}
	.deck-preview a {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.75rem;
	}
	.deck-preview img {
		border-radius: 0.25rem;
	}
	.deck-preview small {
		display: block;
		color: var(--color-text-secondary);
		margin-top: 0.25rem;
		font-size: 0.6875rem;
	}
	h3 {
		font: 400 1.125rem var(--font-display);
		margin: 1rem 0;
	}
	.close-preview {
		margin-left: 0.5rem;
	}
	@media (max-width: 1000px) {
		.metric-cards {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 360px) {
		.metric-cards {
			grid-template-columns: 1fr;
		}
	}
</style>
