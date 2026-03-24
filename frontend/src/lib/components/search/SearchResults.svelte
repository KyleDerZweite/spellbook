<script lang="ts">
	import type { CardDocument } from '$lib/search/types';
	import CardGrid from '$lib/components/cards/CardGrid.svelte';

	interface Props {
		hits: CardDocument[];
		loading: boolean;
		query: string;
		browseMode: boolean;
		selectedId?: string | null;
		onSelect?: (card: CardDocument) => void;
		class?: string;
	}

	let {
		hits,
		loading,
		query,
		browseMode,
		selectedId = null,
		onSelect,
		class: className = ''
	}: Props = $props();
</script>

<div class="flex-1 {className}">
	{#if loading && hits.length === 0}
		<!-- Initial loading state -->
		<div class="flex items-center justify-center py-20">
			<div class="text-center">
				<div
					class="mx-auto mb-3 h-8 w-8 animate-spin rounded-full"
					style="border: 2px solid var(--color-gold-dim); border-top-color: var(--color-gold-bright);"
				></div>
				<p class="font-body text-sm italic text-text-secondary">
					{browseMode ? 'Loading the archives...' : 'Searching the archives...'}
				</p>
			</div>
		</div>
	{:else if !browseMode && query.length >= 2 && hits.length === 0 && !loading}
		<!-- Empty search state -->
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
	{/if}
</div>
