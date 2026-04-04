<script lang="ts">
	import type { CardDocument } from '$lib/search/types';
	import VirtualCardGrid from '$lib/components/cards/VirtualCardGrid.svelte';

	interface Props {
		hits: CardDocument[];
		loading: boolean;
		error?: string | null;
		query: string;
		browseMode: boolean;
		selectedId?: string | null;
		onSelect?: (card: CardDocument) => void;
		class?: string;
	}

	let {
		hits,
		loading,
		error = null,
		query,
		browseMode,
		selectedId = null,
		onSelect,
		class: className = ''
	}: Props = $props();

	const SKELETON_COUNT = 20;
</script>

<div class="flex-1 {className}">
	{#if error}
		<!-- Error state -->
		<div class="flex items-center justify-center py-20">
			<div class="text-center">
				<p class="font-display text-lg text-error">Search Failed</p>
				<p class="mt-2 max-w-md font-body text-sm text-text-muted">{error}</p>
				<p class="mt-1 font-body text-xs italic text-text-muted">
					Try again or adjust your search.
				</p>
			</div>
		</div>
	{:else if loading && hits.length === 0}
		<!-- Skeleton loading state -->
		<div class="grid gap-4" style="grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));">
			{#each Array(SKELETON_COUNT) as _, i}
				<div
					class="overflow-hidden rounded"
					style="background-color: var(--color-stone); border: 1px solid rgba(196, 146, 42, 0.12);"
				>
					<div
						style="aspect-ratio: 5 / 7; background-color: var(--color-slate); animation: skeleton-pulse 1.5s ease-in-out infinite; animation-delay: {i *
							50}ms;"
					></div>
					<div class="px-2 py-2">
						<div
							class="mb-1 h-3 rounded"
							style="width: {60 +
								(i % 3) *
									15}%; background-color: var(--color-slate); animation: skeleton-pulse 1.5s ease-in-out infinite; animation-delay: {i *
								50 +
								100}ms;"
						></div>
						<div
							class="h-2.5 rounded"
							style="width: 40%; background-color: var(--color-slate); animation: skeleton-pulse 1.5s ease-in-out infinite; animation-delay: {i *
								50 +
								200}ms;"
						></div>
					</div>
				</div>
			{/each}
		</div>
	{:else if !browseMode && query.length >= 2 && hits.length === 0 && !loading}
		<!-- Empty search state -->
		<div class="flex items-center justify-center py-20">
			<div class="text-center">
				<p class="font-display text-lg text-text-secondary">No Cards Found</p>
				<p class="mt-2 font-body text-sm italic text-text-muted">
					The archives hold no record of "{query}"
				</p>
			</div>
		</div>
	{:else if hits.length > 0}
		<VirtualCardGrid cards={hits} {selectedId} {onSelect} />
	{/if}
</div>
