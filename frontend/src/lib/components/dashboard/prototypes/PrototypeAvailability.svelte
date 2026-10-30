<script lang="ts">
	import ProportionChart from '#lib/components/charts/ProportionChart.svelte';
	import type { DashboardDeck } from '@spellbook/contracts/dashboard.ts';
	let { deck }: { deck: DashboardDeck } = $props();
	const items = $derived([
		{ label: 'Exact printing', value: deck.exact, color: 'var(--color-success)' },
		{ label: 'Alternate printing', value: deck.alternate, color: 'var(--color-violet)' },
		{ label: 'Missing', value: deck.missing, color: 'var(--color-warning)' }
	]);
</script>

<ProportionChart label={`${deck.name} availability`} {items} kind="ring">
	{#snippet center()}<strong>{(deck.exact + deck.alternate).toLocaleString()}</strong><small
			>of {deck.required.toLocaleString()}</small
		>{/snippet}
</ProportionChart>

<style>
	strong {
		font: 400 1.75rem/1.1 var(--font-display);
		font-variant-numeric: tabular-nums;
		color: var(--color-text-primary);
	}
	small {
		margin-top: 4px;
		font: 400 11px var(--font-interface);
		color: var(--color-text-secondary);
	}
</style>
