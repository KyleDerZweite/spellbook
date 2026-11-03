<script lang="ts">
	import type { PageData, ActionData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
	import NativeCardBrowsingActions from '#lib/components/cards/NativeCardBrowsingActions.svelte';
	import SearchWorkspace from '#lib/components/search/SearchWorkspace.svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { nativeSearchPageKey } from '#lib/search/native-panel.ts';
	let nativePanel: HTMLElement | null = $state(null);
	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});
	const currentContext = $derived(
		!!(data.nativeCardContext || form) &&
			data.nativePageKey === nativeSearchPageKey(page.shallow?.url ?? page.url)
	);
	// Retained native drafts, receipts and errors keep their existing action surface.
	const enhancedSelection = $derived(
		mounted &&
			currentContext &&
			data.selectedPrinting &&
			!form &&
			!data.printingReadError &&
			!data.choiceReadError &&
			!data.draftReadError &&
			!data.deckDraft &&
			!data.inventoryDraft &&
			!['deckQuery', 'deckOffset', 'selectedDeckId'].some((key) => page.url.searchParams.has(key))
			? { key: data.nativePageKey, card: data.selectedPrinting }
			: null
	);
	const nativePanelVisible = $derived(currentContext && !enhancedSelection);
	function closeRouteSelection() {
		const url = new URL((page.shallow?.url ?? page.url).href);
		url.searchParams.delete('printing');
		void goto(url.pathname + url.search, { shallow: true, replace: true, state: page.state });
	}
</script>

<svelte:head><title>Search | Spellbook</title></svelte:head>
<div class="workspace-container search-page">
	<h1 class="sr-only">Search cards</h1>
	{#if nativePanelVisible}
		<section bind:this={nativePanel} aria-label="Selected card" class="native-card-panel">
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
	<SearchWorkspace
		routeSelection={enhancedSelection}
		onCloseRouteSelection={closeRouteSelection}
		restorationTarget={nativePanelVisible ? nativePanel : null}
		serverInput={data.searchInput}
		serverResult={data.catalogResult}
		serverError={data.catalogReadError}
		canonicalHref={data.canonicalSearchHref}
	/>
</div>

<style>
	.native-card-panel {
		scroll-margin-top: calc(var(--app-header-height, 72px) + 1rem);
		max-width: 36rem;
		margin: 1.5rem auto;
	}
	.search-page {
		min-height: 32rem;
	}
</style>
