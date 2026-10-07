<script lang="ts">
	import { page } from '$app/state';
	import { onDestroy } from 'svelte';
	import type { CardDocument } from '#lib/search/types.ts';
	import { workspaceSavedState } from '#lib/saved-state/workspace.svelte.ts';
	import type { DeckAdditionDraft, InventoryAdditionDraft } from '#lib/cards/addition-drafts.ts';
	import CardDeckAdd from './CardDeckAdd.svelte';
	import CardQuickAdd from './CardQuickAdd.svelte';
	let {
		card,
		onPendingChange,
		deckDraft,
		inventoryDraft
	}: {
		card: CardDocument;
		onPendingChange?: (pending: boolean) => void;
		deckDraft?: DeckAdditionDraft;
		inventoryDraft?: InventoryAdditionDraft;
	} = $props();
	let deckPending = $state(false),
		inventoryPending = $state(false);
	function changed() {
		onPendingChange?.(deckPending || inventoryPending);
	}
	onDestroy(() => onPendingChange?.(false));
</script>

{#if page.data.user && workspaceSavedState.getState() !== 'expired'}
	<CardDeckAdd
		{card}
		draft={deckDraft}
		callerPending={inventoryPending}
		onPendingChange={(pending) => {
			deckPending = pending;
			changed();
		}}
	/>
	<div class="secondary-add">
		<CardQuickAdd
			{card}
			draft={inventoryDraft}
			actionRole="secondary"
			callerPending={deckPending}
			onPendingChange={(pending) => {
				inventoryPending = pending;
				changed();
			}}
		/>
	</div>
{:else}<a
		class="btn btn-primary"
		href={`/auth/login?returnTo=${encodeURIComponent('/mtg/search?printing=' + card.id)}`}
		>Sign in to add cards</a
	>{/if}

<style>
	.secondary-add {
		margin-top: 1rem;
		max-width: 24rem;
		font-size: 0.8125rem;
	}
</style>
