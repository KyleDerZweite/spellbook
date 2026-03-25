<script lang="ts">
	import { parseManaSymbols } from '$lib/utils/manaCostParser';

	interface Props {
		cost: string;
		class?: string;
	}

	let { cost, class: className = '' }: Props = $props();

	let symbols = $derived(parseManaSymbols(cost));
</script>

<div class="inline-flex items-center gap-0.5 {className}">
	{#each symbols as symbol, i (i)}
		<i
			class="ms ms-cost ms-shadow {symbol.cssClass}"
			title={symbol.raw}
			role="img"
			aria-label="{symbol.raw} mana"
		></i>
	{/each}
</div>
