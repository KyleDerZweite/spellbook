<script lang="ts">
	import type { DeckCard, DeckAvailability } from '@spellbook/contracts/decks.ts';
	import type { DeckValueEstimates } from '@spellbook/contracts/inventory-value.ts';
	import type { CardDocument } from '#lib/search/types.ts';
	import ValueSummary from '#lib/components/valuation/ValueSummary.svelte';
	import ProportionChart from '#lib/components/charts/ProportionChart.svelte';
	import { storedCardDocument } from '#lib/mtg/stored-card.ts';
	let {
		cards,
		documents,
		availability,
		estimates,
		valuationError,
		onInspect
	}: {
		cards: DeckCard[];
		documents: Record<string, CardDocument>;
		availability: Record<string, DeckAvailability>;
		estimates: DeckValueEstimates | null;
		valuationError?: string;
		onInspect: (document: CardDocument, entry: DeckCard) => void;
	} = $props();
	const commanders = $derived(cards.filter((card) => card.role === 'commander'));
	const total = $derived(cards.reduce((sum, card) => sum + card.quantity, 0));
	const totals = $derived(
		cards.reduce(
			(result, card) => {
				const entry = availability[card.id];
				if (entry) {
					result.exact += entry.exact;
					result.alternate += entry.alternate;
					result.missing += entry.missing;
				} else result.unknown += card.quantity;
				return result;
			},
			{ exact: 0, alternate: 0, missing: 0, unknown: 0 }
		)
	);
	const segments = $derived([
		{ label: 'Exact printing', value: totals.exact, color: 'var(--color-success)' },
		{ label: 'Alternate printing', value: totals.alternate, color: 'var(--color-violet)' },
		{ label: 'Missing', value: totals.missing, color: 'var(--color-warning)' },
		{ label: 'Unavailable', value: totals.unknown, color: 'var(--color-text-muted)' }
	]);
	const colors = $derived(
		['W', 'U', 'B', 'R', 'G'].filter((color) =>
			commanders.some((card) => documents[card.catalogCardId]?.color_identity.includes(color))
		)
	);
</script>

<section class="deck-overview" aria-label="Deck overview">
	{#if commanders.length}<div class="commanders" aria-label="Commanders">
			{#each commanders as card (card.id)}<button
					class="commander-art"
					onclick={() => onInspect(documents[card.catalogCardId] ?? storedCardDocument(card), card)}
					aria-label={`Inspect commander ${card.name}`}
				>
					{#if card.imageUri}<img
							src={card.imageUri}
							alt={card.name}
							width="488"
							height="680"
						/>{:else}<i class="ms ms-commander" aria-hidden="true"></i><span>{card.name}</span>{/if}
				</button>{/each}
		</div>{/if}
	<div class="availability-summary">
		<div class="availability-heading">
			<h2>Inventory match</h2>
			<span class="color-identity" aria-label="Commander color identity"
				>{#each colors as color}<i
						class={`ms ms-${color.toLowerCase()} ms-cost`}
						role="img"
						aria-label={`${({ W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' } as Record<string, string>)[color]} identity`}
					></i>{/each}</span
			>
		</div>
		<p class="availability-number">
			{(totals.exact + totals.alternate).toLocaleString()}<span>
				/ {total.toLocaleString()} copies</span
			>
		</p>
		{#if total}<ProportionChart label="Deck Inventory match" kind="bar" items={segments} />{/if}
		<p class="availability-meta">
			{totals.unknown
				? `${totals.unknown.toLocaleString()} unavailable`
				: totals.missing
					? `${totals.missing.toLocaleString()} missing`
					: total
						? 'All copies available'
						: 'No cards yet'}{#if totals.alternate}
				· {totals.alternate.toLocaleString()} alternate{/if}
		</p>
	</div>
	<ValueSummary
		title="Required value"
		referenceNote="Nonfoil market references. Each Deck compares against your full Inventory."
		estimate={estimates?.required ?? null}
		evaluatedAt={estimates?.evaluatedAt}
		error={valuationError}
		inline
	/>
	<ValueSummary
		title="Missing value"
		estimate={estimates?.missing ?? null}
		error={valuationError}
		inline
	/>
</section>

<style>
	.deck-overview {
		display: flex;
		align-items: flex-start;
		flex-wrap: wrap;
		gap: 1.5rem;
		padding: 1.25rem 0 1.5rem;
		border-bottom: 1px solid var(--color-border);
		margin-bottom: 1rem;
	}
	.commanders {
		display: flex;
		gap: 0.5rem;
		flex: 0 0 auto;
	}
	.commander-art {
		display: grid;
		place-items: center;
		width: 5.5rem;
		aspect-ratio: 488 / 680;
		border-radius: 0.5rem;
		overflow: hidden;
		background: var(--color-card);
	}
	.commander-art img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	.availability-summary {
		flex: 1 1 14rem;
		max-width: 24rem;
		min-width: 0;
	}
	.availability-heading {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
	}
	h2 {
		font-size: 0.875rem;
		color: var(--color-text-muted);
		font-weight: 500;
	}
	.color-identity {
		display: inline-flex;
		gap: 0.25rem;
		font-size: 0.875rem;
	}
	.availability-number {
		margin: 0.5rem 0 0.75rem;
		font: 400 1.75rem var(--font-display);
		font-variant-numeric: tabular-nums;
	}
	.availability-number span {
		font: 400 0.75rem var(--font-body);
		color: var(--color-text-secondary);
	}
	.availability-meta {
		margin-top: 0.75rem;
		font-size: 0.6875rem;
		color: var(--color-text-secondary);
	}
	.deck-overview :global(.value-summary) {
		flex: 1 1 10rem;
		min-width: 0;
	}
	@media (max-width: 600px) {
		.deck-overview {
			gap: 1rem;
		}
		.commander-art {
			width: 4.5rem;
		}
		.availability-summary {
			flex-basis: calc(100% - 6rem);
		}
		.deck-overview :global(.value-summary) {
			flex: 1 1 calc(50% - 0.5rem);
		}
	}
</style>
