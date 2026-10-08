<script lang="ts">
	import type { InventoryValueHistory } from '@spellbook/contracts/inventory-value.ts';
	import { formatReferenceEUR } from '#lib/valuation/money.ts';
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
		compact = false
	}: {
		history: InventoryValueHistory | null;
		loading?: boolean;
		error?: string;
		onRetry?: () => void;
		compact?: boolean;
	} = $props();
	let chart = $derived(historyChart(history?.points ?? []));
	let captured = $derived(history?.points.filter((point) => point.kind === 'Captured').length ?? 0);
</script>

<section
	class="rounded-lg border border-border bg-stone p-4"
	aria-label="Personal Inventory history"
	aria-busy={loading}
>
	<h2 class="text-lg font-semibold">Personal Inventory history</h2>
	{#if loading}<p class="mt-3 text-sm" role="status">Loading Inventory history…</p>
	{:else if error}
		<p class="mt-3 text-sm" role="alert">{error}</p>
		{#if onRetry}<button type="button" class="btn btn-secondary mt-2" onclick={onRetry}
				>Retry history</button
			>{/if}
	{:else if history}
		<p class="mt-1 text-xs text-text-muted">
			{history.window.from} to {history.window.to} · Reporting calendar {history.timezone}
		</p>
		<p class="mt-2 text-sm text-text-muted">
			Captured covered value near day end. Unknown references are excluded. Missing observations
			remain gaps.
		</p>
		{#if captured === 0}<p class="mt-3 text-sm">No captured observations in this window.</p>
		{:else if chart.segments.length === 0}<p class="mt-3 text-sm">
				All captured quantities have unknown references. No value can be plotted.
			</p>
		{:else}
			<svg
				viewBox="0 0 640 180"
				class="mt-3 w-full text-text"
				role="img"
				aria-label="Covered value history. Exact amounts, coverage and observation times appear in the table below."
			>
				<line x1="24" y1="148" x2="616" y2="148" stroke="currentColor" opacity="0.2" />
				{#each chart.segments as segment}
					<polyline
						points={segment.map(({ x, y }) => `${x},${y}`).join(' ')}
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					/>
					{#each segment as { x, y, point }}
						<circle
							cx={x}
							cy={y}
							r="3.5"
							stroke="currentColor"
							stroke-width="2"
							fill={point.estimate.complete ? 'currentColor' : 'var(--color-stone)'}
						>
							<title
								>{point.day}: {formatReferenceEUR(point.estimate.coveredValue)} covered; {point
									.estimate.coveredQuantity} of {point.estimate.totalQuantity} copies. {observationTime(
									point.observedAt,
									point.timezone
								)} ({point.timezone})</title
							>
						</circle>
					{/each}
				{/each}
				<text x="24" y="174" fill="currentColor" font-size="11">{history.window.from}</text>
				<text x="616" y="174" text-anchor="end" fill="currentColor" font-size="11"
					>{history.window.to}</text
				>
			</svg>
			<p class="break-words text-xs text-text-muted">
				Chart scale: {formatReferenceEUR('0.00')} to {formatReferenceEUR(
					`${chart.maximum / 100n}.${(chart.maximum % 100n).toString().padStart(2, '0')}`
				)}.
			</p>
			<p class="text-xs text-text-muted">
				Filled points have complete coverage. Outlined points have partial coverage. Gaps and wholly
				unknown observations break the line.
			</p>
		{/if}
		<details class="mt-3" open={!compact}>
			<summary class="cursor-pointer text-sm">Daily observations and coverage</summary>
			<!-- svelte-ignore a11y_no_noninteractive_tabindex (The overflow region needs keyboard focus for horizontal scrolling.) -->
			<div
				class="mt-2 overflow-x-auto"
				tabindex="0"
				role="region"
				aria-label="Scrollable daily Inventory history"
			>
				<table class="w-full text-left text-xs">
					<caption class="pb-2 text-left text-text-muted"
						>Actual observation times use each saved reporting timezone. Observations do not
						reconstruct exact midnight holdings.</caption
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
											? formatReferenceEUR(point.estimate.coveredValue)
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
