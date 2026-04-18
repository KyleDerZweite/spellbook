<script lang="ts">
	import type { CardDocument } from '$lib/search/types';
	import RarityBadge from './RarityBadge.svelte';

	interface Props {
		cards: CardDocument[];
		selectedId?: string | null;
		onSelect?: (card: CardDocument) => void;
		class?: string;
	}

	let { cards, selectedId = null, onSelect, class: className = '' }: Props = $props();
</script>

<div
	class="grid gap-4 {className}"
	style="grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));"
>
	{#each cards as card (card.id)}
		{@const isSelected = selectedId === card.id}
		<button
			class="card-grid-item group cursor-pointer overflow-hidden rounded bg-stone p-0 text-left"
			class:card-grid-item--selected={isSelected}
			onclick={() => onSelect?.(card)}
		>
			<!-- Card image -->
			<div
				class="relative overflow-hidden"
				style="aspect-ratio: 5 / 7; border-radius: 8px 8px 0 0;"
			>
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
			<div class="px-2 py-1.5">
				<p class="truncate font-display text-xs leading-tight text-text-primary" title={card.name}>
					{card.name}
				</p>
				<div class="mt-0.5 flex items-center gap-1.5">
					<span class="font-mono text-[10px] uppercase text-text-secondary">
						{card.set_code}
					</span>
					<RarityBadge rarity={card.rarity} />
				</div>
			</div>
		</button>
	{/each}
</div>
