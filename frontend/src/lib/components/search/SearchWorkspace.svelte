<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { onNavigate } from '$app/navigation';
	import SearchBar from '#lib/components/search/SearchBar.svelte';
	import SearchFilters from '#lib/components/search/SearchFilters.svelte';
	import SearchResults from '#lib/components/search/SearchResults.svelte';
	import CardInspector from '#lib/components/cards/CardInspector.svelte';
	import ScrollArea from '#lib/components/ui/scroll-area/ScrollArea.svelte';
	import { cancelWheelScroll } from '#lib/components/ui/scroll-area/wheel.ts';
	import { cardAt, type CatalogRange } from '#lib/search/catalogWindow.ts';
	import { getSearchSession } from '#lib/search/session.svelte.ts';
	import { onDestroy, tick, untrack, type Snippet } from 'svelte';
	import { getActiveFilters } from '#lib/search/filter-options.ts';
	import type { CardDocument } from '#lib/search/types.ts';

	let { controls }: { controls?: Snippet } = $props();
	const session = getSearchSession();
	const filters = session.filters;
	const catalog = session.catalog;
	// Capture before the new viewport can emit its initial zero scroll position.
	const initialResultsScrollTop = untrack(() => session.scrollTop);
	const initialResultsReset = untrack(() => session.snapshot.reset);
	const query = $derived(session.query);
	const snapshot = $derived(session.snapshot);
	const selectedCard = $derived(session.selectedCard);
	let backButton: HTMLButtonElement | null = $state(null);
	let searchInput: HTMLInputElement | null = $state(null);
	let resultsElement: HTMLDivElement | null = $state(null);
	let preservingPosition = false;
	let resultTrigger: HTMLElement | null = null;
	let filtersOpen = $state(false);
	let range: CatalogRange = $state(session.range);
	const warmedImages = new Set<string>();
	const activeFilters = $derived(getActiveFilters(filters));
	const browseMode = $derived(query.trim().length < 2);
	const facets = $derived(snapshot.facets);
	const loading = $derived(snapshot.loading);
	const error = $derived(snapshot.error);
	onNavigate(({ shallow }) => {
		if (shallow || !resultsElement) return;
		cancelWheelScroll(resultsElement);
		session.scrollTop = resultsElement.scrollTop;
		preservingPosition = true;
		return () => {
			preservingPosition = false;
		};
	});

	function resetFocus() {
		if (selectedCard) backButton?.focus();
		else searchInput?.focus();
	}

	$effect(() => {
		void query;
		void filters.catalogFilters;
		const timer = setTimeout(() => untrack(() => session.activate()), 150);
		return () => {
			clearTimeout(timer);
			catalog.dispose();
		};
	});

	$effect(() => {
		if (selectedCard) void tick().then(() => requestAnimationFrame(() => backButton?.focus()));
	});

	$effect(() => {
		session.focus = resetFocus;
	});
	onDestroy(() => {
		if (session.focus === resetFocus) session.focus = () => {};
	});

	function handleRange(next: CatalogRange) {
		range = next;
		session.range = next;
		catalog.setRange(next);
	}

	$effect(() => {
		if (selectedCard) return;
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
		resultTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		session.selectedCard = selectedCard?.id === card.id ? null : card;
	}

	function handleCloseDetail() {
		if (session.pending) return;
		const id = selectedCard?.id;
		session.selectedCard = null;
		void tick().then(() => {
			const card = id
				? resultsElement?.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(id)}"]`)
				: null;
			if (card) card.focus();
			else if (resultTrigger?.isConnected) resultTrigger.focus();
			else resetFocus();
		});
	}
</script>

