<script lang="ts">
	import type { DashboardSummary } from '@spellbook/contracts/dashboard.ts';
	import PrototypeMetrics from './PrototypeMetrics.svelte';
	import PrototypeSets from './PrototypeSets.svelte';
	import PrototypeRecentCards from './PrototypeRecentCards.svelte';
	import PrototypeDeckCard from './PrototypeDeckCard.svelte';
	import PrototypeColorBars from './PrototypeColorBars.svelte';

	let { dashboard }: { dashboard: DashboardSummary } = $props();
	let measure = $state<'colors' | 'colorIdentity'>('colorIdentity');
	const distribution = $derived(dashboard.catalogBreakdown?.[measure] ?? []);
	const featured = $derived(
		dashboard.decks.find((deck) => deck.commanders.length > 0) ?? dashboard.decks[0]
	);
</script>

<div class="overview">
	<PrototypeMetrics {dashboard} />
	<div class="main-band">
		<section class="panel distribution">
			<header>
				<h2>Card distribution</h2>
				<label
					><span class="sr-only">Color measure</span><select bind:value={measure}
						><option value="colorIdentity">Color identity</option><option value="colors"
							>Color</option
						></select
					></label
				>
			</header>
			{#if !dashboard.catalogBreakdown}<p>Catalog breakdown unavailable.</p>
			{:else if dashboard.totals.total === 0}<p>No cards yet.</p>
			{:else}
				<PrototypeColorBars
					items={distribution}
					height={192}
					label={measure === 'colors' ? 'Owned copies by color' : 'Owned copies by color identity'}
				/>
			{/if}
		</section>
		<PrototypeSets {dashboard} />
	</div>
	<div class="lower-band">
		<PrototypeRecentCards {dashboard} layout="rows" limit={5} />
		<section class="panel decks">
			<header>
				<h2>Deck availability</h2>
				<a href="/mtg/decks">All decks</a>
			</header>
			{#if featured}<PrototypeDeckCard deck={featured} scale="featured" appearance="plain" />
				{#each dashboard.decks.filter((deck) => deck.id !== featured.id) as deck (deck.id)}<a
						class="deck-row"
						href={`/mtg/decks?deck=${encodeURIComponent(deck.id)}`}
						><span>{deck.name}</span><span
							>{(deck.exact + deck.alternate).toLocaleString()} / {deck.required.toLocaleString()}</span
						></a
					>{/each}
			{:else}<p>No decks yet.</p>{/if}
		</section>
		<section class="panel actions">
			<h2>Quick actions</h2>
			<nav aria-label="Dashboard quick actions">
				<a href="/mtg/inventory">Inventory <span>↗</span></a><a href="/mtg/decks"
					>Decks <span>↗</span></a
				>
			</nav>
		</section>
	</div>
</div>

<style>
	.overview {
		display: grid;
		gap: 16px;
		min-width: 0;
		color: var(--color-text-primary);
		font-family: var(--font-interface);
	}
	.main-band {
		display: grid;
		grid-template-columns: 1.25fr 1fr;
		gap: 16px;
	}
	.lower-band {
		display: grid;
		grid-template-columns: 1fr 1fr 0.9fr;
		gap: 16px;
		align-items: start;
	}
	.panel {
		min-width: 0;
		padding: 20px;
		border: 1px solid var(--color-border);
		border-radius: 12px;
		background: var(--color-card);
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		margin-bottom: 16px;
	}
	h2 {
		margin: 0;
		font: 500 16px var(--font-interface);
	}
	header a,
	label,
	p {
		color: var(--color-text-secondary);
		font-size: 12px;
	}
	label {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	select {
		max-width: 100%;
		padding: 8px;
		border: 1px solid var(--color-border);
		border-radius: 4px;
		color: var(--color-text-primary);
		background: var(--color-card);
		font: inherit;
	}
	.deck-row span:last-child {
		font-variant-numeric: tabular-nums;
	}
	.deck-row,
	.actions a {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		padding: 12px 0;
		border-top: 1px solid var(--color-border);
		color: var(--color-text-secondary);
		text-decoration: none;
		font-size: 12px;
	}
	.deck-row span:first-child {
		overflow-wrap: anywhere;
	}
	.actions nav {
		margin-top: 16px;
	}
	.actions a {
		font-size: 13px;
		min-height: 40px;
		align-items: center;
	}
	a:hover {
		text-decoration: underline;
	}
	@media (max-width: 1000px) {
		.lower-band {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 650px) {
		.main-band,
		.lower-band {
			grid-template-columns: 1fr;
		}
		.panel {
			padding: 16px;
		}
	}
</style>
