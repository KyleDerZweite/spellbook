<script lang="ts">
	import type { DashboardSummary } from '@spellbook/contracts/dashboard.ts';
	import PrototypeMetrics from './PrototypeMetrics.svelte';
	import PrototypeRecentCards from './PrototypeRecentCards.svelte';
	import PrototypeDeckCard from './PrototypeDeckCard.svelte';
	import PrototypeSets from './PrototypeSets.svelte';
	import PrototypeActions from './PrototypeActions.svelte';

	let { dashboard }: { dashboard: DashboardSummary } = $props();
</script>

<PrototypeMetrics {dashboard} />
<div class="canvas">
	<PrototypeRecentCards {dashboard} limit={8} layout="gallery" />

	<section class="decks" aria-labelledby="decks-heading">
		<header>
			<h2 id="decks-heading">Decks</h2>
			<a href="/mtg/decks">All decks <span aria-hidden="true">↗</span></a>
		</header>
		<div class="deck-gallery">
			{#each dashboard.decks as deck (deck.id)}
				<PrototypeDeckCard {deck} scale="featured" />
			{:else}
				<p>No decks yet.</p>
			{/each}
		</div>
	</section>

	<div class="supporting">
		<PrototypeSets {dashboard} presentation="bars" />
		<PrototypeActions />
	</div>
</div>

<style>
	.canvas {
		display: grid;
		gap: 1.5rem;
		min-width: 0;
	}
	.decks {
		min-width: 0;
	}
	header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		margin: 0.25rem 0 1rem;
	}
	h2 {
		font: 500 1.125rem var(--font-interface);
		color: var(--color-text-primary);
	}
	header a {
		font: 0.75rem var(--font-interface);
		color: var(--color-text-secondary);
		text-decoration: none;
		white-space: nowrap;
	}
	header a:hover {
		text-decoration: underline;
	}
	.deck-gallery {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
		gap: 1rem;
	}
	.supporting {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(240px, 1fr);
		gap: 1rem;
	}
	p {
		font: 0.8125rem var(--font-interface);
		color: var(--color-text-muted);
	}
	@media (max-width: 700px) {
		.supporting {
			grid-template-columns: 1fr;
		}
	}
</style>
