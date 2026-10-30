<script lang="ts">
	import type { DashboardSummary } from '@spellbook/contracts/dashboard.ts';
	import PrototypeMetrics from './PrototypeMetrics.svelte';
	import PrototypeDeckCard from './PrototypeDeckCard.svelte';
	import PrototypeSets from './PrototypeSets.svelte';
	import PrototypeRecentCards from './PrototypeRecentCards.svelte';
	import PrototypeActions from './PrototypeActions.svelte';
	import PrototypeComposition from './PrototypeComposition.svelte';
	let { dashboard }: { dashboard: DashboardSummary } = $props();
</script>

<div class="dashboard">
	<PrototypeMetrics {dashboard} />
	<div class="main-band">
		<section class="decks" aria-labelledby="overview-decks">
			<header>
				<h2 id="overview-decks">Decks</h2>
				<a href="/mtg/decks">View all ↗</a>
			</header>
			<div class="deck-grid">
				{#each dashboard.decks.filter((d) => d.required > 0 && d.commanders.length > 0) as deck (deck.id)}<PrototypeDeckCard
						{deck}
						scale="featured"
						appearance="plain"
					/>{:else}<a href="/mtg/decks">Create a deck</a>{/each}
			</div>
			{#each dashboard.decks.filter((d) => d.required === 0 || d.commanders.length === 0) as deck}<a
					class="empty-deck"
					href={`/mtg/decks?deck=${encodeURIComponent(deck.id)}`}
					>{deck.name}<span
						>{deck.required
							? `${deck.exact + deck.alternate} / ${deck.required} available`
							: 'Start building'} ↗</span
					></a
				>{/each}
		</section>
		<PrototypeSets {dashboard} />
	</div>
	<div class="lower">
		<PrototypeRecentCards {dashboard} layout="rows" limit={4} /><PrototypeComposition
			{dashboard}
		/><PrototypeActions />
	</div>
</div>

<style>
	.dashboard {
		display: grid;
		gap: 24px;
		min-width: 0;
	}
	.main-band {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(240px, 1fr);
		gap: 16px;
		align-items: start;
	}
	.decks {
		min-width: 0;
		padding: 20px;
		border: 1px solid color-mix(in srgb, var(--color-border) 45%, transparent);
		border-radius: 12px;
		background: var(--color-card);
	}
	header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 16px;
	}
	h2 {
		font: 500 16px var(--font-interface);
	}
	a {
		color: var(--color-text-secondary);
		font: 400 12px var(--font-interface);
		text-decoration: none;
	}
	a:hover {
		text-decoration: underline;
	}
	.deck-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 24px;
	}
	.empty-deck {
		display: flex;
		justify-content: space-between;
		gap: 16px;
		border-top: 1px solid var(--color-border);
		padding-top: 16px;
		margin-top: 16px;
	}
	.empty-deck span {
		color: var(--color-text-muted);
	}
	.lower {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 16px;
		align-items: start;
	}
	@media (max-width: 1100px) {
		.main-band {
			grid-template-columns: 1fr;
		}
	}
	@media (max-width: 760px) {
		.lower {
			grid-template-columns: 1fr;
		}
	}
	@media (max-width: 620px) {
		.deck-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
