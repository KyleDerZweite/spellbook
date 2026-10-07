<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	import SearchWorkspace from '#lib/components/search/SearchWorkspace.svelte';
</script>

<svelte:head><title>Search | Spellbook</title></svelte:head>
<div class="workspace-container full-search">
	<h1 class="sr-only">Search cards</h1>
	<SearchWorkspace
		serverInput={data.searchInput}
		serverResult={data.catalogResult}
		serverError={data.catalogReadError}
		canonicalHref={data.canonicalSearchHref}
	/>
	{#if data.printingReadError}<section aria-label="Printing selection">
			<p class="text-error">{data.printingReadError}</p>
			<a href={data.canonicalSearchHref}>Return to results</a>
		</section>{/if}
	<!-- The shared Card owner supplies the native selectedPrinting panel at this route seam. -->
</div>

<style>
	.full-search {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 32rem;
	}
</style>
