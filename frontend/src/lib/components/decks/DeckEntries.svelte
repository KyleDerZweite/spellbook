<script lang="ts">
	import type { DeckCard, DeckAvailability } from '@spellbook/contracts/decks.ts';
	import type { CardDocument } from '#lib/search/types.ts';
	import type { SubmitFunction } from '$app/forms';
	import QuantityControl from '#lib/components/ui/QuantityControl.svelte';
	import ManaCost from '#lib/components/cards/ManaCost.svelte';
	import { cardTypeSymbol } from '#lib/mtg/type-symbol.ts';
	import { storedCardDocument } from '#lib/mtg/stored-card.ts';
	let {
		showGroupHeadings = true,
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
		showGroupHeadings?: boolean;
		groups: [string, DeckCard[], string?][];
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

<div class="entries" class:stacks={view === 'stacks'}>
	{#each groups as [group, cards, identity] (identity ?? group)}
		{#if cards.length}
			{@const symbol = cards.every((card) => card.role === 'commander')
				? 'commander'
				: cards.every((card) => documents[card.catalogCardId]?.card_types.includes(group))
					? cardTypeSymbol(group)
					: undefined}
			<section class="card-group" aria-label={`${group} cards`}>
				{#if showGroupHeadings}<h2
						class="role-heading"
						class:commander-role={cards.every((card) => card.role === 'commander')}
					>
						<span
							>{#if symbol}<i class={`ms ms-${symbol}`} aria-hidden="true"></i>{/if}{group}</span
						>
						<span class="group-count">{cards.reduce((sum, card) => sum + card.quantity, 0)}</span>
					</h2>{/if}
				<div class="group-cards" style:--stack-rows={cards.length - 1}>
					{#each cards as card (card.id)}
						{@const owned = availability[card.id]}
						{@const document = documents[card.catalogCardId] ?? storedCardDocument(card)}
						{@const ownership = !owned
							? 'Availability unavailable'
							: owned.missing
								? `${owned.missing} missing`
								: owned.alternate
									? `${owned.alternate} alternate`
									: 'Owned'}
						<div class="deck-row" class:commander-entry={card.role === 'commander'}>
							<button
								class="entry-art"
								onclick={() => onInspect(document, card)}
								aria-label={`Inspect ${card.name}`}
							>
								{#if card.imageUri}<img
										src={card.imageUri}
										alt={card.name}
										loading="lazy"
										width="488"
										height="680"
									/>
								{:else}<span class="art-fallback"
										><i class="ms ms-card" aria-hidden="true"></i>{card.name}<ManaCost
											cost={document.mana_cost}
										/></span
									>{/if}
							</button>
							{#if view === 'stacks'}<span
									class="stack-quantity"
									class:warning={!!owned?.missing}
									class:alternate={!!owned?.alternate && !owned?.missing}
									title={`${card.quantity} required · ${ownership}`}
									aria-label={`${card.quantity} copies`}>{card.quantity}</span
								>{/if}
							<div class="entry-controls">
								<QuantityControl
									quantity={card.quantity}
									label={card.name}
									action={updateAction}
									{submit}
									disabled={busy}
									maxQuantity={10000}
								>
									{#snippet fields(delta)}
										<input type="hidden" name="requestId" value={requestId} />
										<input type="hidden" name="delta" value={delta} />
										<input type="hidden" name="entryId" value={card.id} />
										<input type="hidden" name="quantity" value={card.quantity + delta} />
										<input type="hidden" name="role" value={card.role} />
									{/snippet}
								</QuantityControl>
								<button class="card-name" onclick={() => onInspect(document, card)}>
									<span>{card.name}</span>
									{#if document.mana_cost}<span class="row-mana"
											><ManaCost cost={document.mana_cost} /></span
										>{/if}
								</button>
								<button
									class="ownership"
									class:warning={!!owned?.missing}
									class:alternate={!!owned?.alternate && !owned?.missing}
									onclick={() => onInspect(document, card)}
									aria-label={`Inspect ownership of ${card.name}: ${ownership}`}
									title={ownership}
								>
									<span class="ownership-mark" aria-hidden="true"
										>{!owned ? '?' : owned.missing ? '−' : owned.alternate ? '↔' : '✓'}</span
									><span class="ownership-label">{ownership}</span>
								</button>
							</div>
						</div>
					{/each}
				</div>
			</section>
		{/if}
	{/each}
</div>

<style>
	.entries {
		columns: 2 24rem;
		column-gap: 2rem;
	}
	.card-group {
		min-width: 0;
		break-inside: avoid;
		margin-bottom: 1.5rem;
	}
	.role-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.5rem 0;
		margin-bottom: 0.5rem;
		border-bottom: 1px solid var(--color-border);
		font: 400 1.125rem var(--font-display);
	}
	.role-heading > span:first-child {
		display: inline-flex;
		gap: 0.5rem;
		align-items: center;
	}
	.role-heading .ms {
		font-size: 0.875rem;
		color: var(--color-text-secondary);
	}
	.group-count {
		font: 400 0.75rem var(--font-body);
		color: var(--color-text-secondary);
		font-variant-numeric: tabular-nums;
	}
	.deck-row {
		display: grid;
		grid-template-columns: 32px minmax(0, 1fr);
		gap: 0.5rem;
		align-items: center;
		border-radius: 0.5rem;
	}
	.deck-row:hover,
	.deck-row:focus-within {
		background: var(--color-surface);
	}
	.entry-art {
		display: block;
		width: 100%;
		aspect-ratio: 488 / 680;
		border-radius: 0.375rem;
		overflow: hidden;
	}
	.entry-art img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	.entry-controls {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: 0.5rem;
		align-items: center;
		min-width: 0;
	}
	.card-name {
		text-align: left;
		font-size: 0.75rem;
		overflow-wrap: anywhere;
		font-weight: 400;
	}
	.card-name:hover {
		text-decoration: underline;
	}
	.row-mana {
		display: inline-flex;
		margin-left: 0.5rem;
		vertical-align: middle;
		font-size: 0.75rem;
	}
	.pending {
		color: var(--color-text-secondary);
	}
	.ownership {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		color: var(--color-text-secondary);
		font-size: 0.6875rem;
		min-height: 2rem;
		padding: 0.25rem;
	}
	.ownership-mark {
		font-size: 0.875rem;
	}
	.ownership-label {
		display: none;
	}
	.warning {
		color: var(--color-warning);
	}
	.alternate {
		color: var(--color-violet);
	}
	.art-fallback {
		display: flex;
		width: 100%;
		height: 100%;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		gap: 1rem;
		padding: 1rem;
		background: var(--color-card);
		font: 400 1.25rem var(--font-display);
		overflow-wrap: anywhere;
	}
	.stacks {
		columns: 12rem;
		column-gap: 1.5rem;
	}
	.stacks .card-group {
		display: inline-block;
		width: 100%;
		margin: 0 0 1.5rem;
	}
	.stacks .group-cards {
		display: grid;
		grid-template-rows: repeat(var(--stack-rows), 2.5rem) auto;
	}
	.stacks .deck-row {
		position: relative;
		display: block;
		padding-left: 1.5rem;
		align-self: start;
	}
	.stacks .deck-row:hover,
	.stacks .deck-row:focus-within {
		z-index: 2;
	}
	.stacks .entry-art {
		border-radius: 0.75rem;
	}
	.stack-quantity {
		position: absolute;
		top: 0.25rem;
		left: 0;
		min-width: 1.25rem;
		height: 1.5rem;
		display: grid;
		place-items: center;
		border: 1px solid var(--color-border);
		border-radius: 0.25rem;
		background: var(--color-background);
		color: var(--color-text-primary);
		font-size: 0.6875rem;
		font-variant-numeric: tabular-nums;
	}
	.stack-quantity.warning {
		color: var(--color-warning);
		border-color: var(--color-warning);
	}
	.stack-quantity.alternate {
		color: var(--color-violet);
		border-color: var(--color-violet);
	}
	.stacks .entry-controls {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		display: flex;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0;
		padding: 0.25rem;
		border-radius: 0 0 0.75rem 0.75rem;
		background: var(--color-background);
		border: 1px solid var(--color-border);
		opacity: 0;
		pointer-events: none;
	}
	.stacks .deck-row:hover .entry-controls,
	.stacks .deck-row:focus-within .entry-controls {
		opacity: 1;
		pointer-events: auto;
	}
	.stacks .card-name {
		order: -1;
		flex: 0 0 100%;
		padding: 0.5rem;
	}
	.stacks .ownership-label {
		display: inline;
	}
	@media (hover: none) {
		.stacks .deck-row:last-child .entry-controls {
			opacity: 1;
			pointer-events: auto;
		}
	}
	@media (max-width: 600px) {
		.entries {
			columns: 1;
		}
		.stacks {
			columns: 2;
			column-gap: 1rem;
		}
		.stacks .group-cards {
			grid-template-rows: repeat(var(--stack-rows), 2.75rem) auto;
		}
		.stacks .ownership {
			width: 100%;
			justify-content: flex-end;
		}
		.stacks .entry-controls {
			padding: 0;
		}
		.entry-controls {
			gap: 0.25rem;
		}
		.ownership {
			min-height: 2.75rem;
		}
	}
	@media (max-width: 360px) {
		.stacks {
			columns: 1;
		}
	}
</style>