<div class="catalog-workspace flex min-h-0 flex-1 flex-col">
	<div class="shrink-0 pb-3 sm:pb-4">
		<div class="search-toolbar flex items-center justify-between gap-3">
			{#if selectedCard}
				<button
					bind:this={backButton}
					class="btn btn-ghost"
					onclick={handleCloseDetail}
					disabled={session.pending}>← Back to results</button
				>
			{:else}
				<SearchBar
					bind:inputRef={searchInput}
					value={query}
					onInput={(value) => session.setQuery(value)}
					class="search-query min-w-0 flex-1"
				/>
			{/if}
			<button
				onclick={() => (filtersOpen = !filtersOpen)}
				aria-haspopup="dialog"
				aria-label={`Filters, ${activeFilters.length} active`}
				aria-expanded={filtersOpen}
				class="btn btn-secondary md:hidden"
				hidden={!!selectedCard}
				style="
					background-color: var(--color-slate);
					border: 1px solid var(--color-border);
					color: var(--color-text-secondary);
				"
			>
				Filters
				{#if activeFilters.length && !selectedCard}
					<span class="text-text-muted tabular-nums" aria-hidden="true">{activeFilters.length}</span
					>
				{/if}
			</button>
			{@render controls?.()}
		</div>
	</div>

	<div class="border-t border-border" aria-hidden="true"></div>

	<div class="relative flex min-h-0 flex-1">
		<div class="flex min-h-0 flex-1 gap-0" style:visibility={selectedCard ? 'hidden' : undefined}>
			<ScrollArea
				class="search-sidebar hidden shrink-0 md:block"
				viewportClass="search-sidebar-content"
				viewportLabel="Search filters"
			>
				<SearchFilters {filters} {facets} />
			</ScrollArea>

			<Dialog.Root bind:open={filtersOpen}>
				<Dialog.Portal>
					<Dialog.Overlay class="filter-overlay fixed inset-0 z-[80]" />
					<Dialog.Content
						class="fixed inset-x-0 bottom-0 z-[90] flex h-[min(85dvh,44rem)] flex-col rounded-t-xl border border-border bg-stone p-5"
					>
						<div class="mb-3 flex items-center justify-between">
							<Dialog.Title class="text-lg font-semibold">Filter cards</Dialog.Title>
							<Dialog.Close class="btn btn-ghost" aria-label="Close filters">✕</Dialog.Close>
						</div>
						<Dialog.Description class="sr-only"
							>Narrow the catalog by color, rarity, card type, or legality.</Dialog.Description
						>
						<ScrollArea class="min-h-0 flex-1" viewportLabel="Search filters">
							<SearchFilters {filters} {facets} />
						</ScrollArea>
					</Dialog.Content>
				</Dialog.Portal>
			</Dialog.Root>

			<div class="search-results-column flex min-h-0 min-w-0 flex-1 flex-col">
				<div class="search-status" aria-live="polite">
					<span class="result-count"
						>{loading && !snapshot.total
							? 'Finding cards…'
							: `${snapshot.total.toLocaleString()} ${snapshot.total === 1 ? 'card' : 'cards'}`}</span
					>
					{#if error}
						<span class="search-status-error" title={error}
							>Search unavailable<span class="sr-only">: {error}</span></span
						>
						<button type="button" class="status-retry" onclick={() => catalog.retry()}>Retry</button
						>
					{:else if loading && snapshot.total}
						<span class="text-text-muted">Loading…</span>
					{/if}
				</div>
				<ScrollArea
					bind:viewportRef={resultsElement}
					class="search-results-pane min-h-0 min-w-0 flex-1"
					viewportClass="px-3 pb-3 sm:px-4 sm:pb-4"
					viewportLabel="Card results"
				>
					<SearchResults
						totalCount={snapshot.total}
						getCard={(index) => cardAt(snapshot, index)}
						onRangeChange={handleRange}
						resetKey={snapshot.reset}
						initialScrollTop={snapshot.reset === initialResultsReset ? initialResultsScrollTop : 0}
						onScrollPositionChange={(top) => {
							if (!preservingPosition) session.scrollTop = top;
						}}
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
				</ScrollArea>
			</div>
		</div>
		{#if selectedCard}
			<div class="absolute inset-0 flex min-h-0 flex-col overflow-hidden">
				<CardInspector card={selectedCard} onPendingChange={(value) => (session.pending = value)} />
			</div>
		{/if}
	</div>
</div>

<style>
	:global(.search-sidebar) {
		width: 288px;
		border-right: 1px solid var(--color-border);
	}
	:global(.search-sidebar-content) {
		padding: 12px 16px;
	}
	.search-status {
		display: flex;
		flex-shrink: 0;
		height: 40px;
		align-items: center;
		gap: 12px;
		padding: 0 16px;
		font-size: 12px;
		color: var(--color-text-muted);
		background: var(--color-background);
	}
	.result-count {
		flex-shrink: 0;
		font-variant-numeric: tabular-nums;
	}
	.search-status-error {
		overflow: hidden;
		color: var(--color-error);
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.status-retry {
		flex-shrink: 0;
		min-height: 32px;
		border: 0;
		background: none;
		padding: 4px 0;
		font: inherit;
		color: var(--color-text-primary);
		text-decoration: underline;
		text-underline-offset: 4px;
		cursor: pointer;
	}

	@media (max-width: 767px) {
		.search-status {
			padding-inline: 12px;
		}
		.search-toolbar {
			flex-wrap: wrap;
		}
		.search-toolbar :global(.search-query) {
			flex-basis: 100%;
		}
	}
</style>
