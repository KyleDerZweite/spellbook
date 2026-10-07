<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import CardDetail from '#lib/components/cards/CardDetail.svelte';
	import CardBrowsingActions from '#lib/components/cards/CardBrowsingActions.svelte';
	import NativeCardBrowsingActions from '#lib/components/cards/NativeCardBrowsingActions.svelte';
	import {
		createDeckAdditionDraft,
		createInventoryAdditionDraft
	} from '#lib/cards/addition-drafts.ts';
	let { data, form } = $props();
	let open = $state(false),
		pending = $state(false);
	let deckDraft = $state(createDeckAdditionDraft()),
		inventoryDraft = $state(createInventoryAdditionDraft());
	let returnFocus: HTMLButtonElement | null = $state(null);
	function fixtureActions(node: HTMLElement) {
		const observer = new MutationObserver(() => {
			for (const element of document.querySelectorAll<HTMLFormElement>('form[method="POST"]')) {
				const key = new URL(element.action).search.slice(1);
				element.action = '/_shared-card-actions-proof?' + key;
			}
		});
		observer.observe(document.body, { childList: true, subtree: true });
		return {
			destroy() {
				observer.disconnect();
			}
		};
	}
	onMount(() => {
		document.documentElement.dataset.sharedCardFixture = 'true';
	});
</script>

<div use:fixtureActions>
	{#if data.native}<NativeCardBrowsingActions
			selectedPrinting={data.selectedPrinting}
			printingReadError={data.printingReadError}
			deckDraft={data.deckDraft}
			inventoryDraft={data.inventoryDraft}
			requestId={data.requestId}
			signedIn={!!page.data.user}
			canonicalSearchHref={data.canonicalSearchHref}
			choices={data.choices}
			choiceReadError={data.choiceReadError}
			choiceQuery={data.choiceQuery}
			choiceOffset={data.choiceOffset}
			result={form}
			action="/_shared-card-actions-proof?/addToDeck"
		/>
	{:else if data.selectedPrinting}<button
			bind:this={returnFocus}
			class="btn btn-primary"
			onclick={() => (open = true)}>Inspect fixture Printing</button
		>
		{#if open}<CardDetail
				card={data.selectedPrinting}
				onClose={() => (open = false)}
				{returnFocus}
				callerPending={pending}
			>
				{#snippet actions(card)}<CardBrowsingActions
						{card}
						{deckDraft}
						{inventoryDraft}
						onPendingChange={(value) => (pending = value)}
					/>{/snippet}
			</CardDetail>{/if}
	{/if}
</div>
