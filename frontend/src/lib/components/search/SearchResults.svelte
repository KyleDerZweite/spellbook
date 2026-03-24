<script lang="ts">
	import type { CardDocument } from '$lib/search/types';
	import CardGrid from '$lib/components/cards/CardGrid.svelte';

	interface Props {
		hits: CardDocument[];
		loading: boolean;
		query: string;
		selectedId?: string | null;
		onSelect?: (card: CardDocument) => void;
		class?: string;
	}

	let {
		hits,
		loading,
		query,
		selectedId = null,
		onSelect,
		class: className = ''
	}: Props = $props();
</script>

<div class="flex-1 {className}">
	{#if loading}
		<!-- Loading state -->
		<div class="flex items-center justify-center py-20">
			<div class="text-center">
				<div
					class="mx-auto mb-3 h-8 w-8 animate-spin rounded-full"
					style="border: 2px solid var(--color-gold-dim); border-top-color: var(--color-gold-bright);"
				></div>
				<p class="font-body text-sm italic text-text-secondary">Searching the archives...</p>
			</div>
		</div>
	{:else if query.length >= 2 && hits.length === 0}
		<!-- Empty state -->
		<div class="flex items-center justify-center py-20">
			<div class="text-center">
				<p class="font-display text-lg text-text-secondary">No Cards Found</p>
				<p class="mt-2 font-body text-sm italic text-text-muted">
					The archives hold no record of "{query}"
				</p>
			</div>
		</div>
	{:else if hits.length > 0}
		<CardGrid cards={hits} {selectedId} {onSelect} />
	{:else}
		<!-- Initial state -->
		<div class="flex items-center justify-center py-20">
			<div class="text-center">
				<p class="font-display text-lg text-text-secondary">Begin Your Search</p>
				<p class="mt-2 font-body text-sm italic text-text-muted">
					Type a card name to search the multiverse
				</p>
			</div>
		</div>
	{/if}
</div>
