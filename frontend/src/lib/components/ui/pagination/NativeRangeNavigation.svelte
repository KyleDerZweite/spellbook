<script lang="ts">
	import {
		normalizeLazyBrowsePagination,
		browsePageCount,
		browsePaginationHref,
		clampBrowsePagination,
		type BrowsePagination
	} from '#lib/browsing/pagination.ts';
	let {
		state,
		total,
		canonicalURL,
		native = true
	}: {
		state: BrowsePagination;
		total?: number;
		canonicalURL: URL;
		native?: boolean;
	} = $props();
	const current = $derived(
		total === undefined
			? normalizeLazyBrowsePagination(state)
			: clampBrowsePagination(normalizeLazyBrowsePagination(state), total)
	);
	const ranges = $derived(total === undefined ? undefined : browsePageCount(total, 200));
	const previous = $derived(
		current.page > 1
			? browsePaginationHref(canonicalURL, current, { page: current.page - 1 })
			: null
	);
	const next = $derived(
		current.offset <= current.maxOffset - 200 && (ranges === undefined || current.page < ranges)
			? browsePaginationHref(canonicalURL, current, { page: current.page + 1 })
			: null
	);
</script>

{#if native}
	<nav class="flex flex-wrap items-center gap-4 py-4" aria-label="More results">
		{#if previous}<a class="btn btn-secondary" href={previous}>Previous 200 results</a>{/if}
		{#if next}<a class="btn btn-secondary" href={next}>Next 200 results</a>{/if}
	</nav>
{/if}
