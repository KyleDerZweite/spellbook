<script lang="ts">
	import type { DashboardSummary } from '@spellbook/contracts/dashboard.ts';
	import PrototypeMetrics from './PrototypeMetrics.svelte';
	import PrototypeDeckCard from './PrototypeDeckCard.svelte';
	import PrototypeSets from './PrototypeSets.svelte';
	import PrototypeRecentCards from './PrototypeRecentCards.svelte';

	let { dashboard }: { dashboard: DashboardSummary } = $props();
</script>

<PrototypeMetrics {dashboard} />

<section class="decks" aria-labelledby="studio-decks">
	<div class="section-heading">
		<h2 id="studio-decks">Decks</h2>
		<a href="/mtg/decks">View all <span aria-hidden="true">↗</span></a>
	</div>
	{#if dashboard.decks.length}
		<div class="deck-layout">
			<div class="featured">
				<PrototypeDeckCard deck={dashboard.decks[0]} scale="featured" />
			</div>
			{#if dashboard.decks.length > 1}
				<div class="shelf">
					{#each dashboard.decks.slice(1) as deck (deck.id)}
						<PrototypeDeckCard {deck} />
					{/each}
				</div>
			{/if}
		</div>
	{:else}
		<p class="empty">No decks yet. <a href="/mtg/decks">Create a deck</a></p>
	{/if}
</section>

<div class="supporting">
	<PrototypeSets {dashboard} presentation="bars" />
	<PrototypeRecentCards {dashboard} limit={6} layout="gallery" />
</div>

<style>
	.decks { margin-top: 1.75rem; }
	.section-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
	h2 { margin: 0; color: var(--color-text-primary); font: 500 1.125rem var(--font-interface); }
	.section-heading a, .empty { color: var(--color-text-muted); font: 0.8125rem var(--font-interface); }
	.section-heading a { text-decoration: none; white-space: nowrap; }
	.section-heading a:hover { text-decoration: underline; }
	.empty a { color: var(--color-text-primary); }
	.deck-layout { display: grid; grid-template-columns: minmax(290px, 0.85fr) minmax(0, 2fr); gap: 1rem; align-items: start; }
	.featured { min-width: 0; }
	.shelf { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; min-width: 0; }
	.supporting { display: grid; grid-template-columns: minmax(240px, 0.85fr) minmax(0, 2fr); gap: 1rem; margin-top: 1.5rem; align-items: start; }
	@media (max-width: 760px) {
		.deck-layout, .supporting { grid-template-columns: minmax(0, 1fr); }
	}
</style>
