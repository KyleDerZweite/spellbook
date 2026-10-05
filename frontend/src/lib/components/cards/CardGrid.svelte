<script lang="ts">
	import type { CardDocument } from '#lib/search/types.ts';
	import CardGridItem from './CardGridItem.svelte';

	interface Props {
		cards: CardDocument[];
		selectedId?: string | null;
		onSelect?: (card: CardDocument) => void;
		class?: string;
	}

	let { cards, selectedId = null, onSelect, class: className = '' }: Props = $props();
</script>

<div class="card-grid grid gap-4 {className}">
	{#each cards as card (card.id)}
		<CardGridItem {card} selected={selectedId === card.id} {onSelect} />
	{/each}
</div>

<style>
	.card-grid {
		grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
	}
	@media (max-width: 600px) {
		.card-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
