<script lang="ts">
	import WorkspaceHeader from '#lib/components/layout/WorkspaceHeader.svelte';
	import ProportionChart from '#lib/components/charts/ProportionChart.svelte';
	import DeckAvailabilityRing from '#lib/components/charts/DeckAvailabilityRing.svelte';
	import { historyBoundaryTimer } from '#lib/valuation/history-boundary.ts';
	import ValueSummary from '#lib/components/valuation/ValueSummary.svelte';
	import InventoryValueHistory from '#lib/components/valuation/InventoryValueHistory.svelte';
	import SavedStateStatus from '#lib/saved-state/SavedStateStatus.svelte';
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import { workspaceSavedState } from '#lib/saved-state/workspace.svelte.ts';
	import { readSavedJSON } from '#lib/saved-state/read.ts';
	import type { ResourceSubscription } from '#lib/saved-state/workspace.ts';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
	let retrying = $state(false);
	let dashboard = $state(untrack(() => data.dashboard));
	let loadError = $state(untrack(() => data.loadError));
	let subscription: ResourceSubscription | undefined = $state();
	let boundaryAccount = '';
	const boundaryTimer = historyBoundaryTimer(
		() => subscription?.invalidate(),
		() => workspaceSavedState.isActive(boundaryAccount) && document.visibilityState === 'visible'
	);
	$effect(() => {
		boundaryAccount = page.data.user?.accountId ?? '';
		boundaryTimer.schedule(dashboard?.inventoryValueHistory?.nextRefreshAt);
		return boundaryTimer.cancel;
	});

	onMount(() => {
		subscription = workspaceSavedState.subscribe({
			topics: ['inventory', 'decks', 'scan', 'values'],
			clear: () => {
				dashboard = null;
				loadError = '';
			},
			refresh: async (lease) => {
				const current = await readSavedJSON<NonNullable<typeof dashboard>>(
					'/api/v1/mtg/dashboard',
					lease
				);
				if (current && lease.current()) {
					dashboard = current;
					loadError = '';
				}
			}
		});
		return () => subscription?.dispose();
	});
	const finishLabels: Record<string, string> = { nonfoil: 'Nonfoil', foil: 'Foil' };
	const conditionLabels: Record<string, string> = {
		NM: 'Near mint',
		LP: 'Lightly played',
		MP: 'Moderately played',
		HP: 'Heavily played',
		DMG: 'Damaged'
	};
	const topSets = $derived(dashboard?.sets.slice(0, 5) ?? []);
	const setColors = [
		'var(--color-chart-primary)',
		'var(--color-violet)',
		'var(--color-success)',
		'var(--color-warning)',
		'var(--color-error)',
		'var(--color-chart-teal)',
		'var(--color-chart-rose)',
		'var(--color-chart-indigo)'
	];
	const otherSetCount = $derived(Math.max(0, (dashboard?.sets.length ?? 0) - 5));
	const otherSets = $derived(
		dashboard?.sets.slice(5).reduce((sum, set) => sum + set.quantity, 0) ?? 0
	);
	const setItems = $derived([
		...topSets.map((set, index) => ({
			label: set.label.toUpperCase(),
			value: set.quantity,
			share: set.share,
			color: setColors[index]
		})),
		...(otherSets > 0 && dashboard
			? [
					{
						label: `Other · ${otherSetCount} sets`,
						value: otherSets,
						share: otherSets / dashboard.totals.total,
						color: 'var(--color-text-muted)'
					}
				]
			: [])
	]);

	const percent = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 });
	const finishItems = $derived(
		dashboard?.finishes.map((item, index) => ({
			label: finishLabels[item.label] ?? item.label,
			value: item.quantity,
			color: index === 0 ? 'var(--color-chart-primary)' : 'var(--color-violet)'
		})) ?? []
	);
	const conditionColors: Record<string, string> = {
		NM: 'var(--color-success)',
		LP: 'var(--color-info)',
		MP: 'var(--color-warning)',
		HP: 'var(--color-violet)',
		DMG: 'var(--color-error)'
	};
	const conditionItems = $derived(
		dashboard?.conditions.map((item) => ({
			label: conditionLabels[item.label] ?? item.label,
			value: item.quantity,
			color: conditionColors[item.label] ?? 'var(--color-text-muted)'
		})) ?? []
	);
	const extraCopies = $derived(
		Math.max(0, (dashboard?.totals.total ?? 0) - (dashboard?.totals.names ?? 0))
	);
	const foilCopies = $derived(
		dashboard?.finishes.find((item) => item.label === 'foil')?.quantity ?? 0
	);
	const leadingCondition = $derived(
		dashboard?.conditions.reduce((best, item) => (item.quantity > best.quantity ? item : best), {
			label: 'NM',
			quantity: 0,
			share: 0
		})
	);
	const missingDecks = $derived(
		dashboard?.decks.filter((deck) => deck.required > 0 && deck.missing > 0).length ?? 0
	);
	async function retry() {
		retrying = true;
		try {
			subscription?.invalidate();
		} finally {
			retrying = false;
		}
	}
