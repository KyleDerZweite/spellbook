<script lang="ts">
	import type { DashboardSummary } from '@spellbook/contracts/dashboard.ts';
	import PrototypeMetrics from './PrototypeMetrics.svelte';
	import PrototypeDeckCard from './PrototypeDeckCard.svelte';
	import PrototypeSets from './PrototypeSets.svelte';
	import PrototypeRecentCards from './PrototypeRecentCards.svelte';
	let { dashboard }: { dashboard: DashboardSummary } = $props();
</script>

<PrototypeMetrics {dashboard} />
<section>
	<h2>Decks</h2>
	<div class="deck-grid">
		{#each dashboard.decks as deck (deck.id)}<PrototypeDeckCard {deck} />{/each}
	</div>
</section>
<div class="lower"><PrototypeSets {dashboard} /><PrototypeRecentCards {dashboard} /></div>

<style>
	h2 {
		font: 500 1.125rem var(--font-interface);
		margin-bottom: 1rem;
	}
	.deck-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 1.25rem;
	}
	.lower {
		display: grid;
		grid-template-columns: 1fr 2fr;
		gap: 1.25rem;
		margin-top: 1.25rem;
	}
	@media (max-width: 760px) {
		.lower {
			grid-template-columns: 1fr;
		}
	}
</style>
