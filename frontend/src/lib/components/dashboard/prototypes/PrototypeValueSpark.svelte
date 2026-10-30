<script lang="ts">
	import { line } from 'd3-shape';
	import type { InventoryValueHistory } from '@spellbook/contracts/inventory-value.ts';
	import { historyChart } from '#lib/valuation/history-chart.ts';
	let { history }: { history: InventoryValueHistory | null } = $props();
	const chart = $derived(historyChart(history?.points ?? []));
	const from = $derived(new Date(`${history?.window.from ?? '2000-01-01'}T00:00:00Z`).getTime());
	const duration = $derived(
		Math.max(86400000, new Date(`${history?.window.to ?? '2000-01-01'}T00:00:00Z`).getTime() - from)
	);
	const shape = $derived(
		line<(typeof chart.segments)[number][number]>()
			.x(({ point }) => 3 + ((new Date(`${point.day}T00:00:00Z`).getTime() - from) / duration) * 86)
			.y(
				({ value }) =>
					29 -
					(Number(((value - chart.axis.lower) * 1000000n) / (chart.axis.upper - chart.axis.lower)) /
						1000000) *
						24
			)
	);
</script>

{#if chart.segments.length}<svg viewBox="0 0 94 34" role="img" aria-label="Inventory value history"
		><g
			>{#each chart.segments as segment}<path d={shape(segment) ?? ''} />{/each}</g
		></svg
	>{/if}

<style>
	svg {
		width: 74px;
		height: 30px;
		flex-shrink: 0;
	}
	path {
		fill: none;
		stroke: var(--color-chart-primary);
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
</style>
