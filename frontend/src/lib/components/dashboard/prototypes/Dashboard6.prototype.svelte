<script lang="ts">
	import type { DashboardSummary, DashboardDistribution } from '@spellbook/contracts/dashboard.ts';
	import ProportionChart from '#lib/components/charts/ProportionChart.svelte';
	import PrototypeMetrics from './PrototypeMetrics.svelte';
	import PrototypeSets from './PrototypeSets.svelte';
	import PrototypeRecentCards from './PrototypeRecentCards.svelte';
	import PrototypeComposition from './PrototypeComposition.svelte';
	import PrototypeDeckCard from './PrototypeDeckCard.svelte';
	import PrototypeMtgIcon from './PrototypeMtgIcon.svelte';
	let { dashboard }: { dashboard: DashboardSummary } = $props();
	let measure = $state<'colors' | 'colorIdentity'>('colors');
	const palette = ['#c5bda4', '#7fa6c2', '#777580', '#bd817b', '#83a487', '#b5a16f', '#a1a4a5', '#777'];
	const colorItems = $derived((dashboard.catalogBreakdown?.[measure] ?? []).map((v, i) => ({ label: v.label, value: v.quantity, color: palette[i % palette.length] })));
	const maxRarity = $derived(Math.max(0, ...(dashboard.catalogBreakdown?.rarities ?? []).map(v => v.quantity)));
	const pct = (v: DashboardDistribution) => dashboard.totals.total ? (v.quantity / dashboard.totals.total) * 100 : 0;
</script>

<div class="layout">
	<main>
		<PrototypeMetrics {dashboard} />
		<div class="analytics">
			<PrototypeSets {dashboard} presentation="bars" />
			<section>
				<header><h2>Color distribution</h2><label>Measure <select bind:value={measure}><option value="colors">Color</option><option value="colorIdentity">Color identity</option></select></label></header>
				{#if !dashboard.catalogBreakdown}<p>Catalog breakdown unavailable.</p>{:else if !dashboard.totals.total}<p>No cards yet.</p>{:else}
					<div class="color-chart"><ProportionChart label={`Owned copies by ${measure === 'colors' ? 'color' : 'color identity'}`} kind="ring" items={colorItems} /><div class="legend">{#each dashboard.catalogBreakdown[measure] as item}<div><PrototypeMtgIcon kind="color" label={item.label} /><span>{item.label}</span><strong>{item.quantity.toLocaleString()}</strong></div>{/each}</div></div>
				{/if}
			</section>
			<section>
				<header><h2>Rarity</h2></header>
				{#if !dashboard.catalogBreakdown}<p>Catalog breakdown unavailable.</p>{:else if !dashboard.totals.total}<p>No cards yet.</p>{:else}
					<div class="columns">{#each dashboard.catalogBreakdown.rarities as item}<div class="column"><span>{item.quantity.toLocaleString()}</span><div class="column-space"><i style:height={`${maxRarity ? item.quantity / maxRarity * 100 : 0}%`}></i></div><PrototypeMtgIcon kind="rarity" label={item.label} /><span>{item.label}</span></div>{/each}</div>
				{/if}
			</section>
			<section>
				<header><h2>Primary types</h2><span title="A card is classified once, using Land, Creature, Instant, Sorcery, Enchantment, Artifact, Planeswalker, Battle, then Other precedence.">ⓘ</span></header>
				{#if !dashboard.catalogBreakdown}<p>Catalog breakdown unavailable.</p>{:else if !dashboard.totals.total}<p>No cards yet.</p>{:else}
					<div class="types">{#each dashboard.catalogBreakdown.primaryTypes as item}<div class="type"><PrototypeMtgIcon kind="type" label={item.label} /><span>{item.label}</span><div class="track"><i style:width={`${pct(item)}%`}></i></div><strong>{item.quantity.toLocaleString()}</strong></div>{/each}</div>
				{/if}
			</section>
		</div>
		<div class="bottom"><PrototypeRecentCards {dashboard} layout="rows" /><PrototypeComposition {dashboard} /></div>
	</main>
	<aside>
		<section><header><h2>Workspaces</h2></header><nav><a href="/mtg/inventory">Inventory <span>↗</span></a><a href="/mtg/decks">Decks <span>↗</span></a></nav></section>
		<section><header><h2>Catalog coverage</h2></header>{#if dashboard.catalogBreakdown}<div class="fact"><span>Matched copies</span><strong>{dashboard.catalogBreakdown.matchedQuantity.toLocaleString()}</strong></div><div class="fact"><span>Unknown copies</span><strong>{dashboard.catalogBreakdown.unknownQuantity.toLocaleString()}</strong></div>{:else}<p>Catalog breakdown unavailable.</p>{/if}</section>
		{#if dashboard.decks[0]}<PrototypeDeckCard deck={dashboard.decks[0]} />{:else}<section><h2>Decks</h2><p>No decks yet.</p><a href="/mtg/decks">Open decks ↗</a></section>{/if}
	</aside>
</div>

<style>
	.layout { display:grid; grid-template-columns:minmax(0,1fr) 300px; gap:12px; color:var(--color-text-primary); font:13px var(--font-interface); }
	main, aside { display:grid; align-content:start; gap:12px; min-width:0; }
	.analytics, .bottom { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
	section { min-width:0; padding:20px; background:var(--color-card); border:1px solid var(--color-border); border-radius:12px; }
	header { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:16px; }
	h2 { margin:0; font:500 16px var(--font-interface); }
	p { color:var(--color-text-muted); font-size:13px; }
	label { display:flex; align-items:center; gap:8px; color:var(--color-text-secondary); font-size:11px; }
	select { max-width:100%; padding:6px; color:var(--color-text-primary); background:var(--color-surface); border:1px solid var(--color-border); border-radius:4px; font:inherit; }
	.color-chart { display:flex; align-items:center; justify-content:space-around; gap:12px; flex-wrap:wrap; }
	.legend { flex:1; min-width:120px; display:grid; gap:4px; }
	.legend div, .fact { display:flex; align-items:center; gap:8px; padding:3px 0; }
	.legend span, .fact span { flex:1; }
	strong { font-weight:500; font-variant-numeric:tabular-nums; }
	.columns { display:flex; align-items:end; gap:8px; height:200px; overflow-x:auto; }
	.column { flex:1; min-width:48px; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:end; gap:4px; font-size:11px; }
	.column-space { height:120px; width:60%; display:flex; align-items:end; }
	.column-space i { width:100%; background:var(--color-chart-primary); border-radius:4px 4px 0 0; }
	.types { display:grid; gap:4px; }
	.type { display:grid; grid-template-columns:20px minmax(65px,auto) minmax(30px,1fr) auto; align-items:center; gap:8px; font-size:11px; }
	.track { height:8px; background:var(--color-surface); border-radius:4px; overflow:hidden; }
	.track i { display:block; height:100%; background:var(--color-chart-primary); }
	nav { display:grid; gap:8px; } a { color:var(--color-text-primary); } nav a { display:flex; justify-content:space-between; padding:12px; border:1px solid var(--color-border); border-radius:8px; text-decoration:none; }
	@media(max-width:1050px) { .layout { grid-template-columns:1fr; } aside { grid-template-columns:repeat(2,minmax(0,1fr)); } }
	@media(max-width:650px) { .analytics,.bottom,aside { grid-template-columns:1fr; } }
</style>
