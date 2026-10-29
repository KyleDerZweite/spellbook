<script lang="ts">
	import type { Snippet } from 'svelte';
	import ValueHistoryChart from '#lib/components/charts/ValueHistoryChart.svelte';
	import type { InventoryValueHistory } from '@spellbook/contracts/inventory-value.ts';
	import { formatValueEUR } from '#lib/valuation/money.ts';
	import {
		historyChart,
		historyOverview,
		hasPlottableValue,
		observationTime
	} from '#lib/valuation/history-chart.ts';
	let {
		history,
		loading = false,
		error = '',
		onRetry,
		compact = false,
		summary,
		demo = false
	}: {
		history: InventoryValueHistory | null;
		loading?: boolean;
		error?: string;
		onRetry?: () => void;
		compact?: boolean;
		summary?: Snippet;
		demo?: boolean;
	} = $props();
	const chart = $derived(historyChart(history?.points ?? []));
	const overview = $derived(historyOverview(history?.points ?? []));
	const dateFormat = new Intl.DateTimeFormat('en-GB', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC'
	});
	const dayLabel = (day: string) => dateFormat.format(new Date(`${day}T00:00:00Z`));
</script>

<section
	class="analytics-panel value-history"
	class:compact
	aria-label={history?.identity ? 'Card value history' : 'Inventory value history'}
	aria-busy={loading}
