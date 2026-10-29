<script lang="ts">
	import type { ValueEstimate } from '@spellbook/contracts/inventory-value.ts';
	import { formatValueEUR } from '#lib/valuation/money.ts';
	import { estimateLabel } from '#lib/valuation/history-chart.ts';
	let {
		estimate,
		title = 'Inventory value',
		error = '',
		evaluatedAt,
		compact = false
	}: {
		estimate: ValueEstimate | null;
		title?: string;
		error?: string;
		evaluatedAt?: string;
		compact?: boolean;
	} = $props();
	const percent = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 });
</script>

<section class={['value-summary', !compact && 'analytics-panel']} class:compact aria-label={title}>
	<div class="value-heading">
		<h2 class="text-sm font-medium text-text-muted">{title}</h2>
		{#if error}<p class="mt-2 text-sm" role="alert">{error}</p>
		{:else if estimate}
			<p class="value-amount">
				{estimate.totalQuantity > 0 && estimate.coveredQuantity === 0
					? 'Unknown'
					: formatValueEUR(estimate.coveredValue)}
			</p>
			<p class="value-label">{estimateLabel(estimate)}</p>
		{:else}<p class="mt-2 text-sm text-text-muted">Value unavailable.</p>{/if}
	</div>
	{#if estimate && !error}
		{#if compact && estimate.totalQuantity > 0}
			<div class="coverage-meter">
				<span>Price coverage</span><strong
					>{percent.format(estimate.coveredQuantity / estimate.totalQuantity)}</strong
				><progress
					max={estimate.totalQuantity}
					value={estimate.coveredQuantity}
					aria-label="Copies with known price references"
				></progress><small
					>{estimate.coveredQuantity.toLocaleString()} / {estimate.totalQuantity.toLocaleString()} copies</small
				>
			</div>
		{/if}
		{#if compact}<details class="coverage-details">
				<summary>Coverage details</summary>{@render coverageDetails()}
			</details>
		{:else}{@render coverageDetails()}{/if}
	{/if}
</section>

{#snippet coverageDetails()}
	{#if estimate}
		<p class="mt-2 text-xs text-text-muted">
			{estimate.coveredQuantity.toLocaleString()} of {estimate.totalQuantity.toLocaleString()} copies
			covered. {estimate.unknownQuantity.toLocaleString()} unknown. {estimate.staleQuantity.toLocaleString()}
			covered by stale references.
		</p>
		{#if !estimate.complete}<p class="mt-1 text-xs text-text-muted">
				Unknown references are excluded from the covered value.
			</p>{/if}
		{#if evaluatedAt}<p class="mt-2 text-xs text-text-muted">
				Evaluated <time datetime={evaluatedAt}>{new Date(evaluatedAt).toLocaleString()}</time>.
			</p>{/if}
	{/if}
{/snippet}

<style>
	.value-amount {
		font-family: var(--font-display);
		font-weight: 400;
		font-size: clamp(2rem, 3vw, 3rem);
		line-height: 1.2;
		overflow-wrap: anywhere;
		margin: 1.25rem 0 0.75rem;
		font-variant-numeric: tabular-nums;
	}
	.value-label {
		margin-top: 0.25rem;
		font-size: 0.875rem;
	}
	.compact {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(7rem, 0.45fr);
		gap: 0.75rem 1.5rem;
		align-items: center;
	}
	.compact h2 {
		font: 400 1.125rem var(--font-display);
		color: var(--color-text-primary);
	}
	.compact .value-amount {
		margin: 0.75rem 0 0.25rem;
		font-size: clamp(2rem, 3vw, 2.75rem);
	}
	.compact .value-label {
		font-size: 0.6875rem;
		color: var(--color-text-muted);
	}
	.coverage-meter {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.4rem;
		font-size: 0.6875rem;
		color: var(--color-text-secondary);
	}
	.coverage-meter strong {
		color: var(--color-text-primary);
		font-weight: 500;
		font-variant-numeric: tabular-nums;
	}
	progress {
		display: block;
		grid-column: 1/-1;
		width: 100%;
		height: 5px;
		border: 0;
		border-radius: 3px;
		overflow: hidden;
		background: var(--color-muted);
		accent-color: var(--color-chart-primary);
	}
	progress::-webkit-progress-bar {
		background: var(--color-muted);
	}
	progress::-webkit-progress-value {
		background: var(--color-chart-primary);
	}
	progress::-moz-progress-bar {
		background: var(--color-chart-primary);
	}
	small {
		grid-column: 1/-1;
		color: var(--color-text-muted);
	}
	.coverage-details {
		grid-column: 1/-1;
		font-size: 0.6875rem;
		color: var(--color-text-secondary);
	}
	summary {
		cursor: pointer;
		width: fit-content;
	}
	@media (max-width: 420px) {
		.compact {
			grid-template-columns: minmax(0, 1fr) minmax(6rem, 0.5fr);
			gap: 0.75rem;
		}
	}
</style>
