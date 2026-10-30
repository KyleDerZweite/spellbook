<script lang="ts">
	import type { DashboardSummary } from '@spellbook/contracts/dashboard.ts';
	import PrototypeMetrics from './PrototypeMetrics.svelte';
	import PrototypeSets from './PrototypeSets.svelte';
	import PrototypeRecentCards from './PrototypeRecentCards.svelte';
	import PrototypeDeckCard from './PrototypeDeckCard.svelte';
	import PrototypeMtgIcon from './PrototypeMtgIcon.svelte';
	import ProportionChart from '#lib/components/charts/ProportionChart.svelte';

	let { dashboard }: { dashboard: DashboardSummary } = $props();
	let measure = $state<'colors' | 'colorIdentity'>('colorIdentity');
	const palette: Record<string, string> = {
		White: '#d8d1b8', Blue: '#6e9fc3', Black: '#817c91', Red: '#c77a6b',
		Green: '#78a082', Multicolor: '#c1a55c', Colorless: '#a4a7a8', Unknown: '#707780'
	};
	const distribution = $derived(dashboard.catalogBreakdown?.[measure] ?? []);
	const items = $derived(distribution.map((item) => ({ label: item.label, value: item.quantity, color: palette[item.label] ?? 'var(--color-text-muted)' })));
	const featured = $derived(dashboard.decks.find((deck) => deck.commanders.length > 0) ?? dashboard.decks[0]);
</script>

<div class="overview">
	<PrototypeMetrics {dashboard} />
	<div class="main-band">
		<section class="panel distribution">
			<header><h2>Card distribution</h2><label>Measure <select bind:value={measure}><option value="colorIdentity">Color identity</option><option value="colors">Color</option></select></label></header>
			{#if !dashboard.catalogBreakdown}<p>Catalog breakdown unavailable.</p>
			{:else if dashboard.totals.total === 0}<p>No cards yet.</p>
			{:else}
				<div class="color-list">
					{#each distribution as bucket}
						<div class="color-row"><span class="color-label"><PrototypeMtgIcon kind="color" label={bucket.label} />{bucket.label}</span><span class="track"><span style:width={`${(bucket.quantity / dashboard.totals.total) * 100}%`} style:background={palette[bucket.label] ?? 'var(--color-text-muted)'}></span></span><strong>{bucket.quantity.toLocaleString()}</strong></div>
					{/each}
				</div>
				<ProportionChart label={`Owned copies by ${measure === 'colors' ? 'color' : 'color identity'}`} {items} kind="bar" />
			{/if}
		</section>
		<PrototypeSets {dashboard} presentation="bars" />
	</div>
	<div class="lower-band">
		<PrototypeRecentCards {dashboard} layout="rows" limit={5} />
		<section class="panel decks"><header><h2>Deck availability</h2><a href="/mtg/decks">All decks</a></header>
			{#if featured}<PrototypeDeckCard deck={featured} scale="featured" appearance="plain" />
				{#each dashboard.decks.filter((deck) => deck.id !== featured.id) as deck (deck.id)}<a class="deck-row" href={`/mtg/decks?deck=${encodeURIComponent(deck.id)}`}><span>{deck.name}</span><span>{(deck.exact + deck.alternate).toLocaleString()} / {deck.required.toLocaleString()}</span></a>{/each}
			{:else}<p>No decks yet.</p>{/if}
		</section>
		<section class="panel actions"><h2>Quick actions</h2><nav aria-label="Dashboard quick actions"><a href="/mtg/inventory">Inventory <span>↗</span></a><a href="/mtg/decks">Decks <span>↗</span></a><a href="/mtg/history">Inventory value <span>↗</span></a></nav></section>
	</div>
</div>

<style>
	.overview { display:grid; gap:16px; min-width:0; color:var(--color-text-primary); font-family:var(--font-interface); }
	.main-band { display:grid; grid-template-columns: 1.25fr 1fr; gap:16px; }
	.lower-band { display:grid; grid-template-columns: 1fr 1fr .9fr; gap:16px; align-items:start; }
	.panel { min-width:0; padding:20px; border:1px solid var(--color-border); border-radius:12px; background:var(--color-card); }
	header { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:16px; }
	h2 { margin:0; font:500 16px var(--font-interface); }
	header a, label, p { color:var(--color-text-secondary); font-size:12px; }
	label { display:flex; align-items:center; gap:8px; }
	select { max-width:100%; padding:8px; border:1px solid var(--color-border); border-radius:4px; color:var(--color-text-primary); background:var(--color-card); font:inherit; }
	.color-list { display:grid; gap:8px; margin-bottom:16px; }
	.color-row { display:grid; grid-template-columns:minmax(100px, 1fr) minmax(40px, 2fr) auto; align-items:center; gap:12px; font-size:12px; }
	.color-label { display:flex; align-items:center; gap:8px; min-width:0; }
	.track { height:10px; background:var(--color-surface); border-radius:4px; overflow:hidden; }
	.track span { display:block; height:100%; }
	strong, .deck-row span:last-child { font-variant-numeric:tabular-nums; }
	.deck-row, .actions a { display:flex; justify-content:space-between; gap:12px; padding:10px 0; border-top:1px solid var(--color-border); color:var(--color-text-secondary); text-decoration:none; font-size:12px; }
	.deck-row span:first-child { overflow-wrap:anywhere; }
	.actions nav { margin-top:16px; }
	.actions a { font-size:13px; min-height:40px; align-items:center; }
	a:hover { text-decoration:underline; }
	@media (max-width:1000px) { .lower-band { grid-template-columns:repeat(2,minmax(0,1fr)); } }
	@media (max-width:650px) { .main-band, .lower-band { grid-template-columns:1fr; } .panel { padding:16px; } }
</style>
