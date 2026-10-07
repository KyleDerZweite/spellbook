<script lang="ts">
	import type { Deck, DeckSnapshot } from '@spellbook/contracts/decks.ts';
	let {
		decks,
		covers,
		totals
	}: { decks: Deck[]; covers: DeckSnapshot['deckCovers']; totals: DeckSnapshot['deckTotals'] } =
		$props();
</script>

{#if decks.length}
	<div class="deck-library">
		{#each decks as deck}
			{@const cover = covers[deck.id]}
			<a class="library-card" href={`/mtg/decks?deck=${deck.id}`}>
				{#if cover?.imageUri}<img src={cover.imageUri} alt="" />{:else}<div
						class="library-placeholder"
						aria-hidden="true"
					>
						<svg
							aria-hidden="true"
							width="40"
							height="40"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.4"
							><rect x="7" y="3" width="13" height="18" rx="2" /><path
								d="m4 6-2 1 3 15 11-2"
							/></svg
						>
					</div>{/if}
				<strong>{deck.name}</strong><span>{deck.format} · {totals[deck.id] || 0} cards</span>
				<small>Edited {new Date(deck.updatedAt).toLocaleDateString('en-GB')}</small>
			</a>
		{/each}
	</div>
{:else}<section class="panel empty-state welcome">
		<p>No decks yet.</p>
	</section>{/if}

<style>
	.deck-library {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(0, 180px));
		gap: 1.5rem;
	}
	.library-card {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		color: var(--color-text-primary);
		text-decoration: none;
	}
	.library-card img,
	.library-placeholder {
		width: 100%;
		aspect-ratio: 488 / 680;
		object-fit: contain;
		border-radius: 0.6rem;
		background: var(--color-stone);
	}
	.library-placeholder {
		display: grid;
		place-items: center;
		font-size: 3rem;
		color: var(--color-text-muted);
	}
	.library-card span,
	.library-card small {
		color: var(--color-text-secondary);
		font-size: 0.8rem;
	}
	.library-card:hover strong {
		text-decoration: underline;
	}

	.empty-state {
		padding: 3rem 1rem;
		text-align: center;
		color: var(--color-text-secondary);
	}
	@media (max-width: 420px) {
		.deck-library {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
