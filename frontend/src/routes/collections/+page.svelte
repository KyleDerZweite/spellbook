<script lang="ts">
	import CollectionList from '$lib/components/collections/CollectionList.svelte';
	import OrnamentalDivider from '$lib/components/layout/OrnamentalDivider.svelte';
	import { spacetimeState } from '$lib/spacetimedb/state.svelte';
</script>

<div class="flex flex-col gap-4 p-6">
	<div class="flex items-center justify-between">
		<h1 class="font-display text-2xl font-bold text-gold-bright">MY COLLECTIONS</h1>
		{#if !spacetimeState.connected}
			<span class="font-body text-xs italic text-text-muted">Connecting...</span>
		{/if}
	</div>

	<OrnamentalDivider />

	<CollectionList />
</div>
