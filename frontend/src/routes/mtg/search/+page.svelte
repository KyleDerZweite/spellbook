<script lang="ts">
	import { Dialog } from 'bits-ui';
	import SearchBar from '#lib/components/search/SearchBar.svelte';
	import SearchFilters from '#lib/components/search/SearchFilters.svelte';
	import SearchResults from '#lib/components/search/SearchResults.svelte';
	import CardDetail from '#lib/components/cards/CardDetail.svelte';
	import {
		CatalogWindow,
		cardAt,
		type CatalogRange,
		type CatalogWindowSnapshot
	} from '#lib/search/catalogWindow.ts';
	import { SearchFilterState } from '#lib/search/filters.svelte.ts';
	import { getActiveFilters } from '#lib/search/filter-options.ts';
	import type { CardDocument } from '#lib/search/types.ts';
	import { activeGameState } from '#lib/state/activeGame.svelte.ts';
	import { page } from '$app/state';

	let query = $state(page.url.searchParams.get('q') ?? '');
	let snapshot: CatalogWindowSnapshot = $state({
		pages: new Map(),
		total: 0,
		generation: undefined,
		facets: null,
		loading: true,
		error: null,
		reset: 0
	});
	let selectedCard: CardDocument | null = $state(null);
	let filtersOpen = $state(false);
	let range: CatalogRange = $state({ start: 0, end: 50, direction: 1 });
	const warmedImages = new Set<string>();
	const catalog = new CatalogWindow((next) => {
		snapshot = next;
	});
	const filters = new SearchFilterState();
	const activeFilters = $derived(getActiveFilters(filters));
	const browseMode = $derived(query.trim().length < 2);
	const facets = $derived(snapshot.facets);
	const loading = $derived(snapshot.loading);
	const error = $derived(snapshot.error);

	function resetFocus() {
		document.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
	}

	$effect(() => {
		catalog.activate({
			game: activeGameState.current,
			query,
			filters: filters.catalogFilters,
			limit: 50
		});
		const timer = setTimeout(() => catalog.start(), 150);
		return () => {
			clearTimeout(timer);
			catalog.dispose();
		};
	});

	function handleRange(next: CatalogRange) {
		range = next;
		catalog.setRange(next);
	}

	$effect(() => {
		const current = snapshot;
		const windowRange = range;
		const connection = (
			navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
		).connection;
		if (connection?.saveData || ['slow-2g', '2g'].includes(connection?.effectiveType ?? '')) return;
		const timer = setTimeout(() => {
			for (let step = 0; step < 12; step++) {
				const index =
					windowRange.direction === 1 ? windowRange.end + step : windowRange.start - 1 - step;
				const card = cardAt(current, index);
				const url = card?.image_uri || card?.image_uri_small;
				if (!url || warmedImages.has(url)) continue;
				warmedImages.add(url);
				if (warmedImages.size > 120) warmedImages.delete(warmedImages.values().next().value!);
				const image = new Image();
				image.decoding = 'async';
				image.src = url;
			}
		}, 120);
		return () => clearTimeout(timer);
	});

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

<div class="workspace-container flex h-full flex-col">
	<div class="shrink-0 pb-3 sm:pb-4">
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

	<div class="border-t border-border" aria-hidden="true"></div>

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

		<div class="min-w-0 flex-1 overflow-y-auto p-3 sm:p-4" aria-label="Card results">
			{#if !error}<div class="mb-4 flex items-center justify-between gap-3 text-xs text-text-muted">
					<span aria-live="polite"
						>{loading
							? snapshot.total
								? `${snapshot.total.toLocaleString()} cards · Loading range…`
								: 'Finding cards…'
							: `${snapshot.total.toLocaleString()} ${snapshot.total === 1 ? 'card' : 'cards'}`}</span
					>
				</div>{/if}
			<SearchResults
				totalCount={snapshot.total}
				getCard={(index) => cardAt(snapshot, index)}
				onRangeChange={handleRange}
				resetKey={snapshot.reset}
				onFocusReset={resetFocus}
				{loading}
				{error}
				{query}
				{browseMode}
				onRetry={() => catalog.retry()}
				onClearFilters={() => filters.clear()}
				hasFilters={activeFilters.length > 0}
				selectedId={selectedCard?.id}
				onSelect={handleSelect}
			/>
		</div>

		{#if selectedCard}
			<CardDetail card={selectedCard} onClose={handleCloseDetail} />
		{/if}
	</div>
</div>
