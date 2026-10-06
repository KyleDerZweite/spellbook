<script lang="ts">
	import SearchWorkspace from '#lib/components/search/SearchWorkspace.svelte';
</script>

<svelte:head><title>Search | Spellbook</title></svelte:head>
<div class="workspace-container full-search">
	<h1 class="sr-only">Search cards</h1>
	<SearchWorkspace />
</div>

<style>
	.full-search {
		display: flex;
		flex-direction: column;
		height: calc(100dvh - var(--app-header-height));
		min-height: 32rem;
	}
</style>
