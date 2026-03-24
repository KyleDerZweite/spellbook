<script lang="ts">
	import SearchBar from '$lib/components/search/SearchBar.svelte';
	import SearchFilters from '$lib/components/search/SearchFilters.svelte';
	import SearchResults from '$lib/components/search/SearchResults.svelte';
	import CardDetail from '$lib/components/cards/CardDetail.svelte';
	import OrnamentalDivider from '$lib/components/layout/OrnamentalDivider.svelte';
	import { searchCards } from '$lib/search/meilisearch';
	import { SearchFilterState } from '$lib/search/filters.svelte';
	import type { CardDocument } from '$lib/search/types';

	let query = $state('');
	let hits: CardDocument[] = $state([]);
	let loading = $state(false);
	let selectedCard: CardDocument | null = $state(null);

	const filters = new SearchFilterState();

	// CRITICAL: search $effect with AbortController + cleanup to prevent navigation bugs
	$effect(() => {
		const q = query;
		const f = filters.meiliFilters;
		const controller = new AbortController();

		const timer = setTimeout(async () => {
			if (q.length < 2) {
				hits = [];
				loading = false;
				return;
			}
			loading = true;
			try {
				const result = await searchCards(q, { filter: f });
				if (!controller.signal.aborted) {
					hits = result.hits;
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

	function handleSelect(card: CardDocument) {
		selectedCard = selectedCard?.id === card.id ? null : card;
	}

	function handleCloseDetail() {
		selectedCard = null;
	}
</script>

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
			<SearchFilters {filters} />
		</div>

		<!-- Results -->
		<div class="min-w-0 flex-1 overflow-y-auto p-4">
			<SearchResults
				{hits}
				{loading}
				{query}
				selectedId={selectedCard?.id}
				onSelect={handleSelect}
			/>
		</div>

		<!-- Card detail panel -->
		{#if selectedCard}
			<CardDetail card={selectedCard} onClose={handleCloseDetail} />
		{/if}
	</div>
</div>