>
	{#if summary}{@render summary()}{:else}
		<div class="history-heading">
			<h2 class="analytics-title">{history?.identity ? 'Card value' : 'Inventory value'}</h2>
			{#if history}<span class="period-label"
					>{dayLabel(history.window.from)} to {dayLabel(history.window.to)}</span
				>{/if}
		</div>
	{/if}
	{#if demo}<p class="demo-note">
			<span>Demo prices</span> Fixed card-price snapshot with an illustrative history.
		</p>{/if}
	{#if loading}<p class="mt-3 text-sm" role="status">Loading Inventory history…</p>
	{:else if error}
		<p class="mt-3 text-sm" role="alert">{error}</p>
		{#if onRetry}<button type="button" class="btn btn-secondary mt-2" onclick={onRetry}
				>Retry history</button
			>{/if}
	{:else if history}
		{#if !compact}
			<div class="history-overview">
				<div class="latest-value">
					<span
						>Latest priced day{overview.latest ? ` · ${dayLabel(overview.latest.day)}` : ''}</span
					>
					<strong
						>{overview.latest
							? formatValueEUR(overview.latest.estimate.coveredValue)
							: 'Unknown'}</strong
					>
				</div>
				<div class="period-change">
					<span>Covered value change</span><strong
						>{overview.changeAmount !== null
							? `${overview.change! > 0n ? '+' : overview.change! < 0n ? '−' : ''}${formatValueEUR(overview.changeAmount)}`
							: 'Unavailable'}</strong
					><small>Across priced days in this period</small>
				</div>
			</div>
		{/if}
		{#if overview.captured === 0 || chart.segments.length === 0}
			<div class="history-empty">
				<svg
					viewBox="0 0 24 24"
					width="24"
					height="24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7M3 3v6h6M12 7v5l3 2" /></svg
				>
				<strong
					>{overview.captured === 0
						? 'No daily observations yet'
						: 'No priced observations yet'}</strong
				>
				<p>
					{overview.captured === 0
						? 'Daily values appear after the first end-of-day capture.'
						: 'Saved copies have no known price references. Values remain unknown.'}
				</p>
			</div>
		{:else}
			<ValueHistoryChart
				points={history.points}
				from={history.window.from}
				to={history.window.to}
				expanded={!compact}
			/>
		{/if}
		{#if !compact}
			<div class="history-metrics">
				<div>
					<span>Price coverage</span><strong
						>{overview.latest
							? `${overview.latest.estimate.coveredQuantity.toLocaleString()} / ${overview.latest.estimate.totalQuantity.toLocaleString()}`
							: 'Unknown'}</strong
					><small>Copies on the latest priced day</small>
				</div>
				<div>
					<span>Recorded days</span><strong
						>{overview.captured} <small>/ {history.window.days}</small></strong
					><small>{overview.gaps} {overview.gaps === 1 ? 'day' : 'days'} without a capture</small>
				</div>
				<div>
					<span>Reporting calendar</span><strong class="calendar">{history.timezone}</strong><small
						>Daily capture near midnight</small
					>
				</div>
			</div>
		{/if}
		<details class="observations">
			<summary>Daily observations <span>{overview.captured} recorded</span></summary>
			<p class="history-notes">
				Covered values exclude unknown prices. Changes can reflect holdings and coverage as well as
				prices. Missing dates and wholly unknown observations break the chart line. Capture times
				use each saved reporting timezone.
			</p>
			<!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users can scroll the exact-data table.) -->
			<div
				class="table-scroll"
				tabindex="0"
				role="region"
				aria-label="Scrollable daily Inventory history"
			>
				<table>
					<caption class="sr-only">Exact daily values, coverage and observation times</caption>
					<thead
						><tr
							><th scope="col">Day</th><th scope="col" class="amount">Covered value</th><th
								scope="col">Price coverage</th
							><th scope="col">Capture</th></tr
						></thead
					>
					<tbody>
						{#each history.points.toReversed() as point}
							<tr
								><th scope="row"><time datetime={point.day}>{dayLabel(point.day)}</time></th>
								{#if point.kind === 'Gap'}<td colspan="3" class="missing"
										>No captured observation</td
									>
								{:else}
									<td class="amount"
										>{hasPlottableValue(point.estimate)
											? formatValueEUR(point.estimate.coveredValue)
											: 'Unknown'}{#if !point.estimate.complete}<small>Partial coverage</small
											>{/if}</td
									>
									<td
										><span
											>{point.estimate.coveredQuantity.toLocaleString()} / {point.estimate.totalQuantity.toLocaleString()}
											copies</span
										><small
											>{point.estimate.unknownQuantity.toLocaleString()} unknown · {point.estimate.staleQuantity.toLocaleString()}
											stale</small
										></td
									>
									<td class="capture"
										><time datetime={point.observedAt}
											>{observationTime(point.observedAt, point.timezone)}</time
										><small>{point.timezone}</small></td
									>
								{/if}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</details>
	{:else}<p class="mt-3 text-sm text-text-muted">History unavailable.</p>{/if}
</section>

<style>
	.value-history {
		min-width: 0;
	}
	.history-heading {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.5rem 1rem;
	}
	.period-label,
	.history-overview span,
	.history-metrics span {
		color: var(--color-text-muted);
		font-size: 0.6875rem;
	}
	.demo-note {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.6875rem;
		color: var(--color-text-muted);
		margin-top: 0.75rem;
	}
	.demo-note span {
		border: 1px solid var(--color-border);
		border-radius: 0.375rem;
		padding: 0.2rem 0.4rem;
		color: var(--color-text-secondary);
	}
	.history-overview {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 1rem 2rem;
		margin: 1.75rem 0 1rem;
	}
	.latest-value,
	.period-change {
		display: grid;
		gap: 0.35rem;
	}
	.latest-value strong {
		font: 400 clamp(2.25rem, 4vw, 3.25rem)/1.2 var(--font-display);
		font-variant-numeric: tabular-nums;
		overflow-wrap: anywhere;
	}
	.period-change strong {
		font-size: 1.125rem;
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		overflow-wrap: anywhere;
	}
	small {
		display: block;
		font-size: 0.625rem;
		font-weight: 400;
		color: var(--color-text-muted);
		line-height: 1.6;
	}
	.history-metrics {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 1rem;
		padding-block: 1.25rem;
		margin-top: 1rem;
		border-top: 1px solid var(--color-border);
	}
	.history-metrics > div {
		display: grid;
		gap: 0.4rem;
		align-content: start;
	}
	.history-metrics strong {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: baseline;
		font-size: 1.125rem;
		font-weight: 400;
		font-variant-numeric: tabular-nums;
	}
	.history-metrics .calendar {
		font-size: 0.8125rem;
		line-height: 1.75;
		overflow-wrap: anywhere;
	}
	.history-empty {
		display: flex;
		min-height: 180px;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 1.5rem 0.5rem;
		text-align: center;
		margin-top: 1rem;
	}
	.history-empty strong {
		font-size: 0.8125rem;
		font-weight: 500;
	}
	.history-empty p {
		color: var(--color-text-muted);
		max-width: 42ch;
		font-size: 0.6875rem;
		line-height: 1.7;
	}
	.observations {
		border-top: 1px solid var(--color-border);
		margin-top: 0.75rem;
		padding-top: 0.25rem;
	}
	.observations summary {
		cursor: pointer;
		padding-block: 0.85rem;
		font-size: 0.75rem;
	}
	.observations summary span {
		color: var(--color-text-muted);
		font-size: 0.625rem;
		margin-left: 0.5rem;
	}
	.history-notes {
		max-width: 85ch;
		font-size: 0.6875rem;
		line-height: 1.7;
		color: var(--color-text-secondary);
		margin-bottom: 1rem;
	}
	.table-scroll {
		overflow-x: auto;
	}
	table {
		width: 100%;
		text-align: left;
		font-size: 0.6875rem;
		border-collapse: collapse;
	}
	th,
	td {
		padding: 0.85rem 0.75rem;
		border-bottom: 1px solid var(--color-border);
		white-space: nowrap;
		font-weight: 400;
	}
	thead th {
		color: var(--color-text-muted);
		font-size: 0.625rem;
	}
	.amount {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.missing,
	.capture {
		color: var(--color-text-muted);
	}
	.compact .observations {
		margin-top: 1rem;
	}
	@media (max-width: 540px) {
		.history-metrics {
			grid-template-columns: 1fr 1fr;
		}
		.history-metrics > div:last-child {
			grid-column: 1 / -1;
		}
		.history-overview {
			margin-top: 1.25rem;
		}
		.period-change {
			gap: 0.2rem;
		}
	}
</style>
