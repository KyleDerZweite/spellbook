<script lang="ts">
	import { page } from '$app/state';
	import CollectionView from '$lib/components/collections/CollectionView.svelte';
	import { spacetimeState } from '$lib/spacetimedb/state.svelte';

	let collectionId = $derived(page.params.id);
	let collection = $derived(spacetimeState.getCollection(collectionId));
</script>

{#if collection}
	<CollectionView {collection} />
{:else}
	<div class="flex items-center justify-center py-20">
		<div class="text-center">
			{#if spacetimeState.connected}
				<p class="font-display text-lg text-text-secondary">Collection Not Found</p>
				<p class="mt-2 font-body text-sm italic text-text-muted">
					This grimoire may have been lost to the void.
				</p>
			{:else}
				<div
					class="mx-auto mb-3 h-8 w-8 animate-spin rounded-full"
					style="border: 2px solid var(--color-gold-dim); border-top-color: var(--color-gold-bright);"
				></div>
				<p class="font-body text-sm italic text-text-secondary">
					Connecting to the archives...
				</p>
			{/if}
		</div>
	</div>
{/if}
