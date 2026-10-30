<script lang="ts">
	import type { DashboardSummary } from '@spellbook/contracts/dashboard.ts';
	import PrototypeMetrics from './PrototypeMetrics.svelte';
	import PrototypeDeckCard from './PrototypeDeckCard.svelte';
	import PrototypeSets from './PrototypeSets.svelte';
	import PrototypeRecentCards from './PrototypeRecentCards.svelte';
	import PrototypeActions from './PrototypeActions.svelte';
	let { dashboard }: { dashboard: DashboardSummary } = $props();
</script>

<div class="dashboard">
	<PrototypeMetrics {dashboard} />
	<section class="decks" aria-labelledby="decks-heading">
		<div class="section-heading">
			<h2 id="decks-heading">Decks</h2>
			<a href="/mtg/decks">View all <span aria-hidden="true">↗</span></a>
		</div>
		{#if dashboard.decks.length}
			<div class="deck-grid">
				{#each dashboard.decks as deck (deck.id)}
					<PrototypeDeckCard {deck} scale="featured" />
				{/each}
			</div>
		{:else}
			<p class="empty">No decks yet. <a href="/mtg/decks">Create a deck</a></p>
		{/if}
	</section>
	<div class="lower">
		<div class="sets"><PrototypeSets {dashboard} /></div>
		<div class="recent"><PrototypeRecentCards {dashboard} layout="gallery" /></div>
		<div class="actions"><PrototypeActions /></div>
	</div>
</div>

<style>
	.dashboard { display: grid; gap: 2rem; min-width: 0; }
	.section-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
	h2 { margin: 0; font: 500 1.125rem var(--font-interface); color: var(--color-text-primary); }
	.section-heading a, .empty a { color: var(--color-text-secondary); font: 0.8125rem var(--font-interface); text-decoration: none; }
	.section-heading a:hover, .empty a:hover { text-decoration: underline; }
	.deck-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; }
	.lower { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); gap: 1rem; align-items: start; }
	.sets, .recent, .actions { min-width: 0; }
	.actions { grid-column: 1; }
	.empty { color: var(--color-text-muted); font: 0.875rem var(--font-interface); }
	@media (max-width: 1100px) { .deck-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
	@media (max-width: 760px) { .deck-grid, .lower { grid-template-columns: minmax(0, 1fr); } .actions { grid-column: auto; } }
</style>
