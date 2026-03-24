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
			class="group cursor-pointer overflow-hidden rounded text-left transition-all duration-200"
			style="
				background-color: var(--color-stone);
				border: {isSelected ? '2px solid var(--color-gold-bright)' : '1px solid rgba(196, 146, 42, 0.22)'};
				border-radius: 4px;
				box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04){isSelected ? ', 0 0 16px rgba(232, 184, 75, 0.3)' : ''};
				padding: 0;
			"
			onclick={() => onSelect?.(card)}
			onmouseenter={(e) => {
				if (!isSelected) {
					const el = e.currentTarget as HTMLElement;
					el.style.transform = 'translateY(-4px)';
					el.style.boxShadow = 'inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 8px 24px rgba(138, 106, 42, 0.25)';
					el.style.borderColor = 'rgba(196, 146, 42, 0.5)';
				}
			}}
			onmouseleave={(e) => {
				if (!isSelected) {
					const el = e.currentTarget as HTMLElement;
					el.style.transform = 'translateY(0)';
					el.style.boxShadow = 'inset 0 1px 0 rgba(255, 255, 255, 0.04)';
					el.style.borderColor = 'rgba(196, 146, 42, 0.22)';
				}
			}}
		>
			<!-- Card image -->
			<div class="relative" style="aspect-ratio: 5 / 7;">
				<img
					src={card.image_uri || card.image_uri_small}
					alt={card.name}
					loading="lazy"
					class="block h-full w-full object-cover"
					style="border-radius: 3px 3px 0 0;"
				/>
				<!-- Foil shimmer overlay -->
				{#if card.is_foil_available}
					<div
						class="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
						style="
							background: linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.15) 50%, transparent 60%);
							background-size: 200% 200%;
							animation: foil-shimmer 1.5s ease-in-out infinite;
							border-radius: 3px 3px 0 0;
						"
					></div>
				{/if}
			</div>

			<!-- Card info -->
			<div class="px-2 py-1.5">
				<p
					class="truncate font-display text-xs leading-tight text-text-primary"
					title={card.name}
				>
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
