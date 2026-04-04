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
	let error: string | null = $state(null);
	let offset = $state(0);
	let hasMore = $state(false);
	let facets: FacetResponse | null = $state(null);
	let selectedCard: CardDocument | null = $state(null);
	let sentinel: HTMLDivElement | null = $state(null);
	let filtersOpen = $state(false);

	const filters = new SearchFilterState();
	const browseMode = $derived(query.length < 2);

	$effect(() => {
		const q = query;
		const f = filters.meiliFilters;
		const controller = new AbortController();

		offset = 0;
		hasMore = false;
		error = null;

		const timer = setTimeout(async () => {
			loading = true;
			try {
				if (q.length < 2) {
					const [browseResult, facetResult] = await Promise.all([
						browseCards({ game: 'mtg', filter: f, limit: BROWSE_LIMIT, offset: 0 }),
						getFacets(f)
					]);
					if (!controller.signal.aborted) {
						hits = browseResult.hits;
						facets = facetResult;
						hasMore = browseResult.estimatedTotalHits > BROWSE_LIMIT;
						offset = BROWSE_LIMIT;
					}
				} else {
					const [searchResult, facetResult] = await Promise.all([
						searchCards(q, { game: 'mtg', filter: f, limit: SEARCH_LIMIT, offset: 0 }),
						getFacets(f)
					]);
					if (!controller.signal.aborted) {
						hits = searchResult.hits;
						facets = facetResult;
						hasMore = searchResult.estimatedTotalHits > SEARCH_LIMIT;
						offset = SEARCH_LIMIT;
					}
				}
			} catch (err) {
				if (!controller.signal.aborted) {
					error = err instanceof Error ? err.message : 'An unexpected error occurred';
				}
			} finally {
				if (!controller.signal.aborted) {
					loading = false;
				}
			}
		}, 150);

		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});

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
			const result =
				q.length < 2
					? await browseCards({
							game: 'mtg',
							filter: f,
							limit: BROWSE_LIMIT,
							offset: currentOffset
						})
					: await searchCards(q, {
							game: 'mtg',
							filter: f,
							limit: SEARCH_LIMIT,
							offset: currentOffset
						});

			hits = [...hits, ...result.hits];
			offset = currentOffset + result.hits.length;
			hasMore = result.hits.length > 0 && result.estimatedTotalHits > offset;
		} catch {
			// Intentionally silent for load-more retries.
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
	<title>MTG Search | Spellbook</title>
</svelte:head>

<div class="flex h-full flex-col">
	<div class="shrink-0 px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4">
		<div class="flex items-center justify-between gap-3">
			<div>
				<p class="font-mono text-[11px] uppercase tracking-[0.3em] text-gold-dim">MTG Catalog</p>
				<h1 class="font-display text-xl font-bold text-gold-bright sm:text-2xl">SEARCH</h1>
			</div>
			<button
				onclick={() => (filtersOpen = !filtersOpen)}
				class="flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 font-display text-xs uppercase tracking-wider transition-colors md:hidden"
				style="
					background-color: var(--color-slate);
					border: 1px solid rgba(196, 146, 42, 0.3);
					color: var(--color-text-secondary);
				"
			>
				&#9776; Filters
				{#if filters.hasFilters}
					<span
						class="flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold"
						style="background-color: var(--color-gold); color: var(--color-text-on-gold);">!</span
					>
				{/if}
			</button>
		</div>
		<SearchBar value={query} onInput={(value) => (query = value)} class="mt-3" />
	</div>

	<OrnamentalDivider class="mx-4 sm:mx-6" />

	<div class="flex min-h-0 flex-1 gap-0">
		<div
			class="hidden shrink-0 overflow-y-auto px-6 py-4 md:block"
			style="border-right: 1px solid rgba(196, 146, 42, 0.15);"
		>
			<SearchFilters {filters} {facets} />
		</div>

		{#if filtersOpen}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="fixed inset-0 z-30 md:hidden"
				onclick={() => (filtersOpen = false)}
				onkeydown={(e) => {
					if (e.key === 'Escape') filtersOpen = false;
				}}
			>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="absolute bottom-0 left-0 right-0 max-h-[70vh] overflow-y-auto rounded-t-xl p-5"
					style="
						background-color: var(--color-stone);
						border-top: 1px solid rgba(196, 146, 42, 0.3);
						box-shadow: 0 -8px 32px rgba(13, 11, 15, 0.8);
						animation: slide-up 200ms ease-out;
					"
					onclick={(e) => e.stopPropagation()}
					onkeydown={() => {}}
				>
					<div class="mb-3 flex items-center justify-between">
						<span class="font-display text-sm uppercase tracking-widest text-text-secondary"
							>Filters</span
						>
						<button
							onclick={() => (filtersOpen = false)}
							class="cursor-pointer border-none bg-transparent text-text-muted transition-colors hover:text-gold-bright"
							>&#10005;</button
						>
					</div>
					<SearchFilters {filters} {facets} />
				</div>
			</div>
		{/if}

		<div class="min-w-0 flex-1 overflow-y-auto p-3 sm:p-4">
			<SearchResults
				{hits}
				{loading}
				{error}
				{query}
				{browseMode}
				selectedId={selectedCard?.id}
				onSelect={handleSelect}
			/>

			<div bind:this={sentinel} class="h-1 w-full"></div>

			{#if loadingMore}
				<div class="flex items-center justify-center py-6">
					<div
						class="h-6 w-6 animate-spin rounded-full"
						style="border: 2px solid var(--color-gold-dim); border-top-color: var(--color-gold-bright);"
					></div>
				</div>
			{:else if hasMore && !loading}
				<div class="flex items-center justify-center py-4">
					<button
						onclick={loadMore}
						class="cursor-pointer rounded-lg px-6 py-2 font-display text-xs uppercase tracking-wider"
						style="background-color: var(--color-slate); border: 1px solid rgba(196, 146, 42, 0.3);"
					>
						Load More
					</button>
				</div>
			{/if}
		</div>

		{#if selectedCard}
			<CardDetail card={selectedCard} onClose={handleCloseDetail} />
		{/if}
	</div>
</div>
