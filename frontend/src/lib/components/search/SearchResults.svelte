<script lang="ts">
	import { untrack } from 'svelte';
	import type { CatalogRange } from '#lib/search/catalogWindow.ts';
	import type { CardDocument } from '#lib/search/types.ts';
	import type { LoadedSpan } from '#lib/browsing/loadedSpan.ts';
	import type { BrowseViewport } from '#lib/browsing/viewport.ts';
	import VirtualCardGrid from '#lib/components/cards/VirtualCardGrid.svelte';

	interface Props {
		totalCount: number;
		span?: LoadedSpan;
		onLoadEarlier?: () => void;
		cards?: CardDocument[];
		viewport?: BrowseViewport | null;
		anchorIndex?: number;
		native?: boolean;
		canonicalHref?: string;
		getCard: (index: number) => CardDocument | undefined;
		onRangeChange: (range: CatalogRange) => void;
		initialScrollTop?: number;
		restorationTarget?: HTMLElement | null;
		onScrollPositionChange?: (top: number) => void;
		resetKey: number;
		onFocusReset: () => void;
		loading: boolean;
		error?: string | null;
		query: string;
		browseMode: boolean;
		selectedId?: string | null;
		onSelect?: (card: CardDocument) => void;
		onRetry?: () => void;
		onClearFilters?: () => void;
		hasFilters?: boolean;
		class?: string;
	}

	let {
		totalCount,
		span = { start: 0, end: totalCount },
		onLoadEarlier,
		cards = [],
		viewport = null,
		anchorIndex = 0,
		native = false,
		canonicalHref = '/mtg/search',
		getCard,
		onRangeChange,
		initialScrollTop = 0,
		restorationTarget = null,
		onScrollPositionChange,
		resetKey,
		onFocusReset,
		loading,
		error = null,
		query,
		browseMode,
		selectedId = null,
		onSelect,
		onRetry,
		onClearFilters,
		hasFilters = false,
		class: className = ''
	}: Props = $props();

	const SKELETON_COUNT = 20;
	let resultsEl: HTMLDivElement | null = $state(null);
	const showsGrid = $derived((!error || totalCount > 0) && (totalCount > 0 || loading));

	$effect.pre(() => {
		if (!showsGrid && resultsEl?.contains(document.activeElement)) untrack(onFocusReset);
	});
</script>

<div bind:this={resultsEl} class="flex-1 {className}" aria-busy={loading}>
	{#if error && totalCount === 0}
		<!-- Error state -->
		<div class="flex items-center justify-center py-20">
			<div class="text-center">
				<p class="font-body text-sm text-error">Search failed</p>
				<p class="mt-2 max-w-md font-body text-sm text-text-muted">{error}</p>
			</div>
		</div>
	{:else if totalCount === 0 && !loading && (browseMode || query.length >= 2)}
		<!-- Empty search state -->
		<div class="flex items-center justify-center py-20">
			<div class="text-center">
				<p class="font-body text-sm text-text-secondary">
					{hasFilters || query.length >= 2 ? 'No cards found' : 'No cards available'}
				</p>
				<p class="mt-2 font-body text-sm italic text-text-muted">
					{#if query.length >= 2}No cards match "{query}". Try another name.
					{:else if hasFilters}No cards match these filters.
					{:else}No cards are available in this catalog.{/if}
				</p>
				{#if hasFilters && onClearFilters}<button
						class="btn btn-secondary mt-4"
						onclick={onClearFilters}>Clear filters</button
					>{:else if onRetry}<button class="btn btn-secondary mt-4" onclick={onRetry}
						>Retry search</button
					>{/if}
			</div>
		</div>
	{:else if totalCount > 0 || loading}
		{#if native}
			<div class="native-card-grid grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
				{#each cards as card (card.id)}
					<a
						class="min-w-0"
						href={canonicalHref +
							(canonicalHref.includes('?') ? '&' : '?') +
							'printing=' +
							encodeURIComponent(card.id)}
					>
						<img
							src={card.image_uri || card.image_uri_small}
							alt={card.name}
							loading="lazy"
							class="w-full rounded-lg"
						/>
						<span class="block truncate text-sm">{card.name}</span>
						<span class="text-xs uppercase text-text-muted"
							>{card.set_code} {card.collector_number}</span
						>
					</a>
				{/each}
			</div>
		{:else}
			{#if span.start > 0}<button class="btn btn-secondary mb-4" onclick={onLoadEarlier}
					>Load earlier cards</button
				>{/if}
			<VirtualCardGrid
				span={span.end > span.start
					? span
					: { start: anchorIndex, end: anchorIndex + SKELETON_COUNT }}
				{viewport}
				{anchorIndex}
				totalCount={totalCount || SKELETON_COUNT}
				{getCard}
				{onRangeChange}
				{resetKey}
				{initialScrollTop}
				{restorationTarget}
				{onScrollPositionChange}
				{onFocusReset}
				{selectedId}
				{onSelect}
			/>
		{/if}
	{/if}
</div>
