<script lang="ts">
  import type { CardDocument } from '$lib/search/types';
  import CardGrid from '$lib/components/cards/CardGrid.svelte';

  let { hits, loading = false, query = '', onselect }: {
    hits: CardDocument[];
    loading?: boolean;
    query?: string;
    onselect?: (card: CardDocument) => void;
  } = $props();
</script>

{#if loading}
  <p class="py-8 text-center text-gray-500">Searching...</p>
{:else if query.length >= 2 && hits.length === 0}
  <p class="py-8 text-center text-gray-500">No results for "{query}"</p>
{:else}
  <CardGrid cards={hits} {onselect} />
{/if}
