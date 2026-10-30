<script lang="ts">
	import ProportionChart from './ProportionChart.svelte';
	import type { DashboardDeck } from '@spellbook/contracts/dashboard.ts';
	let { deck }: { deck: DashboardDeck } = $props();
	const segments = $derived([
		{ label: 'Exact printing', value: deck.exact, color: 'var(--color-success)' },
		{ label: 'Alternate printing', value: deck.alternate, color: 'var(--color-violet)' },
		{ label: 'Missing', value: deck.missing, color: 'var(--color-warning)' }
	]);
	const available = $derived(deck.exact + deck.alternate);
</script>

<ProportionChart
	label={`${deck.name} availability: ${deck.exact.toLocaleString()} exact, ${deck.alternate.toLocaleString()} alternate, ${deck.missing.toLocaleString()} missing`}
	items={segments}
	kind="ring"
>
	{#snippet center()}<strong
			>{available.toLocaleString()}<span>/{deck.required.toLocaleString()}</span></strong
		><small>owned</small>{/snippet}
</ProportionChart>

<style>
	strong {
		color: var(--color-text-primary);
		font: 400 1.75rem/1.1 var(--font-display);
		font-variant-numeric: tabular-nums;
	}
	span {
		font: 0.5625rem var(--font-body);
		color: var(--color-text-secondary);
	}
	small {
		font-size: 0.5625rem;
		color: var(--color-text-secondary);
		margin-top: 0.35rem;
	}
</style>
