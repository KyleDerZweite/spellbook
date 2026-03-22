<script lang="ts">
  import { page } from '$app/state';
  import { state as stdb } from '$lib/spacetimedb/state.svelte';
  import CollectionView from '$lib/components/collections/CollectionView.svelte';

  let collection = $derived(stdb.collections.find((c) => c.id === page.params.id));
</script>

{#if collection}
  <CollectionView {collection} />
{:else}
  <div class="py-8 text-center">
    <p class="text-gray-500">Collection not found.</p>
    <a href="/collections" class="mt-2 text-sm text-accent-400 hover:underline">
      Back to collections
    </a>
  </div>
{/if}
