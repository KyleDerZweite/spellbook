<script lang="ts">
	import type { CardDocument } from '#lib/search/types.ts';
	import RarityBadge from './RarityBadge.svelte';

	interface Props {
		card: CardDocument;
		selected?: boolean;
		onSelect?: (card: CardDocument) => void;
	}

	let { card, selected = false, onSelect }: Props = $props();
</script>

<button
	class="card-grid-item group min-w-0 cursor-pointer rounded-lg bg-transparent p-0 text-left"
	class:card-grid-item--selected={selected}
	onclick={() => onSelect?.(card)}
>
	<!-- Card image -->
	<div class="relative overflow-hidden" style="aspect-ratio: 5 / 7; border-radius: 9px;">
		<img
			src={card.image_uri || card.image_uri_small}
			alt={card.name}
			loading="lazy"
			class="block h-full w-full object-cover"
		/>
		<!-- Foil shimmer overlay -->
		{#if card.is_foil_available}
			<div
				class="foil-shimmer absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
			></div>
		{/if}
	</div>

	<!-- Card info -->
	<div class="px-0.5 py-2">
		<p class="truncate text-sm font-medium leading-tight text-text-primary" title={card.name}>
			{card.name}
		</p>
		<div class="mt-0.5 flex items-center gap-1.5">
			<span class="font-mono text-xs uppercase text-text-secondary">
				{card.set_code}
			</span>
			<RarityBadge rarity={card.rarity} />
		</div>
	</div>
</button>
