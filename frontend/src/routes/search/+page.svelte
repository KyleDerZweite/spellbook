<script lang="ts">
  import { debounce } from '$lib/utils/debounce';
  import { searchCards } from '$lib/search/meilisearch';
  import { filters } from '$lib/search/filters.svelte';
  import type { CardDocument } from '$lib/search/types';
  import SearchBar from '$lib/components/search/SearchBar.svelte';
  import SearchFilters from '$lib/components/search/SearchFilters.svelte';
  import SearchResults from '$lib/components/search/SearchResults.svelte';

  let query = $state('');
  let hits = $state<CardDocument[]>([]);
  let loading = $state(false);
  let selectedCard = $state<CardDocument | null>(null);

  const doSearch = debounce(async (q: string, filterStrings: string[]) => {
    if (q.length < 2) {
      hits = [];
      loading = false;
      return;
    }
    loading = true;
    const result = await searchCards(q, { filter: filterStrings });
    hits = result.hits;
    loading = false;
  }, 250);

  $effect(() => {
    const q = query;
    const f = filters.meiliFilters;
    doSearch(q, f);
  });
</script>

<div class="space-y-6">
  <h1 class="text-2xl font-bold">Card Search</h1>

  <SearchBar bind:value={query} />

  <div class="flex flex-col gap-6 lg:flex-row">
    <aside class="w-full shrink-0 lg:w-56">
      <SearchFilters />
    </aside>

    <div class="flex-1">
      <SearchResults
        {hits}
        {loading}
        {query}
        onselect={(card) => (selectedCard = card)}
      />
    </div>
  </div>
</div>