</script>

<svelte:head
	><title>Dashboard | Spellbook</title><meta name="robots" content="noindex" /></svelte:head
>
<div class="workspace-container dashboard-page">
	<SavedStateStatus resource={subscription} />
	<WorkspaceHeader title="Dashboard">
		{#snippet actions()}<a href="/mtg/inventory" class="btn btn-secondary btn-sm">View inventory</a
			><a href="/mtg/search" class="btn btn-primary btn-sm">Add cards</a>{/snippet}
	</WorkspaceHeader>
	{#if loadError}
		<div class="dashboard-empty" role="alert">
			<p>{loadError}</p>
			<button class="btn btn-secondary btn-sm" onclick={retry} disabled={retrying}
				>{retrying ? 'Loading...' : 'Try again'}</button
			>
		</div>
	{:else if dashboard}
		<ul class="dashboard-totals" aria-label="Collection overview">
			<li>
				<a
					href="/mtg/inventory"
					aria-label={`${dashboard.totals.total.toLocaleString()} total cards, ${dashboard.totals.names.toLocaleString()} unique cards`}
					><span class="metric-label">Total / Unique Cards</span><span class="metric-counts"
						><strong>{dashboard.totals.total.toLocaleString()}</strong><span
							class="metric-slash"
							aria-hidden="true">/</span
						><strong class="unique-count">{dashboard.totals.names.toLocaleString()}</strong></span
					></a
				>
			</li>
			<li>
				<a href="/mtg/inventory"
					><span class="metric-label">Sets</span><strong
						>{dashboard.totals.sets.toLocaleString()}</strong
					><small>{dashboard.totals.printings.toLocaleString()} printings</small></a
				>
			</li>
			<li>
				<a href="/mtg/decks"
					><span class="metric-label">Decks</span><strong
						>{dashboard.totals.decks.toLocaleString()}</strong
					>{#if missingDecks}<small class="missing-note">{missingDecks} with missing cards</small
						>{/if}</a
				>
			</li>
		</ul>
		{#if dashboard.totals.total === 0}<div class="dashboard-empty">
				<p>Your inventory is empty. Add your first cards to start building your collection.</p>
				<a href="/mtg/search" class="btn btn-primary btn-sm">Find cards</a>
			</div>{/if}
		<div class="dashboard-grid">
			<div class="dashboard-history">
				<InventoryValueHistory
					demo={data.demoMode}
					history={dashboard.inventoryValueHistory}
					error={dashboard.valuationError?.message}
					compact
					onRetry={() => subscription?.invalidate()}
				>
					{#snippet summary()}
						<div class="value-panel-header">
							<span class="period-label"
								>{dashboard?.inventoryValueHistory?.window.days ?? 30} days</span
							><a href="/mtg/history" class="panel-link" aria-label="Open Inventory value history"
								>View history <span aria-hidden="true">↗</span></a
							>
						</div>
						<ValueSummary
							estimate={dashboard?.inventoryValue?.estimate ?? null}
							evaluatedAt={dashboard?.inventoryValue?.evaluatedAt}
							compact
						/>
					{/snippet}
				</InventoryValueHistory>
			</div>
			<section class="analytics-panel dashboard-decks" aria-labelledby="decks-heading">
				<div class="section-heading">
					<h2 id="decks-heading">Your decks</h2>
					<a href="/mtg/decks" class="panel-link">View decks <span aria-hidden="true">↗</span></a>
				</div>
				{#if dashboard.decks.length}
					<ul class="deck-list">
						{#each dashboard.decks as deck (deck.id)}
							<li class:empty-deck={deck.required === 0}>
								{#if deck.required > 0}<DeckAvailabilityRing {deck} />{/if}
								<div class="deck-copy">
									<a class="deck-name" href={`/mtg/decks?deck=${encodeURIComponent(deck.id)}`}
										>{deck.name}</a
									>
									{#if deck.required > 0}
										<div class="commander-line">
											<a
												class="commander-previews"
												href={`/mtg/decks?deck=${encodeURIComponent(deck.id)}`}
												aria-label={`Open ${deck.name}`}
											>
												{#if deck.commanders.length}{#each deck.commanders as commander (commander.catalogCardId)}
														{#if commander.imageUri}<img
																src={commander.imageUri}
																alt={commander.name}
																width="32"
																height="45"
																loading="lazy"
															/>{:else}<span class="mini-card" title={commander.name}
																>{commander.name.slice(0, 1)}</span
															>{/if}
													{/each}{:else}<svg
														viewBox="0 0 24 24"
														width="26"
														height="32"
														fill="none"
														stroke="currentColor"
														stroke-width="1.5"
														aria-hidden="true"
														><path d="m12 3 9 5-9 5-9-5 9-5z M3 12l9 5 9-5 M3 16l9 5 9-5" /></svg
													>{/if}
											</a><span class="format-label">{deck.format}</span>
										</div>
										<p class="deck-status" class:missing={deck.missing > 0}>
											<i aria-hidden="true"></i>{deck.missing > 0
												? `${deck.missing.toLocaleString()} missing`
												: 'All copies owned'}
										</p>
									{:else}<span class="dashboard-note">No cards yet</span><a
											class="panel-link"
											href={`/mtg/decks?deck=${encodeURIComponent(deck.id)}`}>Start building ↗</a
										>{/if}
								</div>
							</li>
						{/each}
					</ul>
				{:else}<div class="dashboard-empty">
						<p>No decks yet.</p>
						<a href="/mtg/decks" class="btn btn-secondary btn-sm">Create a deck</a>
					</div>{/if}
			</section>
			{#if dashboard.totals.total > 0}
				<section class="analytics-panel dashboard-sets" aria-label="Set composition">
					<div class="set-overview">
						<ProportionChart label="Owned copies by set" items={setItems} />
						<div class="set-summary">
							<p><strong>{dashboard.totals.sets.toLocaleString()}</strong> sets</p>
							<small>{dashboard.totals.total.toLocaleString()} copies</small>
						</div>
					</div>
					<details class="exact-data">
						<summary>Set data</summary>
						<dl>
							{#each dashboard.sets as item}<div>
									<dt>{item.label.toUpperCase()}</dt>
									<dd>{item.quantity.toLocaleString()} · {percent.format(item.share)}</dd>
								</div>{/each}
						</dl>
					</details>
				</section>
				<section class="analytics-panel dashboard-composition" aria-label="Inventory composition">
					<div class="composition-row">
						<div class="bar-heading">
							<span>Finish</span><strong>{foilCopies.toLocaleString()} foil</strong>
						</div>
						<ProportionChart label="Owned copies by finish" items={finishItems} kind="bar" />
						<div class="bar-note">
							<span>Nonfoil {(dashboard.totals.total - foilCopies).toLocaleString()}</span><span
								>Foil {foilCopies.toLocaleString()} · {percent.format(
									foilCopies / dashboard.totals.total
								)}</span
							>
						</div>
					</div>
					<div class="composition-row">
						<div class="bar-heading">
							<span>Condition</span><strong
								>{leadingCondition?.quantity.toLocaleString()}
								{conditionLabels[leadingCondition?.label ?? 'NM']?.toLowerCase()}</strong
							>
						</div>
						<ProportionChart label="Owned copies by condition" items={conditionItems} kind="bar" />
					</div>
					<div class="composition-row">
						<div class="bar-heading">
							<span>Extra copies</span><strong
								>{extraCopies.toLocaleString()} · {percent.format(
									extraCopies / dashboard.totals.total
								)}</strong
							>
						</div>
						<ProportionChart
							label="Unique first copies and extra copies"
							kind="bar"
							items={[
								{
									label: 'First copy of each unique card',
									value: dashboard.totals.names,
									color: 'var(--color-chart-track)'
								},
								{
									label: 'Copies beyond one per unique card',
									value: extraCopies,
									color: 'var(--color-warning)'
								}
							]}
						/>
						<p class="bar-note">Copies beyond one per unique card</p>
					</div>
					<details class="exact-data">
						<summary>Inventory data</summary>
						<dl>
							{#each [...finishItems, ...conditionItems] as item}<div>
									<dt>{item.label}</dt>
									<dd>
										{item.value.toLocaleString()} · {percent.format(
											item.value / dashboard.totals.total
										)}
									</dd>
								</div>{/each}
						</dl>
					</details>
				</section>
			{/if}
			<section class="analytics-panel recent-section" aria-labelledby="recent-heading">
				<div class="section-heading">
					<h2 id="recent-heading">Recently edited</h2>
					<a class="panel-link" href="/mtg/inventory">View all <span aria-hidden="true">↗</span></a>
				</div>
				<ul class="recent-entries" class:empty={dashboard.recentEntries.length === 0}>
					{#each dashboard.recentEntries as entry}<li>
							<a href={`/mtg/inventory/${encodeURIComponent(entry.id)}`}
								><span class="recent-art"
									>{#if entry.imageUri}<img
											src={entry.imageUri}
											alt=""
											width="140"
											height="196"
											loading="lazy"
										/>{:else}<span class="no-art" aria-hidden="true"
											>{entry.setCode.toUpperCase()}</span
										>{/if}</span
								><span class="entry-heading"
									><strong>{entry.name}</strong><span class="entry-quantity"
										>{entry.quantity.toLocaleString()}×</span
									></span
								><small
									>{entry.setCode.toUpperCase()} · {finishLabels[entry.finish] ?? entry.finish} · {entry.condition}</small
								></a
							>
						</li>{:else}<li class="dashboard-note">
							Your recently edited cards will appear here.
						</li>{/each}
				</ul>
			</section>
		</div>
	{/if}
</div>

<style>
	.dashboard-totals {
		display: grid;
		grid-template-columns: 1.5fr 1fr 1fr;
		gap: 1rem;
		list-style: none;
		margin: 1.5rem 0;
		padding: 0;
	}
	.dashboard-totals a {
		display: flex;
		flex-direction: column;
		justify-content: center;
		height: 100%;
		min-height: 116px;
		gap: 0.25rem;
		padding: 1rem 1.25rem;
		border-radius: 0.75rem;
		background: var(--color-card);
		color: var(--color-text-primary);
		text-decoration: none;
	}
	.dashboard-totals a:hover {
		box-shadow: inset 0 0 0 1px var(--color-border);
	}
	.metric-label {
		color: var(--color-text-secondary);
		font-size: 0.75rem;
	}
	.dashboard-totals strong {
		font: 400 2.5rem/1.2 var(--font-display);
		font-variant-numeric: tabular-nums;
	}
	.metric-counts {
		display: flex;
		align-items: baseline;
		gap: 0.65rem;
	}
	.metric-slash {
		font: 400 1.75rem var(--font-display);
		color: var(--color-text-muted);
	}
	.dashboard-totals .unique-count {
		color: var(--color-text-muted);
		font-size: 2.125rem;
	}
	.dashboard-totals small {
		font-size: 0.6875rem;
		color: var(--color-text-muted);
	}
	.dashboard-totals .missing-note {
		color: var(--color-warning);
	}
	.dashboard-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
		grid-template-areas: 'history decks' 'sets composition' 'recent recent';
		gap: 1.25rem;
		align-items: start;
	}
	.dashboard-history {
		grid-area: history;
		position: relative;
		min-width: 0;
	}
	.dashboard-decks {
		grid-area: decks;
	}
	.dashboard-sets {
		grid-area: sets;
	}
	.dashboard-composition {
		grid-area: composition;
		display: grid;
		gap: 1.5rem;
	}
	.recent-section {
		grid-area: recent;
	}
	section {
		min-width: 0;
	}
	.section-heading {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}
	h2 {
		font: 400 1.125rem var(--font-display);
	}
	.panel-link {
		display: inline-flex;
		gap: 0.4rem;
		align-items: center;
		color: var(--color-text-secondary);
		font-size: 0.6875rem;
		text-decoration: none;
		min-height: 24px;
	}
	.panel-link:hover {
		color: var(--color-text-primary);
		text-decoration: underline;
	}
	.value-panel-header {
		position: absolute;
		top: 1.25rem;
		right: 1.5rem;
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.period-label {
		border: 1px solid var(--color-border);
		border-radius: 0.375rem;
		padding: 0.25rem 0.5rem;
		color: var(--color-text-secondary);
		font-size: 0.6875rem;
	}
	.deck-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.deck-list li {
		display: flex;
		align-items: center;
		gap: 1.25rem;
		padding: 1rem 0;
	}
	.deck-list li + li {
		border-top: 1px solid var(--color-border);
	}
	.deck-copy {
		min-width: 0;
		flex: 1;
	}
	.deck-name {
		display: block;
		font-size: 0.8125rem;
		color: var(--color-text-primary);
		overflow-wrap: anywhere;
	}
	.commander-line {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}
	.commander-previews {
		display: flex;
		align-items: center;
		gap: 3px;
		color: var(--color-text-muted);
		flex-shrink: 0;
	}
	.commander-previews img,
	.mini-card {
		width: 32px;
		height: 45px;
		object-fit: cover;
		border-radius: 3px;
	}
	.mini-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		display: grid;
		place-items: center;
	}
	.format-label {
		font-size: 0.625rem;
		color: var(--color-text-secondary);
		overflow-wrap: anywhere;
	}
	.deck-status {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-top: 0.6rem;
		color: var(--color-success);
		font-size: 0.625rem;
	}
	.deck-status.missing {
		color: var(--color-warning);
	}
	.deck-status i {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: currentColor;
		flex-shrink: 0;
	}
	.deck-list .empty-deck {
		padding: 1rem 0 0.25rem;
	}
	.empty-deck .deck-copy {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.empty-deck .deck-name {
		font-size: 0.6875rem;
	}
	.dashboard-note {
		color: var(--color-text-muted);
		font-size: 0.6875rem;
	}
	.set-overview {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-around;
		gap: 1.5rem;
	}
	.set-summary {
		color: var(--color-text-secondary);
		font-size: 0.8125rem;
	}
	.set-summary strong {
		font: 400 2.5rem var(--font-display);
		color: var(--color-text-primary);
	}
	.set-summary small {
		display: block;
		font-size: 0.6875rem;
		margin-top: 0.5rem;
		color: var(--color-text-muted);
	}
	.bar-heading,
	.bar-note {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.bar-heading {
		font-size: 0.75rem;
		margin-bottom: 0.5rem;
		color: var(--color-text-secondary);
	}
	.bar-heading strong {
		font-weight: 400;
		color: var(--color-text-primary);
	}
	.bar-note {
		font-size: 0.625rem;
		color: var(--color-text-muted);
		margin-top: 0.4rem;
	}
	.exact-data {
		font-size: 0.6875rem;
		color: var(--color-text-secondary);
	}
	.dashboard-sets .exact-data {
		margin-top: 1rem;
	}
	summary {
		cursor: pointer;
		width: fit-content;
	}
	dl {
		margin-top: 0.75rem;
		display: grid;
		gap: 0.5rem;
	}
	dl div {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
	}
	.recent-entries {
		list-style: none;
		display: grid;
		grid-template-columns: repeat(8, minmax(0, 1fr));
		gap: 1rem;
		padding: 0;
		margin: 0;
	}
	.recent-entries.empty {
		display: block;
	}
	.recent-entries a {
		display: block;
		color: var(--color-text-primary);
		text-decoration: none;
	}
	.recent-art {
		display: block;
		aspect-ratio: 5/7;
		background: var(--color-surface);
		border-radius: 0.5rem;
		overflow: hidden;
	}
	.recent-art img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	.no-art {
		height: 100%;
		display: grid;
		place-items: center;
		color: var(--color-text-muted);
	}
	.entry-heading {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		margin-top: 0.6rem;
	}
	.entry-heading strong {
		font-size: 0.6875rem;
		font-weight: 500;
		overflow-wrap: anywhere;
	}
	.entry-quantity {
		flex-shrink: 0;
		color: var(--color-text-muted);
		font-size: 0.625rem;
	}
	.recent-entries small {
		display: block;
		margin-top: 0.35rem;
		color: var(--color-text-muted);
		font-size: 0.5625rem;
		overflow-wrap: anywhere;
	}
	.dashboard-empty {
		padding: 1.5rem 0;
		display: grid;
		gap: 1rem;
		color: var(--color-text-secondary);
	}
	@media (max-width: 1000px) {
		.dashboard-grid {
			grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
		}
		.deck-list li {
			gap: 0.75rem;
		}
		.set-overview {
			gap: 1rem;
		}
		.recent-entries {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
		.value-panel-header .period-label {
			display: none;
		}
	}
	@media (max-width: 760px) {
		.dashboard-grid {
			grid-template-columns: minmax(0, 1fr);
			grid-template-areas: 'history' 'decks' 'sets' 'composition' 'recent';
		}
		.dashboard-totals {
			grid-template-columns: 1fr 1fr;
			gap: 0.75rem;
		}
		.dashboard-totals li:first-child {
			grid-column: 1/-1;
		}
		.dashboard-totals a {
			min-height: 96px;
			padding: 0.875rem 1rem;
		}
		.dashboard-totals strong {
			font-size: 2.125rem;
		}
		.dashboard-totals .unique-count {
			font-size: 1.875rem;
		}
		.value-panel-header {
			position: static;
			justify-content: flex-end;
			margin-bottom: 0.75rem;
		}
		.deck-list li {
			gap: 1.25rem;
		}
		.set-overview {
			justify-content: space-around;
		}
	}
	@media (max-width: 420px) {
		.recent-entries {
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 0.75rem;
		}
		.dashboard-totals small {
			font-size: 0.625rem;
		}
	}
</style>
