<script lang="ts">
	import type { ValueEstimate } from '@spellbook/contracts/inventory-value.ts';
	import { formatReferenceEUR } from '#lib/valuation/money.ts';
	import { estimateLabel } from '#lib/valuation/history-chart.ts';
	let {
		estimate,
		title = 'Inventory value',
		error = '',
		evaluatedAt
	}: {
		estimate: ValueEstimate | null;
		title?: string;
		error?: string;
		evaluatedAt?: string;
	} = $props();
</script>

<section class="rounded-lg border border-border bg-stone p-4" aria-label={title}>
	<h2 class="text-sm font-medium text-text-muted">{title}</h2>
	{#if error}
		<p class="mt-2 text-sm" role="alert">{error}</p>
	{:else if estimate}
		<p class="mt-2 break-words text-2xl font-semibold tabular-nums">
			{estimate.totalQuantity > 0 && estimate.coveredQuantity === 0
				? 'Unknown'
				: formatReferenceEUR(estimate.coveredValue)}
		</p>
		<p class="mt-1 text-sm">{estimateLabel(estimate)}</p>
		<p class="mt-2 text-xs text-text-muted">
			{estimate.coveredQuantity.toLocaleString()} of {estimate.totalQuantity.toLocaleString()} copies
			covered.
			{estimate.unknownQuantity.toLocaleString()} unknown. {estimate.staleQuantity.toLocaleString()} covered
			by stale references.
		</p>
		{#if !estimate.complete}<p class="mt-1 text-xs text-text-muted">
				Unknown references are excluded from the covered value.
			</p>{/if}
		{#if evaluatedAt}<p class="mt-2 text-xs text-text-muted">
				Evaluated <time datetime={evaluatedAt}>{new Date(evaluatedAt).toLocaleString()}</time>.
			</p>{/if}
	{:else}
		<p class="mt-2 text-sm text-text-muted">Value unavailable.</p>
	{/if}
</section>
