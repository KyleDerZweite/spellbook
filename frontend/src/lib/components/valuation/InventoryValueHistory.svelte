<script lang="ts">
	import type { Snippet } from 'svelte';
	import ValueHistoryChart from '#lib/components/charts/ValueHistoryChart.svelte';
	import type { InventoryValueHistory } from '@spellbook/contracts/inventory-value.ts';
	import { formatValueEUR } from '#lib/valuation/money.ts';
	import {
		historyChart,
		hasPlottableValue,
		observationTime
	} from '#lib/valuation/history-chart.ts';
	let {
		history,
		loading = false,
		error = '',
		onRetry,
		compact = false,
		summary
	}: {
		history: InventoryValueHistory | null;
		loading?: boolean;
		error?: string;
		onRetry?: () => void;
		compact?: boolean;
		summary?: Snippet;
	} = $props();
	let chart = $derived(historyChart(history?.points ?? []));
	let captured = $derived(history?.points.filter((point) => point.kind === 'Captured').length ?? 0);
</script>

<section
	class="analytics-panel value-history"
	aria-label={history?.identity ? 'Card value history' : 'Inventory value history'}
	aria-busy={loading}
>
	{#if summary}{@render summary()}{:else}<h2 class="analytics-title">
			{history?.identity ? 'Card value history' : 'Inventory value history'}
		</h2>{/if}
	{#if loading}<p class="mt-3 text-sm" role="status">Loading Inventory history…</p>
	{:else if error}
		<p class="mt-3 text-sm" role="alert">{error}</p>
		{#if onRetry}<button type="button" class="btn btn-secondary mt-2" onclick={onRetry}
				>Retry history</button
			>{/if}
	{:else if history}
		<p class="history-window">
			{#if compact}{history.timezone} reporting calendar{:else}{history.window.from} to {history
					.window.to} · Reporting calendar {history.timezone}{/if}
		</p>
		{#if !compact}<p class="mt-2 text-sm text-text-muted">
				Daily estimates captured near midnight. Missing days remain gaps.
			</p>{/if}
		{#if captured === 0 || chart.segments.length === 0}
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
					>{captured === 0 ? 'No daily observations yet' : 'No priced observations yet'}</strong
				>
				<p>
					{captured === 0
						? 'Closed reporting dates will appear here after capture.'
						: 'Captured copies have no known price references. Values remain unknown.'}
				</p>
			</div>
		{:else}
			<ValueHistoryChart
				points={history.points}
				from={history.window.from}
				to={history.window.to}
			/>
			{#if !compact}<p class="break-words text-xs text-text-muted">
					Highest captured covered value: {formatValueEUR(
						`${chart.maximum / 100n}.${(chart.maximum % 100n).toString().padStart(2, '0')}`
					)}.
				</p>
				<p class="text-xs text-text-muted">
					Filled points have complete coverage. Outlined points have partial coverage. Gaps and
					wholly unknown observations break the line.
				</p>{/if}
		{/if}
		<details class="mt-3" open={!compact}>
			<summary class="cursor-pointer text-sm">Daily observations and coverage</summary>
			{#if compact}<p class="history-notes">
					{history.window.from} to {history.window.to}. Daily estimates are captured near midnight.
					Filled points have complete coverage; outlined points have partial coverage. Missing dates
					and wholly unknown observations break the line.
				</p>{/if}
			<!-- svelte-ignore a11y_no_noninteractive_tabindex (The overflow region needs keyboard focus for horizontal scrolling.) -->
			<div
				class="mt-2 overflow-x-auto"
				tabindex="0"
				role="region"
				aria-label="Scrollable daily Inventory history"
			>
				<table class="w-full text-left text-xs">
					<caption class="pb-2 text-left text-text-muted"
						>Capture times use each saved reporting timezone.</caption
					>
					<thead
						><tr
							><th scope="col" class="p-2">Reporting day</th><th scope="col" class="p-2"
								>Covered value</th
							><th scope="col" class="p-2">Coverage</th><th scope="col" class="p-2">Observed at</th
							></tr
						></thead
					>
					<tbody>
						{#each history.points as point}
							<tr class="border-t border-border">
								<th scope="row" class="p-2 font-normal whitespace-nowrap">{point.day}</th>
								{#if point.kind === 'Gap'}<td colspan="3" class="p-2 text-text-muted"
										>Gap. No captured observation.</td
									>
								{:else}
									<td class="p-2 whitespace-nowrap tabular-nums"
										>{hasPlottableValue(point.estimate)
											? formatValueEUR(point.estimate.coveredValue)
											: 'Unknown'}{point.estimate.complete ? ' · complete' : ' · partial'}</td
									>
									<td class="p-2"
										>{point.estimate.coveredQuantity.toLocaleString()} / {point.estimate.totalQuantity.toLocaleString()}
										copies; {point.estimate.unknownQuantity.toLocaleString()} unknown; {point.estimate.staleQuantity.toLocaleString()}
										stale</td
									>
									<td class="p-2"
										><time datetime={point.observedAt}
											>{observationTime(point.observedAt, point.timezone)}</time
										>
										({point.timezone})</td
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
	.history-window {
		margin: 1rem 0 0.25rem;
		font-size: 0.6875rem;
		color: var(--color-text-muted);
	}
	.history-empty {
		display: flex;
		min-height: 156px;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.65rem;
		padding: 1.5rem 0.5rem;
		text-align: center;
		border-block: 1px dashed var(--color-border);
		margin-top: 1rem;
	}
	.history-empty svg {
		color: var(--color-text-muted);
	}
	.history-empty strong {
		font-weight: 500;
		font-size: 0.8125rem;
	}
	.history-empty p {
		font-size: 0.6875rem;
		line-height: 1.7;
		color: var(--color-text-muted);
		max-width: 40ch;
	}
	.history-notes {
		margin-top: 0.75rem;
		font-size: 0.6875rem;
		line-height: 1.7;
		color: var(--color-text-secondary);
	}
</style>
