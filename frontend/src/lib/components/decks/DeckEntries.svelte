<script lang="ts">
	import type { DeckCard, DeckAvailability } from '@spellbook/contracts/decks.ts';
	import type { CardDocument } from '#lib/search/types.ts';
	import type { SubmitFunction } from '$app/forms';
	import QuantityControl from '#lib/components/ui/QuantityControl.svelte';
	import ManaCost from '#lib/components/cards/ManaCost.svelte';
	import { storedCardDocument } from '#lib/mtg/stored-card.ts';
	let {
		groups,
		view,
		documents,
		availability,
		busy,
		updateAction,
		requestId,
		submit,
		onInspect
	}: {
		groups: [string, DeckCard[]][];
		view: 'list' | 'stacks';
		documents: Record<string, CardDocument>;
		availability: Record<string, DeckAvailability>;
		busy: boolean;
		updateAction: string;
		requestId: string;
		submit: SubmitFunction;
		onInspect: (card: CardDocument, entry: DeckCard) => void;
	} = $props();
</script>

<div class:stacks={view === 'stacks'}>
	{#each groups as [group, cards]}
		{#if cards.length}
			<div class="card-group">
				<div
					class="role-heading"
					class:commander-role={cards.every((card) => card.role === 'commander')}
				>
					<span>{group}</span><span>{cards.reduce((sum, card) => sum + card.quantity, 0)}</span>
				</div>
				{#each cards as card (card.id)}
					{@const owned = availability[card.id]}
					<div
						class="deck-row"
						class:stack-card={view === 'stacks'}
						class:commander-entry={card.role === 'commander'}
					>
						{#if view === 'stacks'}
							<button
								class="stack-art"
								onclick={() =>
									onInspect(documents[card.catalogCardId] ?? storedCardDocument(card), card)}
								aria-label={`Inspect ${card.name}`}
							>
								{#if card.imageUri}<img
										src={card.imageUri}
										alt={card.name}
										loading="lazy"
									/>{:else}<span>{card.name}</span>{/if}
							</button>
						{/if}
						<QuantityControl
							quantity={card.quantity}
							label={card.name}
							action={updateAction}
							{submit}
							disabled={busy}
							maxQuantity={10000}
						>
							{#snippet fields(delta)}<input
									type="hidden"
									name="requestId"
									value={requestId}
								/><input type="hidden" name="delta" value={delta} /><input
									type="hidden"
									name="entryId"
									value={card.id}
								/><input type="hidden" name="quantity" value={card.quantity + delta} /><input
									type="hidden"
									name="role"
									value={card.role}
								/>{/snippet}
						</QuantityControl>
						<button
							class="card-name"
							onclick={() =>
								onInspect(documents[card.catalogCardId] ?? storedCardDocument(card), card)}
							>{card.name}{#if documents[card.catalogCardId]?.mana_cost}<span class="row-mana"
									><ManaCost cost={documents[card.catalogCardId].mana_cost} /></span
								>{/if}</button
						>
						<button
							class="ownership"
							class:warning={owned?.missing > 0}
							onclick={() =>
								onInspect(documents[card.catalogCardId] ?? storedCardDocument(card), card)}
							aria-label={`Inspect ownership of ${card.name}`}
						>
							{owned?.missing
								? `${owned.missing} missing`
								: owned?.alternate
									? 'Alternate'
									: 'Owned'}
						</button>
					</div>
				{/each}
			</div>
		{/if}
	{/each}
</div>

<style>
	.role-heading {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.625rem 0 0.375rem;
		color: var(--role-accent, var(--color-text-secondary));
		font-size: 0.75rem;
	}
	.deck-row {
		display: grid;
		grid-template-columns: max-content minmax(0, 1fr) auto;
		gap: 0.7rem;
		align-items: center;
		min-height: 44px;
	}
	.deck-row:hover {
		background: var(--color-stone);
	}
	.commander-entry {
		border-left: 2px solid var(--color-role-commander);
	}
	.row-mana {
		display: inline-flex;
		margin-left: 0.5rem;
		vertical-align: middle;
	}
	.card-name {
		text-align: left;
		font-size: 0.85rem;
		overflow-wrap: anywhere;
		font-weight: 500;
	}
	.card-name:hover {
		text-decoration: underline;
	}
	.deck-row button:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.ownership {
		font-size: 0.7rem;
		color: var(--color-text-secondary);
		padding: 0.4rem;
	}
	.warning {
		color: var(--color-warning);
	}
	.stacks {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 1.5rem;
	}
	.stack-card {
		position: relative;
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		padding: 0;
		background: var(--color-crypt);
		border-radius: 0.6rem;
		overflow: hidden;
		box-shadow: 0 -2px 8px #0003;
	}
	.stack-card + .stack-card {
		margin-top: -300px;
	}
	.stack-card:focus-within,
	.stack-card:hover {
		z-index: 1;
	}
	.stack-art {
		height: 280px;
		flex: 0 0 100%;
		width: 100%;
		display: block;
	}
	.stack-art img {
		width: 100%;
		height: 280px;
		object-fit: contain;
	}
	.stack-card .card-name {
		flex: 1;
		padding: 0.4rem;
	}
	.stack-card .ownership {
		width: 100%;
		text-align: right;
	}

	@media (max-width: 420px) {
		.deck-row {
			grid-template-columns: max-content minmax(0, 1fr);
			gap: 0.4rem;
		}
		.ownership {
			grid-column: 2;
			text-align: left;
			padding: 0 0 0.5rem;
		}
		.stacks {
			grid-template-columns: 1fr;
		}
		.stack-art {
			height: 340px;
		}
		.stack-art img {
			height: 340px;
		}
		.stack-card + .stack-card {
			margin-top: -350px;
		}
	}
</style>
