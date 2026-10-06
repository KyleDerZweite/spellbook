<script lang="ts">
	import { untrack } from 'svelte';
	import type { CatalogRange } from '#lib/search/catalogWindow.ts';
	import type { CardDocument } from '#lib/search/types.ts';
	import VirtualCardGrid from '#lib/components/cards/VirtualCardGrid.svelte';

	interface Props {
		totalCount: number;
		getCard: (index: number) => CardDocument | undefined;
		onRangeChange: (range: CatalogRange) => void;
		initialScrollTop?: number;
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
		getCard,
		onRangeChange,
		initialScrollTop = 0,
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
				{#if onRetry}<button class="btn btn-secondary mt-4" onclick={onRetry}>Retry search</button
					>{/if}
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
		{#if error}
			<div
				class="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-3 bg-background py-2"
				role="alert"
			>
				<p class="text-sm text-error">{error}</p>
				{#if onRetry}<button class="btn btn-secondary" onclick={onRetry}>Retry search</button>{/if}
			</div>
		{/if}
		<VirtualCardGrid
			totalCount={totalCount || SKELETON_COUNT}
			{getCard}
			{onRangeChange}
			{resetKey}
			{initialScrollTop}
			{onScrollPositionChange}
			{onFocusReset}
			{selectedId}
			{onSelect}
		/>
	{/if}
</div>
