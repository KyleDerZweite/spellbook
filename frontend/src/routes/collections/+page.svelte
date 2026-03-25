<script lang="ts">
	import CollectionList from '$lib/components/collections/CollectionList.svelte';
	import OrnamentalDivider from '$lib/components/layout/OrnamentalDivider.svelte';
	import { spacetimeState } from '$lib/spacetimedb/state.svelte';
</script>

<svelte:head>
	<title>Collections | Spellbook</title>
</svelte:head>

<div class="flex flex-col gap-4 p-4 sm:p-6">
	<div class="flex items-center justify-between">
		<h1 class="font-display text-xl font-bold text-gold-bright sm:text-2xl">MY COLLECTIONS</h1>
		{#if !spacetimeState.connected}
			<span class="font-body text-xs italic text-text-muted">Connecting...</span>
		{/if}
	</div>

	<OrnamentalDivider />

	<CollectionList />
</div>
