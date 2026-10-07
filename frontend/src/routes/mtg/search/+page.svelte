<script lang="ts">
	import type { PageData, ActionData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
	import NativeCardBrowsingActions from '#lib/components/cards/NativeCardBrowsingActions.svelte';
	import SearchWorkspace from '#lib/components/search/SearchWorkspace.svelte';
</script>

<svelte:head><title>Search | Spellbook</title></svelte:head>
<div class="workspace-container search-page">
	<h1 class="sr-only">Search cards</h1>
	<SearchWorkspace
		serverInput={data.searchInput}
		serverResult={data.catalogResult}
		serverError={data.catalogReadError}
		canonicalHref={data.canonicalSearchHref}
	/>
	{#if data.nativeCardContext || form}
		<section aria-label="Selected card" class="native-card-panel">
			{#if data.selectedPrinting}
				<h2>{data.selectedPrinting.name}</h2>
				<p class="text-sm text-text-secondary">
					{data.selectedPrinting.set_name} · {data.selectedPrinting.collector_number}
				</p>
				<p>{data.selectedPrinting.type_line}</p>
				<p class="whitespace-pre-line text-sm">{data.selectedPrinting.oracle_text}</p>
			{/if}
			{#if !data.user && data.printingReadError}<p role="alert" class="text-error">
					{data.printingReadError}
				</p>{/if}
			{#if !data.user && data.choiceReadError}<p role="alert" class="text-error">
					{data.choiceReadError}
				</p>{/if}
			{#if data.draftReadError}<p role="alert" class="text-error">{data.draftReadError}</p>{/if}
			<NativeCardBrowsingActions
				selectedPrinting={data.selectedPrinting}
				printingReadError={data.printingReadError}
				deckDraft={data.deckDraft}
				inventoryDraft={data.inventoryDraft}
				requestId={data.requestId}
				signedIn={!!data.user}
				canonicalSearchHref={data.canonicalSearchHref}
				choices={data.choices}
				choiceReadError={data.choiceReadError}
				choiceQuery={data.choiceQuery}
				choiceOffset={data.choiceOffset}
				result={form}
			/>
		</section>
	{/if}
</div>

<style>
	.native-card-panel {
		max-width: 36rem;
		margin: 1.5rem auto;
	}
	.search-page {
		min-height: 32rem;
	}
</style>
