<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import Button from '#lib/components/ui/button/Button.svelte';
	import {
		browsePageCount,
		browsePaginationHref,
		clampBrowsePagination,
		parseBrowsePagination,
		type BrowsePagination
	} from '#lib/browsing/pagination.ts';

	let {
		state: pagination,
		total,
		canonicalURL,
		onNavigate,
		lazyLoading = false
	}: {
		state: BrowsePagination;
		total?: number;
		canonicalURL: URL;
		onNavigate?: (href: string) => void;
		lazyLoading?: boolean;
	} = $props();
	const id = $props.id();
	let mounted = $state(false);
	let selected = $state(untrack(() => String(pagination.pageSize)));
	onMount(() => {
		mounted = true;
	});
	$effect(() => {
		selected = String(pagination.pageSize);
	});
	const current = $derived(
		total === undefined ? pagination : clampBrowsePagination(pagination, total)
	);
	const pageCount = $derived(
		total === undefined ? undefined : browsePageCount(total, current.limit)
	);
	const retained = $derived(
		[...canonicalURL.searchParams].filter(
			([name]) => !['page', 'pageSize', 'offset', 'limit'].includes(name)
		)
	);
	const previous = $derived(
		current.page > 1
			? browsePaginationHref(canonicalURL, current, { page: current.page - 1 })
			: undefined
	);
	const next = $derived(
		current.offset <= current.maxOffset - current.limit &&
			(pageCount === undefined || current.page < pageCount)
			? browsePaginationHref(canonicalURL, current, { page: current.page + 1 })
			: undefined
	);
	function applySize() {
		const size = parseBrowsePagination(new URLSearchParams({ pageSize: selected })).pageSize;
		onNavigate?.(browsePaginationHref(canonicalURL, current, { pageSize: size, page: 1 }));
	}
	function navigate(event: MouseEvent, href: string | undefined) {
		if (
			!href ||
			!onNavigate ||
			event.button !== 0 ||
			event.metaKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.altKey
		)
			return;
		event.preventDefault();
		onNavigate(href);
	}
</script>

<nav class="pagination" aria-label="Pagination">
	<form
		method="GET"
		action={canonicalURL.pathname + canonicalURL.hash}
		onsubmit={(event) => {
			if (onNavigate) {
				event.preventDefault();
				applySize();
			}
		}}
	>
		{#each retained as [name, value]}<input type="hidden" {name} {value} />{/each}
		<input type="hidden" name="page" value="1" />
		<label for={id}>Entries per page</label>
		<select
			{id}
			name="pageSize"
			class="input"
			bind:value={selected}
			onchange={(event) => {
				selected = event.currentTarget.value;
				if (onNavigate) applySize();
			}}
		>
			<option value="100">100</option><option value="200">200</option><option value="500"
				>500</option
			><option value="lazy">Lazy</option>
		</select>
		<Button type="submit" variant="outline">Apply</Button>
	</form>
	<p class="count" aria-live="polite">
		Page {current.page}{#if pageCount !== undefined}{' '}of {pageCount} ({total} entries){/if}
	</p>
	<div class="links">
		<Button
			href={previous}
			disabled={!previous}
			variant="outline"
			onclick={(event) => navigate(event, previous)}>Previous</Button
		>
		{#if !(mounted && lazyLoading && current.pageSize === 'lazy')}
			<Button
				href={next}
				disabled={!next}
				variant="outline"
				onclick={(event) => navigate(event, next)}>Next</Button
			>
		{/if}
	</div>
</nav>

<style>
	.pagination {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}
	form,
	.links {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}
	label,
	.count {
		font-size: 0.8125rem;
		color: var(--color-text-secondary);
	}
	.count {
		margin: 0;
	}
	select {
		width: auto;
		min-width: 5rem;
		min-height: 44px;
		padding: 0.375rem 0.7rem;
	}
</style>
