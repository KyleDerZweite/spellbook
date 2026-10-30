<script lang="ts">
	import type { DashboardSummary, DashboardRequirement } from '@spellbook/contracts/dashboard.ts';
	import PrototypeMetrics from './PrototypeMetrics.svelte';
	import PrototypeDeckCard from './PrototypeDeckCard.svelte';
	import PrototypeRecentCards from './PrototypeRecentCards.svelte';
	import ProportionChart from '#lib/components/charts/ProportionChart.svelte';
	let { dashboard }: { dashboard: DashboardSummary } = $props();
	const totals = $derived(
		dashboard.decks.reduce(
			(a, d) => ({
				exact: a.exact + BigInt(d.exact),
				alternate: a.alternate + BigInt(d.alternate),
				missing: a.missing + BigInt(d.missing)
			}),
			{ exact: 0n, alternate: 0n, missing: 0n }
		)
	);
	const statuses = $derived({
		complete: dashboard.decks.filter((d) => d.required > 0 && d.missing === 0).length,
		partial: dashboard.decks.filter((d) => d.missing > 0 && d.exact + d.alternate > 0).length,
		empty: dashboard.decks.filter((d) => d.required === 0 || d.exact + d.alternate === 0).length
	});
	const topDecks = $derived(
		[...dashboard.decks]
			.sort(
				(a, b) =>
					(b.required ? (b.exact + b.alternate) / b.required : 0) -
					(a.required ? (a.exact + a.alternate) / a.required : 0)
			)
			.slice(0, 3)
	);
	function deckLink(row: DashboardRequirement) {
		return `/mtg/decks?deck=${encodeURIComponent(row.deckId)}`;
	}
</script>

