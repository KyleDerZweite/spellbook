<script lang="ts">
	import type { DashboardSummary } from '@spellbook/contracts/dashboard.ts';
	import PrototypeMetrics from './PrototypeMetrics.svelte';
	import PrototypeDeckCard from './PrototypeDeckCard.svelte';
	import PrototypeSets from './PrototypeSets.svelte';
	import PrototypeRecentCards from './PrototypeRecentCards.svelte';
	import PrototypeActions from './PrototypeActions.svelte';
	import PrototypeDevices from './PrototypeDevices.svelte';

	let { dashboard }: { dashboard: DashboardSummary } = $props();
</script>

<div class="hub">
	<PrototypeMetrics {dashboard} />
	<section class="decks" aria-labelledby="decks-heading">
		<div class="section-heading">
			<h2 id="decks-heading">Decks</h2>
			<a href="/mtg/decks">All decks <span aria-hidden="true">↗</span></a>
		</div>
		<div class="deck-grid">
			{#each dashboard.decks as deck, index (deck.id)}
				<div class:featured={index === 0}>
					<PrototypeDeckCard {deck} scale={index === 0 ? 'featured' : 'standard'} />
				</div>
			{:else}
				<a class="empty" href="/mtg/decks">Create a deck <span aria-hidden="true">↗</span></a>
			{/each}
		</div>
	</section>
	<div class="support">
		<div class="sets"><PrototypeSets {dashboard} presentation="bars" /></div>
		<div class="recent"><PrototypeRecentCards {dashboard} limit={6} layout="gallery" /></div>
		<div class="actions"><PrototypeActions /></div>
		<div class="devices"><PrototypeDevices /></div>
	</div>
</div>

<style>
	.hub { display: grid; gap: 1.25rem; min-width: 0; }
	.decks { min-width: 0; }
	.section-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; margin: 0.25rem 0 0.9rem; }
	h2 { margin: 0; font: 500 1.125rem var(--font-interface); color: var(--color-text-primary); }
	.section-heading a, .empty { color: var(--color-text-secondary); font: 0.8125rem var(--font-interface); text-decoration: none; }
	.section-heading a:hover, .empty:hover { text-decoration: underline; }
	.deck-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; align-items: stretch; }
	.deck-grid > div { min-width: 0; }
	.deck-grid .featured { grid-column: span 1; }
	.empty { padding: 1.5rem; border: 1px solid var(--color-border); border-radius: 0.85rem; background: var(--color-card); }
	.support { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 1rem; align-items: start; }
	.sets { grid-column: span 4; }
	.recent { grid-column: span 8; }
	.actions { grid-column: span 5; }
	.devices { grid-column: span 7; }
	@media (max-width: 1050px) {
		.deck-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
		.sets, .recent { grid-column: span 6; }
	}
	@media (max-width: 700px) {
		.deck-grid { grid-template-columns: 1fr; }
		.sets, .recent, .actions, .devices { grid-column: 1 / -1; }
	}
</style>
