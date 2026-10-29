<script lang="ts">
	import WorkspaceHeader from '#lib/components/layout/WorkspaceHeader.svelte';
	import DistributionChart from '#lib/components/charts/DistributionChart.svelte';
	import StackedBar from '#lib/components/charts/StackedBar.svelte';
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
	const topSets = $derived(dashboard?.sets.slice(0, 8) ?? []);
	const otherSetCount = $derived(Math.max(0, (dashboard?.sets.length ?? 0) - 8));
	const otherSets = $derived(
		dashboard?.sets.slice(8).reduce((sum, set) => sum + set.quantity, 0) ?? 0
	);
	const setItems = $derived([
		...topSets.map((set) => ({
			label: set.label.toUpperCase(),
			value: set.quantity,
			share: set.share
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
		{#snippet actions()}<a href="/mtg/history" class="btn btn-secondary btn-sm">Inventory history</a
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
		<dl class="dashboard-totals">
			{#each [{ label: 'Cards owned', value: dashboard.totals.total }, { label: 'Card names', value: dashboard.totals.names }, { label: 'Printings', value: dashboard.totals.printings }, { label: 'Sets', value: dashboard.totals.sets }] as stat}
				<div>
					<dt>{stat.label}</dt>
					<dd>{stat.value.toLocaleString()}</dd>
				</div>
			{/each}
		</dl>
		<div class="value-overview">
			<ValueSummary
				estimate={dashboard.inventoryValue?.estimate ?? null}
				evaluatedAt={dashboard.inventoryValue?.evaluatedAt}
				error={dashboard.valuationError?.message}
			/>
			<InventoryValueHistory
				history={dashboard.inventoryValueHistory}
				error={dashboard.valuationError?.message}
				compact
				onRetry={() => subscription?.invalidate()}
			/>
		</div>
		{#if dashboard.totals.total === 0}
			<div class="dashboard-empty">
				<p>Your inventory is empty. Add cards from Search.</p>
				<a href="/mtg/search" class="btn btn-primary btn-sm">Add cards</a>
			</div>
		{/if}
		<div class="dashboard-overview">
			<section class="analytics-panel" aria-labelledby="decks-heading">
				<div class="section-heading">
					<h2 id="decks-heading">
						Deck availability <span>{dashboard.totals.decks.toLocaleString()}</span>
					</h2>
					<a href="/mtg/decks">Open decks</a>
				</div>
				{#if dashboard.decks.length}
					<p class="dashboard-note">
						Each deck compares against your full inventory independently.
					</p>
					<ul class="deck-list">
						{#each dashboard.decks as deck}<li>
								<div class="deck-heading">
									<a href={`/mtg/decks?deck=${encodeURIComponent(deck.id)}`}>{deck.name}</a><span
										>{deck.format}</span
									>
								</div>
								{#if deck.required > 0}
									<p class="deck-required">{deck.required.toLocaleString()} required</p>
									<StackedBar
										label={`${deck.name} availability`}
										segments={[
											{ label: 'Exact', value: deck.exact, color: 'var(--color-success)' },
											{ label: 'Alternate', value: deck.alternate, color: 'var(--color-violet)' },
											{ label: 'Missing', value: deck.missing, color: 'var(--color-warning)' }
										]}
									/>
									<dl class="deck-values">
										{#each [{ label: 'Exact', value: deck.exact, color: 'var(--color-success)' }, { label: 'Alternate', value: deck.alternate, color: 'var(--color-violet)' }, { label: 'Missing', value: deck.missing, color: 'var(--color-warning)' }] as part}<div
											>
												<dt><span style:background={part.color}></span>{part.label}</dt>
												<dd>{part.value.toLocaleString()}</dd>
											</div>{/each}
									</dl>
								{:else}<p class="dashboard-note">No cards yet.</p>{/if}
							</li>{/each}
					</ul>
				{:else}<p class="dashboard-note">No decks yet.</p>
					<a href="/mtg/decks" class="btn btn-secondary btn-sm">Create a deck</a>{/if}
			</section>
			{#if dashboard.totals.total > 0}
				<section class="analytics-panel" aria-labelledby="sets-heading">
					<div class="section-heading">
						<h2 id="sets-heading">Sets</h2>
						<span class="unit-label">Copies · Share</span>
					</div>
					<DistributionChart label="Owned copies by set" items={setItems} />
				</section>
			{/if}
		</div>
		{#if dashboard.totals.total > 0}
			<div class="inventory-profile">
				<section class="analytics-panel" aria-labelledby="finish-heading">
					<div class="section-heading">
						<h2 id="finish-heading">Finish</h2>
						<span class="unit-label">{dashboard.totals.foils.toLocaleString()} foil copies</span>
					</div>
					<DistributionChart
						label="Owned copies by finish"
						items={dashboard.finishes.map((item) => ({
							label: finishLabels[item.label] ?? item.label,
							value: item.quantity,
							share: item.share,
							color: item.label === 'foil' ? 'var(--color-violet)' : 'var(--color-chart-primary)'
						}))}
					/>
				</section>
				<section class="analytics-panel" aria-labelledby="condition-heading">
					<div class="section-heading"><h2 id="condition-heading">Condition</h2></div>
					<DistributionChart
						label="Owned copies by condition"
						items={dashboard.conditions.map((item) => ({
							label: conditionLabels[item.label] ?? item.label,
							value: item.quantity,
							share: item.share
						}))}
					/>
				</section>
			</div>
		{/if}
		<section class="recent-section" aria-labelledby="recent-heading">
			<div class="section-heading">
				<h2 id="recent-heading">Recently edited inventory</h2>
				<a href="/mtg/inventory">Open inventory</a>
			</div>
			<ul class="recent-entries">
				{#each dashboard.recentEntries as entry}<li>
						<a href={`/mtg/inventory/${encodeURIComponent(entry.id)}`}>
							{#if entry.imageUri}<img
									src={entry.imageUri}
									alt=""
									width="64"
									height="90"
									loading="lazy"
								/>{/if}
							<span class="entry-info"
								><strong>{entry.name}</strong><small
									>{entry.setCode.toUpperCase()} · {finishLabels[entry.finish] ?? entry.finish} · {entry.condition}</small
								></span
							><span class="entry-quantity">{entry.quantity.toLocaleString()}×</span>
						</a>
					</li>{:else}<li class="dashboard-note">No inventory entries yet.</li>{/each}
			</ul>
		</section>
	{/if}
</div>

<style>
	.dashboard-totals {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 1rem;
		margin: 2.5rem 0;
	}
	.dashboard-totals dt {
		color: var(--color-text-secondary);
		font-size: 0.75rem;
	}
	.dashboard-totals dd {
		font-family: var(--font-display);
		font-size: clamp(2rem, 3vw, 3rem);
		font-variant-numeric: tabular-nums;
		margin-top: 0.5rem;
		line-height: 1.2;
	}
	.value-overview {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
		gap: 1.5rem;
		margin-bottom: 2rem;
	}
	.dashboard-overview,
	.inventory-profile {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 1.5rem;
		margin-bottom: 1.5rem;
	}
	section {
		min-width: 0;
	}
	.section-heading,
	.deck-heading {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.section-heading {
		margin-bottom: 1.25rem;
	}
	h2 {
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: 400;
	}
	h2 span {
		margin-left: 0.5rem;
		color: var(--color-text-muted);
		font: 0.75rem var(--font-body);
	}
	.section-heading a,
	.unit-label,
	.dashboard-note,
	.deck-heading span,
	.deck-required {
		font-size: 0.7rem;
		color: var(--color-text-secondary);
	}
	.dashboard-note {
		line-height: 1.8;
		margin-bottom: 1.25rem;
	}
	.deck-list,
	.recent-entries {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.deck-list li + li {
		margin-top: 1.5rem;
		padding-top: 1.5rem;
		border-top: 1px solid var(--color-border);
	}
	.deck-heading a {
		font-size: 0.8rem;
		overflow-wrap: anywhere;
	}
	.deck-required {
		margin: 0.5rem 0 0.75rem;
	}
	.deck-values {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.5rem;
		margin-top: 0.75rem;
	}
	.deck-values dt {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		color: var(--color-text-secondary);
		font-size: 0.65rem;
	}
	.deck-values dt span {
		width: 6px;
		height: 6px;
		border-radius: 50%;
	}
	.deck-values dd {
		font-variant-numeric: tabular-nums;
		font-size: 1rem;
		margin-top: 0.25rem;
	}
	.recent-section {
		margin-top: 2.5rem;
	}
	.recent-entries {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.5rem 2rem;
	}
	.recent-entries a {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem;
		border-radius: 0.75rem;
		color: var(--color-text-primary);
		text-decoration: none;
	}
	.recent-entries a:hover,
	.recent-entries a:focus-visible {
		background: var(--color-surface);
	}
	.recent-entries img {
		object-fit: contain;
		border-radius: 5px;
		flex-shrink: 0;
	}
	.entry-info {
		min-width: 0;
	}
	.recent-entries strong {
		display: block;
		font-size: 0.8rem;
		font-weight: 500;
		overflow-wrap: anywhere;
	}
	small {
		display: block;
		margin-top: 0.5rem;
		color: var(--color-text-secondary);
		font-size: 0.65rem;
	}
	.entry-quantity {
		margin-left: auto;
		flex-shrink: 0;
		font-size: 0.8rem;
	}
	.dashboard-empty {
		padding: 2rem 0;
		font-size: 0.85rem;
		line-height: 1.8;
	}
	.dashboard-empty p {
		margin-bottom: 1rem;
	}
	@media (max-width: 900px) {
		.value-overview,
		.dashboard-overview,
		.inventory-profile {
			grid-template-columns: 1fr;
		}
	}
	@media (max-width: 600px) {
		.dashboard-totals {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 1.5rem;
			margin: 2rem 0;
		}
		.recent-entries {
			grid-template-columns: 1fr;
		}
		.recent-entries a {
			padding-inline: 0;
		}
	}
</style>
