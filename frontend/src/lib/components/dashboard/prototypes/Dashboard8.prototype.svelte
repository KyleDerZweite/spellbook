<script lang="ts">
	import type { DashboardSummary } from '@spellbook/contracts/dashboard.ts';
	import ProportionChart from '#lib/components/charts/ProportionChart.svelte';
	import PrototypeMetrics from './PrototypeMetrics.svelte';
	import PrototypeSets from './PrototypeSets.svelte';
	import PrototypeRecentCards from './PrototypeRecentCards.svelte';
	import PrototypeDeckCard from './PrototypeDeckCard.svelte';
	import PrototypeMtgIcon from './PrototypeMtgIcon.svelte';
	import PrototypeColorBars from './PrototypeColorBars.svelte';
	import { primaryTypeColor } from './prototype-mtg.ts';
	let { dashboard }: { dashboard: DashboardSummary } = $props();
	let measure = $state<'colors' | 'colorIdentity'>('colorIdentity');

	const types = $derived(dashboard.catalogBreakdown?.primaryTypes ?? []);
	const colors = $derived(dashboard.catalogBreakdown?.[measure] ?? []);
</script>

<div class="overview">
	<nav aria-label="Quick actions">
		<a href="/mtg/inventory">Inventory</a><a href="/mtg/decks">Decks</a><a href="/mtg/history"
			>Value history</a
		>
	</nav>
	<PrototypeMetrics {dashboard} />
	<div class="summary">
		<PrototypeSets {dashboard} presentation="bars" />
		<section class="panel">
			<h2>Primary types</h2>
			{#if !dashboard.catalogBreakdown}<p>Catalog breakdown unavailable.</p>
			{:else if !dashboard.totals.total}<p>No cards yet.</p>
			{:else}
				<div class="type-layout">
					<div
						title="Each copy is classified once, with Land taking precedence over Creature and other types."
					>
						<ProportionChart
							label="Owned copies by primary type"
							kind="ring"
							items={types.map((v) => ({
								label: v.label,
								value: v.quantity,
								color: primaryTypeColor(v.label)
							}))}
						/>
					</div>
					<div class="legend">
						{#each types.filter((v) => v.quantity > 0) as item}<div>
								<PrototypeMtgIcon kind="type" label={item.label} /><span>{item.label}</span><strong
									>{item.quantity.toLocaleString()}</strong
								>
							</div>{/each}
					</div>
				</div>
			{/if}
		</section>
		<section class="panel">
			<header>
				<h2>Color</h2>
				<select aria-label="Color measure" bind:value={measure}
					><option value="colorIdentity">Color identity</option><option value="colors">Color</option
					></select
				>
			</header>
			{#if !dashboard.catalogBreakdown}<p>Catalog breakdown unavailable.</p>
			{:else if !dashboard.totals.total}<p>No cards yet.</p>
			{:else}
				<PrototypeColorBars
					items={colors}
					label={measure === 'colors' ? 'Owned copies by color' : 'Owned copies by color identity'}
				/>
			{/if}
		</section>
		<PrototypeRecentCards {dashboard} limit={4} layout="rows" />
	</div>
	<section class="decks">
		<header>
			<h2>Decks</h2>
			<a href="/mtg/decks">All decks</a>
		</header>
		<div class="deck-grid">
			{#each dashboard.decks as deck (deck.id)}<PrototypeDeckCard
					{deck}
					scale="featured"
				/>{:else}<p>No decks yet.</p>{/each}
		</div>
	</section>
	<section class="requirements">
		<h2>Deck requirements</h2>
		<div class="requirement-grid">
			{#each [{ title: 'Missing', rows: dashboard.requirements.missing }, { title: 'Alternate printings', rows: dashboard.requirements.alternate }] as group}<details
				>
					<summary>{group.title} ({group.rows.length})</summary>{#each group.rows as row}<a
							href={`/mtg/decks?deck=${encodeURIComponent(row.deckId)}`}
							><span>{row.name} <small>{row.deckName}</small></span><strong
								>{group.title === 'Missing' ? row.missing : row.alternate}</strong
							></a
						>{:else}<p>No requirements to show.</p>{/each}
				</details>{/each}
		</div>
	</section>
</div>

<style>
	.type-layout {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
	}
	.type-layout .legend {
		flex: 1;
		min-width: 112px;
	}
	.overview {
		display: grid;
		gap: 16px;
		min-width: 0;
		color: var(--color-text-primary);
		font-family: var(--font-interface);
	}
	nav,
	header {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	nav {
		justify-content: flex-end;
		flex-wrap: wrap;
	}
	nav a {
		padding: 8px 12px;
		border: 1px solid var(--color-border);
		border-radius: 8px;
		background: var(--color-card);
	}
	a {
		color: inherit;
		text-decoration: none;
		font-size: 12px;
	}
	a:hover {
		text-decoration: underline;
	}
	.summary {
		display: grid;
		grid-template-columns: 1.2fr 1.15fr 1fr 1.05fr;
		gap: 12px;
		align-items: stretch;
	}
	.panel,
	.requirements {
		min-width: 0;
		padding: 20px;
		border: 1px solid var(--color-border);
		border-radius: 12px;
		background: var(--color-card);
	}
	header {
		justify-content: space-between;
		margin-bottom: 16px;
	}
	h2 {
		margin: 0 0 16px;
		font: 500 16px var(--font-interface);
	}
	header h2 {
		margin: 0;
	}
	select {
		max-width: 120px;
		color: inherit;
		background: var(--color-card);
		border: 1px solid var(--color-border);
		border-radius: 4px;
		font: 12px var(--font-interface);
		padding: 4px;
	}
	.legend {
		display: grid;
		gap: 4px;
		margin-top: 12px;
	}
	.legend div {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 11px;
	}
	.legend strong {
		margin-left: auto;
		font-weight: 500;
		font-variant-numeric: tabular-nums;
	}
	.deck-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 12px;
	}
	.requirement-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
	}
	details {
		min-width: 0;
		font-size: 12px;
	}
	summary {
		cursor: pointer;
	}
	details a {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		padding: 8px 0;
		border-bottom: 1px solid var(--color-border);
	}
	small {
		display: block;
		color: var(--color-text-muted);
	}
	p {
		font-size: 12px;
		color: var(--color-text-muted);
	}
	@media (max-width: 1100px) {
		.summary,
		.deck-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 600px) {
		nav {
			justify-content: flex-start;
		}
		.summary,
		.deck-grid,
		.requirement-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
