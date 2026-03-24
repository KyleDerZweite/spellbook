<script lang="ts">
	import { parseManaSymbols } from '$lib/utils/manaCostParser';

	interface Props {
		cost: string;
		class?: string;
	}

	let { cost, class: className = '' }: Props = $props();

	let symbols = $derived(parseManaSymbols(cost));
</script>

<div class="ms-cost inline-flex items-center gap-0.5 {className}">
	{#each symbols as symbol (symbol.raw + symbol.cssClass)}
		<i
			class="ms ms-shadow {symbol.cssClass}"
			title={symbol.raw}
			role="img"
			aria-label="{symbol.raw} mana"
		></i>
	{/each}
</div>
