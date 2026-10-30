<script lang="ts">
	import type { DashboardSummary } from '@spellbook/contracts/dashboard.ts';
	import PrototypeMetrics from './PrototypeMetrics.svelte';
	import ProportionChart from '#lib/components/charts/ProportionChart.svelte';
	import PrototypeDeckCard from './PrototypeDeckCard.svelte';
	let { dashboard }: { dashboard: DashboardSummary } = $props();
	let scanOpen = $state(false);
	const types = [
		{ name: 'Creature', value: 42 },
		{ name: 'Instant', value: 16 },
		{ name: 'Sorcery', value: 13 },
		{ name: 'Enchantment', value: 11 },
		{ name: 'Artifact', value: 9 },
		{ name: 'Land', value: 7 },
		{ name: 'Other', value: 2 }
	];
	const colors = [
		{ name: 'White', value: 62 },
		{ name: 'Blue', value: 78 },
		{ name: 'Black', value: 70 },
		{ name: 'Red', value: 66 },
		{ name: 'Green', value: 72 },
		{ name: 'Colorless', value: 45 }
	];
</script>

<div class="overview">
	<div class="top">
		<span class="marker">Mock preview</span>
		<nav aria-label="Quick actions">
			<button onclick={() => (scanOpen = !scanOpen)}>Scan concept</button><a href="/mtg/inventory"
				>Inventory</a
			><a href="/mtg/decks">Decks</a>
		</nav>
	</div>
	{#if scanOpen}<div class="notice">
			<span>Mock scan concept. No scanner is connected.</span><button
				onclick={() => (scanOpen = false)}>Close</button
			>
		</div>{/if}
	<PrototypeMetrics {dashboard} />
	<div class="summary">
		<section class="panel sets">
			<header>
				<h2>Collection by Set</h2>
				<a href="/mtg/inventory">View inventory</a>
			</header>
			<div class="set-list">
				{#each dashboard.sets.slice(0, 5) as set}<div class="set-row">
						<span>{set.label.toUpperCase()}</span>
						<div class="track">
							<i
								style:width={`${dashboard.totals.total ? (set.quantity / dashboard.totals.total) * 100 : 0}%`}
							></i>
						</div>
						<strong>{set.quantity.toLocaleString()}</strong>
					</div>{:else}<p>No cards yet.</p>{/each}
			</div>
		</section>
		<section class="panel types">
			<header>
				<h2>Card types</h2>
				<span class="mock">Mock</span>
			</header>
			<div class="type-content">
				<ProportionChart
					label="Mock card types, 100 sample cards"
					kind="pie"
					items={types.map((t, i) => ({
						label: t.name,
						value: t.value,
						color: ['#8fabc0', '#9c9da3', '#86888e', '#73767e', '#616670', '#505762', '#414b58'][i]
					}))}
				/>
			</div>
		</section>
		<section class="panel mana">
			<header>
				<h2>Mana / color</h2>
				<span class="mock">Mock</span>
			</header>
			<div class="bars">
				{#each colors as color}<div>
						<div class="bar-space"><i style:height={`${color.value}%`}></i></div>
						<span>{color.name}</span>
					</div>{/each}
			</div>
		</section>
		<section class="panel recent">
			<header>
				<h2>Recently edited</h2>
				<a href="/mtg/inventory">View all</a>
			</header>
			<div class="recent-list">
				{#each dashboard.recentEntries.slice(0, 4) as entry}<a
						href={`/mtg/inventory/${encodeURIComponent(entry.id)}`}
						><div class="thumb">
							{#if entry.imageUri}<img src={entry.imageUri} alt="" />{/if}
						</div>
						<span
							><strong>{entry.name}</strong><small
								>{entry.setCode.toUpperCase()} · {entry.quantity}×</small
							></span
						></a
					>{:else}<p>No recently edited cards.</p>{/each}
			</div>
		</section>
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
				/>{:else}<a class="empty" href="/mtg/decks">Create a deck</a>{/each}
		</div>
	</section>
</div>

<style>
	.overview {
		display: grid;
		gap: 16px;
		min-width: 0;
		color: var(--color-text-primary);
		font-family: var(--font-interface);
	}
	.top,
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.marker,
	.mock {
		font-size: 11px;
		color: var(--color-text-muted);
	}
	nav {
		display: flex;
		gap: 8px;
	}
	nav a,
	button,
	.empty {
		border: 1px solid var(--color-border);
		border-radius: 8px;
		background: var(--color-card);
		color: var(--color-text-primary);
		padding: 8px 12px;
		font: 500 12px var(--font-interface);
		text-decoration: none;
		cursor: pointer;
	}
	.notice {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		padding: 12px;
		border: 1px solid var(--color-border);
		border-radius: 8px;
		font-size: 12px;
	}
	.summary {
		display: grid;
		grid-template-columns: 1.2fr 1.15fr 1fr 1.05fr;
		gap: 12px;
		align-items: stretch;
	}
	.panel {
		min-width: 0;
		padding: 16px;
		border: 1px solid var(--color-border);
		border-radius: 12px;
		background: var(--color-card);
	}
	h2 {
		margin: 0;
		font: 500 14px var(--font-interface);
	}
	header a {
		color: var(--color-text-secondary);
		font-size: 11px;
		text-decoration: none;
	}
	header a:hover {
		text-decoration: underline;
	}
	.set-list {
		display: grid;
		gap: 16px;
		margin-top: 24px;
	}
	.set-row {
		display: grid;
		grid-template-columns: minmax(40px, 1fr) minmax(30px, 1fr) auto;
		gap: 8px;
		align-items: center;
		font-size: 11px;
	}
	.set-row strong {
		font-weight: 500;
	}
	.track {
		height: 8px;
		background: var(--color-surface);
		border-radius: 4px;
		overflow: hidden;
	}
	.track i {
		display: block;
		height: 100%;
		background: var(--color-text-secondary);
	}
	.type-content {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 16px;
		margin-top: 20px;
	}
	.bars {
		display: flex;
		align-items: end;
		gap: 8px;
		height: 152px;
		margin-top: 20px;
	}
	.bars > div {
		display: grid;
		grid-template-rows: 112px auto;
		gap: 8px;
		flex: 1;
		min-width: 0;
		text-align: center;
		font-size: 11px;
	}
	.bar-space {
		display: flex;
		align-items: end;
		justify-content: center;
	}
	.bar-space i {
		width: 70%;
		background: var(--color-text-muted);
		border-radius: 4px 4px 0 0;
	}
	.bars span {
		overflow-wrap: anywhere;
	}
	.recent-list {
		display: grid;
		gap: 12px;
		margin-top: 16px;
	}
	.recent-list a {
		display: flex;
		gap: 8px;
		align-items: center;
		color: inherit;
		text-decoration: none;
		min-width: 0;
	}
	.thumb {
		width: 32px;
		height: 40px;
		background: var(--color-surface);
		border-radius: 4px;
		overflow: hidden;
		flex: none;
	}
	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.recent-list a span {
		min-width: 0;
		display: grid;
		gap: 4px;
	}
	.recent-list strong {
		font-size: 12px;
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.recent-list small,
	p {
		font-size: 11px;
		color: var(--color-text-muted);
		margin: 0;
	}
	.decks header {
		margin: 4px 0 12px;
	}
	.deck-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 12px;
	}
	@media (max-width: 1100px) {
		.summary {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.deck-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 600px) {
		.top {
			align-items: start;
			flex-direction: column;
		}
		nav {
			display: grid;
			grid-template-columns: repeat(3, minmax(0, 1fr));
			width: 100%;
		}
		nav a,
		nav button {
			text-align: center;
			padding: 12px 4px;
		}
		.summary,
		.deck-grid {
			grid-template-columns: 1fr;
		}
		.panel {
			padding: 16px;
		}
		.bars {
			height: 132px;
		}
		.bars > div {
			grid-template-rows: 92px auto;
		}
	}
</style>