<div class="workbench">
	<PrototypeMetrics {dashboard} />
	<div class="grid first">
		<section class="panel">
			<header>
				<h2>Deck availability</h2>
				<a href="/mtg/decks">All decks ↗</a>
			</header>
			<div class="readiness">
				<ProportionChart
					label="Deck readiness"
					kind="ring"
					unit={{ singular: 'deck', plural: 'decks' }}
					items={[
						{ label: 'Complete', value: statuses.complete, color: 'var(--color-success)' },
						{ label: 'Partial', value: statuses.partial, color: 'var(--color-warning)' },
						{
							label: 'Empty or none available',
							value: statuses.empty,
							color: 'var(--color-text-muted)'
						}
					]}
					>{#snippet center()}<strong class="readiness-count">{statuses.complete}</strong><small
							>of {dashboard.decks.length}</small
						>{/snippet}</ProportionChart
				>
				<div class="status-list">
					<div><span>Complete</span><strong>{statuses.complete}</strong></div>
					<div><span>Partial</span><strong>{statuses.partial}</strong></div>
					<div><span>Empty or none available</span><strong>{statuses.empty}</strong></div>
				</div>
			</div>
		</section>
		<section class="panel">
			<header><h2>Deck requirements</h2></header>
			<div class="counts">
				<div><strong>{totals.exact.toLocaleString()}</strong><span>Exact</span></div>
				<div><strong>{totals.alternate.toLocaleString()}</strong><span>Alternate</span></div>
				<div><strong>{totals.missing.toLocaleString()}</strong><span>Missing</span></div>
			</div>
			<small>Requirements can overlap across decks.</small>
		</section>
		<section class="panel">
			<header><h2>Workspaces</h2></header>
			<nav>
				<a href="/mtg/decks">Open decks ↗</a><a href="/mtg/inventory">Open inventory ↗</a><a
					href="/mtg/history">Inventory value ↗</a
				>
			</nav>
		</section>
	</div>
	<div class="grid second">
		<section class="panel">
			<header>
				<h2>Missing requirements</h2>
				<a href="/mtg/decks">All decks ↗</a>
			</header>
			{#each dashboard.requirements.missing as row (`${row.deckId}-${row.canonicalCardId}`)}<a
					class="requirement"
					href={deckLink(row)}
					>{#if row.imageUri}<img src={row.imageUri} alt="" loading="lazy" />{:else}<span
							class="placeholder"
						></span>{/if}<span class="details"><b>{row.name}</b><small>{row.deckName}</small></span
					><small>{row.missing} missing</small></a
				>{:else}<p>No missing requirements.</p>{/each}
		</section>
		<section class="panel">
			<header><h2>Alternate printings</h2></header>
			{#each dashboard.requirements.alternate.slice(0, 4) as row (`${row.deckId}-${row.canonicalCardId}`)}<a
					class="requirement"
					href={deckLink(row)}
					>{#if row.imageUri}<img src={row.imageUri} alt="" loading="lazy" />{:else}<span
							class="placeholder"
						></span>{/if}<span class="details"><b>{row.name}</b><small>{row.deckName}</small></span
					><small>{row.alternate} alternate</small></a
				>{:else}<p>No alternate requirements.</p>{/each}
			{#if dashboard.requirements.alternate.length > 4}<details class="more">
					<summary>More alternate requirements</summary
					>{#each dashboard.requirements.alternate.slice(4) as row}<a
							class="requirement"
							href={deckLink(row)}
							>{#if row.imageUri}<img src={row.imageUri} alt="" loading="lazy" />{/if}<span
								class="details"><b>{row.name}</b><small>{row.deckName}</small></span
							><small>{row.alternate} alternate</small></a
						>{/each}
				</details>{/if}
		</section>
		<section class="panel">
			<header>
				<h2>Top decks</h2>
				<a href="/mtg/decks">All decks ↗</a>
			</header>
			<div class="deck-list">
				{#each topDecks.slice(0, 1) as deck (deck.id)}<PrototypeDeckCard
						{deck}
						scale="featured"
						appearance="plain"
					/>{:else}<p>No decks yet.</p>{/each}
				{#each topDecks.slice(1) as deck}<a
						class="deck-row"
						href={`/mtg/decks?deck=${encodeURIComponent(deck.id)}`}
						><span>{deck.name}</span><small
							>{deck.exact + deck.alternate} / {deck.required} available</small
						></a
					>{/each}
			</div>
		</section>
	</div>
	<div class="grid bottom">
		<PrototypeRecentCards {dashboard} layout="rows" />
		<section class="panel">
			<header><h2>Requirements by deck</h2></header>
			{#each dashboard.decks as deck (deck.id)}<a
					class="deck-row"
					href={`/mtg/decks?deck=${encodeURIComponent(deck.id)}`}
					><span>{deck.name}</span><small>{deck.missing} missing / {deck.required} required</small
					></a
				>{:else}<p>No decks yet.</p>{/each}
		</section>
		<section class="panel">
			<header>
				<h2>Inventory finishes</h2>
				<a href="/mtg/inventory">Inventory ↗</a>
			</header>
			{#each dashboard.finishes as finish}<div class="deck-row">
					<span>{finish.label}</span><small>{finish.quantity.toLocaleString()} copies</small>
				</div>{:else}<p>No inventory yet.</p>{/each}
		</section>
	</div>
</div>

<style>
	.more {
		margin-top: 16px;
		font: 400 12px var(--font-interface);
		color: var(--color-text-secondary);
	}
	.more summary {
		cursor: pointer;
	}
	.readiness {
		display: flex;
		align-items: center;
		gap: 16px;
		flex-wrap: wrap;
	}
	.readiness-count {
		font: 400 28px var(--font-display);
	}
	.status-list {
		flex: 1;
		min-width: 112px;
	}
	.workbench {
		display: grid;
		gap: 16px;
		min-width: 0;
		color: var(--color-text-primary);
		font-family: var(--font-interface);
	}
	header,
	.deck-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	h2,
	p {
		margin: 0;
	}

	h2 {
		font: 500 1rem var(--font-interface);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 12px;
		align-items: start;
	}
	.first {
		grid-template-columns: 1fr 1.1fr 0.85fr;
	}
	.panel {
		min-width: 0;
		padding: 16px;
		background: var(--color-card);
		border: 1px solid var(--color-border);
		border-radius: 12px;
	}
	header {
		margin-bottom: 16px;
	}
	a {
		color: var(--color-text-secondary);
		font-size: 12px;
		text-decoration: none;
	}
	a:hover {
		text-decoration: underline;
	}
	small,
	p {
		font-size: 12px;
		color: var(--color-text-secondary);
	}
	.status-list {
		display: grid;
		gap: 12px;
		margin: 12px 0 20px;
	}
	.status-list div {
		display: flex;
		justify-content: space-between;
		padding: 8px 0;
		border-bottom: 1px solid var(--color-border);
		font-size: 13px;
	}
	.counts {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
		margin-bottom: 16px;
	}
	.counts div {
		display: grid;
		text-align: center;
		gap: 8px;
		padding: 24px 4px;
		background: var(--color-surface);
		border-radius: 12px;
	}
	.counts strong {
		font: 400 1.7rem var(--font-display);
		font-variant-numeric: tabular-nums;
	}
	.counts span {
		font-size: 12px;
		color: var(--color-text-secondary);
	}
	nav {
		display: grid;
		gap: 8px;
	}
	nav a {
		padding: 12px;
		border: 1px solid var(--color-border);
		border-radius: 8px;
	}
	.requirement {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 0;
		border-bottom: 1px solid var(--color-border);
		color: var(--color-text-primary);
	}
	.requirement img,
	.placeholder {
		width: 40px;
		aspect-ratio: 5/7;
		object-fit: contain;
		flex: none;
		border-radius: 4px;
		background: var(--color-surface);
	}
	.details {
		display: grid;
		gap: 4px;
		min-width: 0;
		flex: 1;
		overflow-wrap: anywhere;
	}
	.requirement > small {
		text-align: right;
	}
	.deck-list {
		display: grid;
		gap: 12px;
	}
	.deck-row {
		padding: 12px 0;
		border-bottom: 1px solid var(--color-border);
		font-size: 13px;
		overflow-wrap: anywhere;
	}
	.deck-row span {
		min-width: 0;
	}
	.deck-row small {
		text-align: right;
		flex: none;
	}
	strong {
		font-variant-numeric: tabular-nums;
	}
	@media (max-width: 1050px) {
		.grid,
		.first {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 700px) {
		.grid,
		.first {
			grid-template-columns: 1fr;
		}
	}
</style>
