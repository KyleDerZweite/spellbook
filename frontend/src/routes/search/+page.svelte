<script lang="ts">
	import SearchBar from '$lib/components/search/SearchBar.svelte';
	import SearchFilters from '$lib/components/search/SearchFilters.svelte';
	import SearchResults from '$lib/components/search/SearchResults.svelte';
	import CardDetail from '$lib/components/cards/CardDetail.svelte';
	import OrnamentalDivider from '$lib/components/layout/OrnamentalDivider.svelte';
	import { searchCards, browseCards, getFacets } from '$lib/search/meilisearch';
	import { SearchFilterState } from '$lib/search/filters.svelte';
	import type { CardDocument, FacetResponse } from '$lib/search/types';
	import { page } from '$app/state';

	const BROWSE_LIMIT = 50;
	const SEARCH_LIMIT = 50;

	let query = $state(page.url.searchParams.get('q') ?? '');
	let hits: CardDocument[] = $state([]);
	let loading = $state(false);
	let loadingMore = $state(false);
	let offset = $state(0);
	let hasMore = $state(false);
	let facets: FacetResponse | null = $state(null);
	let selectedCard: CardDocument | null = $state(null);
	let sentinel: HTMLDivElement | null = $state(null);

	const filters = new SearchFilterState();

	// True when no query or query is too short for search mode
	const browseMode = $derived(query.length < 2);

	// Main search/browse $effect with AbortController + debounce + cleanup
	$effect(() => {
		const q = query;
		const f = filters.meiliFilters;
		const controller = new AbortController();

		// Reset pagination on query/filter change (keep old hits visible until new ones arrive)
		offset = 0;
		hasMore = false;

		const timer = setTimeout(async () => {
			loading = true;
			try {
				if (q.length < 2) {
					// Browse mode
					const [browseResult, facetResult] = await Promise.all([
						browseCards({ filter: f, limit: BROWSE_LIMIT, offset: 0 }),
						getFacets(f)
					]);
					if (!controller.signal.aborted) {
						hits = browseResult.hits;
						facets = facetResult;
						hasMore = browseResult.estimatedTotalHits > BROWSE_LIMIT;
						offset = BROWSE_LIMIT;
					}
				} else {
					// Search mode
					const [searchResult, facetResult] = await Promise.all([
						searchCards(q, { filter: f, limit: SEARCH_LIMIT, offset: 0 }),
						getFacets(f)
					]);
					if (!controller.signal.aborted) {
						hits = searchResult.hits;
						facets = facetResult;
						hasMore = searchResult.estimatedTotalHits > SEARCH_LIMIT;
						offset = SEARCH_LIMIT;
					}
				}
			} catch {
				// Swallow aborted requests
			} finally {
				if (!controller.signal.aborted) {
					loading = false;
				}
			}
		}, 250);

		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});

	// Infinite scroll via IntersectionObserver on the sentinel element
	$effect(() => {
		if (!sentinel) return;
		const el = sentinel;

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
					loadMore();
				}
			},
			{ rootMargin: '200px' }
		);

		observer.observe(el);
		return () => observer.disconnect();
	});

	async function loadMore() {
		if (!hasMore || loading || loadingMore) return;
		loadingMore = true;

		const q = query;
		const f = filters.meiliFilters;
		const currentOffset = offset;

		try {
			let result;
			if (q.length < 2) {
				result = await browseCards({ filter: f, limit: BROWSE_LIMIT, offset: currentOffset });
			} else {
				result = await searchCards(q, { filter: f, limit: SEARCH_LIMIT, offset: currentOffset });
			}
			hits = [...hits, ...result.hits];
			offset = currentOffset + result.hits.length;
			hasMore = result.hits.length > 0 && result.estimatedTotalHits > offset;
		} catch {
			// Swallow errors
		} finally {
			loadingMore = false;
		}
	}

	function handleSelect(card: CardDocument) {
		selectedCard = selectedCard?.id === card.id ? null : card;
	}

	function handleCloseDetail() {
		selectedCard = null;
	}
</script>

<svelte:head>
	<title>Search | Spellbook</title>
</svelte:head>

<div class="flex h-full flex-col">
	<!-- Search header -->
	<div class="shrink-0 px-6 pt-6 pb-4">
		<h1 class="font-display text-2xl font-bold text-gold-bright">SEARCH</h1>
		<SearchBar value={query} onInput={(v) => (query = v)} class="mt-3 max-w-2xl" />
	</div>

	<OrnamentalDivider class="mx-6" />

	<!-- Main content area -->
	<div class="flex min-h-0 flex-1 gap-0">
		<!-- Filter panel -->
		<div
			class="shrink-0 overflow-y-auto px-6 py-4"
			style="border-right: 1px solid rgba(196, 146, 42, 0.15);"
		>
			<SearchFilters {filters} {facets} />
		</div>

		<!-- Results -->
		<div class="min-w-0 flex-1 overflow-y-auto p-4">
			<SearchResults
				{hits}
				{loading}
				{query}
				{browseMode}
				selectedId={selectedCard?.id}
				onSelect={handleSelect}
			/>

			<!-- Infinite scroll sentinel -->
			<div bind:this={sentinel} class="h-1 w-full"></div>

			<!-- Load-more spinner -->
			{#if loadingMore}
				<div class="flex items-center justify-center py-6">
					<div
						class="h-6 w-6 animate-spin rounded-full"
						style="border: 2px solid var(--color-gold-dim); border-top-color: var(--color-gold-bright);"
					></div>
				</div>
			{/if}
		</div>

		<!-- Card detail panel -->
		{#if selectedCard}
			<CardDetail card={selectedCard} onClose={handleCloseDetail} />
		{/if}
	</div>
</div>
