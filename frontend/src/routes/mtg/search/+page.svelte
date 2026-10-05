<script lang="ts">
	import { Dialog } from 'bits-ui';
	import SearchBar from '#lib/components/search/SearchBar.svelte';
	import SearchFilters from '#lib/components/search/SearchFilters.svelte';
	import SearchResults from '#lib/components/search/SearchResults.svelte';
	import CardDetail from '#lib/components/cards/CardDetail.svelte';
	import { searchCards, browseCards, getFacets } from '#lib/search/catalog.ts';
	import { SearchFilterState } from '#lib/search/filters.svelte.ts';
	import { getActiveFilters } from '#lib/search/filter-options.ts';
	import { buildSearchContextKey } from '#lib/search/requestContext.ts';
	import type { CardDocument, FacetResponse } from '#lib/search/types.ts';
	import { activeGameState } from '#lib/state/activeGame.svelte.ts';
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
	let searchVersion = 0;
	let facetVersion = 0;
	let loadMoreController: AbortController | null = null;
	let catalogGeneration: string | null | undefined;

	const filters = new SearchFilterState();
	const activeFilters = $derived(getActiveFilters(filters));
	const browseMode = $derived(query.trim().length < 2);
	const requestContextKey = $derived(
		buildSearchContextKey({
			game: activeGameState.current,
			query,
			filters: filters.catalogFilters
		})
	);

	$effect(() => {
		const q = query.trim();
		const f = filters.catalogFilters;
		const game = activeGameState.current;
		const currentVersion = ++searchVersion;
		let controller: AbortController | null = null;

		loadMoreController?.abort();
		loadMoreController = null;

		loading = true;
		loadingMore = false;
		offset = 0;
		hasMore = false;
		error = null;

		const timer = setTimeout(async () => {
			controller = new AbortController();
			try {
				const result =
					q.length < 2
						? await browseCards({
								game,
								filters: f,
								limit: BROWSE_LIMIT,
								offset: 0,
								signal: controller.signal
							})
						: await searchCards(q, {
								game,
								filters: f,
								limit: SEARCH_LIMIT,
								offset: 0,
								signal: controller.signal
							});

				if (!controller.signal.aborted && currentVersion === searchVersion) {
					const nextOffset = result.hits.length;
					hits = result.hits;
					catalogGeneration = result.generationId;
					offset = nextOffset;
					hasMore = result.estimatedTotalHits > nextOffset;
				}
			} catch (err) {
				if (!controller.signal.aborted && currentVersion === searchVersion) {
					error = err instanceof Error ? err.message : 'An unexpected error occurred';
				}
			} finally {
				if (!controller.signal.aborted && currentVersion === searchVersion) {
					loading = false;
				}
			}
		}, 150);

		return () => {
			clearTimeout(timer);
			controller?.abort();
		};
	});

	$effect(() => {
		const f = filters.catalogFilters;
		const game = activeGameState.current;
		const currentVersion = ++facetVersion;
		const controller = new AbortController();

		facets = null;

		getFacets(f, controller.signal)
			.then((result) => {
				if (
					!controller.signal.aborted &&
					currentVersion === facetVersion &&
					game === activeGameState.current
				) {
					facets = result;
				}
			})
			.catch(() => {});

		return () => {
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

		const q = query.trim();
		const f = filters.catalogFilters;
		const game = activeGameState.current;
		const currentOffset = offset;
		const currentRequestContextKey = requestContextKey;
		const controller = new AbortController();
		loadMoreController = controller;

		try {
			const fetchPage = async (pageOffset: number) =>
				q.length < 2
					? await browseCards({
							game,
							filters: f,
							limit: BROWSE_LIMIT,
							offset: pageOffset,
							signal: controller.signal
						})
					: await searchCards(q, {
							game,
							filters: f,
							limit: SEARCH_LIMIT,
							offset: pageOffset,
							signal: controller.signal
						});

			let result = await fetchPage(currentOffset);
			const catalogChanged = result.generationId !== catalogGeneration;
			if (catalogChanged && !controller.signal.aborted) result = await fetchPage(0);
			if (!controller.signal.aborted && currentRequestContextKey === requestContextKey) {
				const nextOffset = (catalogChanged ? 0 : currentOffset) + result.hits.length;
				hits = catalogChanged ? result.hits : [...hits, ...result.hits];
				catalogGeneration = result.generationId;
				offset = nextOffset;
				hasMore = result.hits.length > 0 && result.estimatedTotalHits > nextOffset;
			}
		} catch {
			// Intentionally silent for load-more retries.
		} finally {
			if (loadMoreController === controller) {
				loadMoreController = null;
			}
			if (!controller.signal.aborted && currentRequestContextKey === requestContextKey) {
				loadingMore = false;
			}
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
	<div class="shrink-0 px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4">
		<div class="flex items-center justify-between gap-3">
			<div>
				<div class="page-title">
					<h1>Search</h1>
				</div>
			</div>
			<button
				onclick={() => (filtersOpen = !filtersOpen)}
				aria-haspopup="dialog"
				aria-label={`Filters, ${activeFilters.length} active`}
				aria-expanded={filtersOpen}
				class="btn btn-secondary md:hidden"
				style="
					background-color: var(--color-slate);
					border: 1px solid var(--color-border);
					color: var(--color-text-secondary);
				"
			>
				Filters
				{#if activeFilters.length}
					<span class="text-text-muted tabular-nums" aria-hidden="true">{activeFilters.length}</span
					>
				{/if}
			</button>
		</div>
		<SearchBar value={query} onInput={(value) => (query = value)} class="mt-3" />
		{#if activeFilters.length}
			<div
				class="mt-1 flex flex-wrap items-center gap-x-1"
				role="group"
				aria-label="Active filters"
			>
				{#each activeFilters as filter (filter.key)}
					<button
						type="button"
						class="btn btn-ghost min-h-11 gap-2 px-2 text-xs"
						aria-label={`Remove ${filter.label} filter`}
						onclick={filter.remove}
					>
						{filter.label}
						<svg
							aria-hidden="true"
							width="12"
							height="12"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.7"
							stroke-linecap="round"><path d="m6 6 12 12M6 18 18 6" /></svg
						>
					</button>
				{/each}
				<button
					type="button"
					class="btn btn-ghost min-h-11 px-2 text-xs text-text-muted underline underline-offset-4"
					onclick={() => filters.clear()}>Clear filters</button
				>
			</div>
		{/if}
	</div>

	<div class="border-t border-border mx-4 sm:mx-6" aria-hidden="true"></div>

	<div class="flex min-h-0 flex-1 gap-0">
		<div
			class="hidden shrink-0 overflow-y-auto px-6 py-4 md:block"
			style="border-right: 1px solid var(--color-border);"
		>
			<SearchFilters {filters} {facets} />
		</div>

		<Dialog.Root bind:open={filtersOpen}>
			<Dialog.Portal>
				<Dialog.Overlay class="filter-overlay fixed inset-0 z-40" />
				<Dialog.Content
					class="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-xl border border-border bg-stone p-5"
				>
					<div class="mb-3 flex items-center justify-between">
						<Dialog.Title class="text-lg font-semibold">Filter cards</Dialog.Title>
						<Dialog.Close class="btn btn-ghost" aria-label="Close filters">✕</Dialog.Close>
					</div>
					<Dialog.Description class="sr-only"
						>Narrow the catalog by color, rarity, card type, or legality.</Dialog.Description
					>
					<SearchFilters {filters} {facets} />
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>

		<div class="min-w-0 flex-1 overflow-y-auto p-3 sm:p-4">
			<div class="mb-4 flex items-center justify-between gap-3 text-xs text-text-muted">
				<span aria-live="polite"
					>{loading
						? 'Finding cards…'
						: `${hits.length} ${hits.length === 1 ? 'card' : 'cards'} loaded`}</span
				><span>Choose a card to view printings</span>
			</div>
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
						class="btn btn-secondary"
						style="background-color: var(--color-slate); border: 1px solid var(--color-border);"
					>
						Load more
					</button>
				</div>
			{/if}
		</div>

		{#if selectedCard}
			<CardDetail card={selectedCard} onClose={handleCloseDetail} />
		{/if}
	</div>
</div>
