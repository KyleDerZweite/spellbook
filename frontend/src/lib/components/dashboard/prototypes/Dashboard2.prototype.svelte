<script lang="ts">
	import type { DashboardSummary } from '@spellbook/contracts/dashboard.ts';
	import PrototypeMetrics from './PrototypeMetrics.svelte';
	import PrototypeDeckCard from './PrototypeDeckCard.svelte';
	import PrototypeSets from './PrototypeSets.svelte';
	import PrototypeActions from './PrototypeActions.svelte';
	import PrototypeRecentCards from './PrototypeRecentCards.svelte';
	let { dashboard }: { dashboard: DashboardSummary } = $props();
</script>

<PrototypeMetrics {dashboard} />
<div class="workspace">
	<section class="decks" aria-labelledby="gallery-decks">
		<header>
			<h2 id="gallery-decks">Decks</h2>
			<a href="/mtg/decks">View all <span aria-hidden="true">↗</span></a>
		</header>
		<div class="deck-grid">
			{#each dashboard.decks as deck (deck.id)}
				<PrototypeDeckCard {deck} scale="featured" />
			{:else}
				<p>No decks yet. <a href="/mtg/decks">Open decks</a></p>
			{/each}
		</div>
	</section>
	<aside aria-label="Dashboard details">
		<PrototypeSets {dashboard} presentation="bars" />
		<PrototypeActions />
	</aside>
</div>
<div class="recent"><PrototypeRecentCards {dashboard} limit={8} layout="gallery" /></div>

<style>
	.workspace {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(230px, 280px);
		gap: 1.25rem;
		align-items: start;
		margin-top: 1.5rem;
	}
	.decks, aside { min-width: 0; }
	header { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; margin: 0 0 1rem; }
	h2 { margin: 0; font: 500 1.125rem var(--font-interface); color: var(--color-text-primary); }
	header a, p { font: 0.8125rem var(--font-interface); color: var(--color-text-secondary); }
	header a { text-decoration: none; white-space: nowrap; }
	header a:hover { text-decoration: underline; }
	.deck-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
	aside { display: grid; gap: 1rem; }
	.recent { margin-top: 1.5rem; }
	@media (max-width: 1100px) { .deck-grid { grid-template-columns: 1fr; } }
	@media (max-width: 760px) { .workspace { grid-template-columns: 1fr; } aside { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
	@media (max-width: 520px) { aside { grid-template-columns: 1fr; } }
</style>
