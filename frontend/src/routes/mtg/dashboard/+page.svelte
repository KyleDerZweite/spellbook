<script lang="ts">
	import WorkspaceHeader from '#lib/components/layout/WorkspaceHeader.svelte';
	import DistributionChart from '#lib/components/charts/DistributionChart.svelte';
	import CompositionRing from '#lib/components/charts/CompositionRing.svelte';
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

	const percent = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 });
	const zeroConditions = $derived(
		dashboard?.conditions.filter((item) => item.quantity === 0) ?? []
	);
	const populatedConditions = $derived(
		dashboard?.conditions.filter((item) => item.quantity > 0) ?? []
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
			{#each [{ label: 'Cards owned', value: dashboard.totals.total, note: `${dashboard.totals.printings.toLocaleString()} printings`, href: '/mtg/inventory', color: 'var(--color-info)', path: 'M5 8h14v12H5z M8 4h11v12 M9 12h6 M9 16h4' }, { label: 'Card names', value: dashboard.totals.names, note: 'Unique cards in your inventory', href: '/mtg/inventory', color: 'var(--color-violet)', path: 'M5 4h14v16H5z M8 8h8 M8 12h8 M8 16h4' }, { label: 'Sets', value: dashboard.totals.sets, note: 'Represented in your inventory', href: '/mtg/inventory', color: 'var(--color-warning)', path: 'M4 5h16v15H4z M4 10h16 M9 5v15' }, { label: 'Decks', value: dashboard.totals.decks, note: 'Compare with your inventory', href: '/mtg/decks', color: 'var(--color-success)', path: 'm12 3 9 5-9 5-9-5 9-5z M3 12l9 5 9-5 M3 16l9 5 9-5' }] as stat}
				<li>
					<a href={stat.href} style:--metric-color={stat.color}
						><span class="metric-icon" aria-hidden="true"
							><svg
								viewBox="0 0 24 24"
								width="18"
								height="18"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linejoin="round"><path d={stat.path} /></svg
							></span
						><span class="metric-label">{stat.label}</span><strong
							>{stat.value.toLocaleString()}</strong
						><small>{stat.note}</small></a
					>
				</li>
			{/each}
		</ul>
		{#if dashboard.totals.total === 0}<div class="dashboard-empty">
				<p>Your inventory is empty. Add your first cards to start building your collection.</p>
				<a href="/mtg/search" class="btn btn-primary btn-sm">Find cards</a>
			</div>{/if}
		<div class="dashboard-grid">
			<div class="dashboard-main">
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
				{#if dashboard.totals.total > 0}
					<section class="analytics-panel dashboard-sets" aria-labelledby="sets-heading">
						<div class="section-heading">
							<h2 id="sets-heading">Sets</h2>
							<span class="unit-label">Copies · Share</span>
						</div>
						<DistributionChart label="Owned copies by set" items={setItems} />
					</section>
				{/if}
			</div>
			<div class="dashboard-side">
				<section class="analytics-panel dashboard-decks" aria-labelledby="decks-heading">
					<div class="section-heading">
						<h2 id="decks-heading">Deck availability</h2>
						<a class="panel-link" href="/mtg/decks">View decks <span aria-hidden="true">↗</span></a>
					</div>
					{#if dashboard.decks.length}
						<ul class="deck-list">
							{#each dashboard.decks as deck}
								{@const segments = [
									{ label: 'Exact', value: deck.exact, color: 'var(--color-success)' },
									{ label: 'Alternate', value: deck.alternate, color: 'var(--color-violet)' },
									{ label: 'Missing', value: deck.missing, color: 'var(--color-warning)' }
								]}
								<li>
									<div class="deck-heading">
										<a href={`/mtg/decks?deck=${encodeURIComponent(deck.id)}`}>{deck.name}</a><span
											class="format-label"
											class:commander-role={deck.format.toLowerCase() === 'commander'}
											>{deck.format}</span
										>
									</div>
									{#if deck.required > 0}<p class="deck-required">
											<strong>{deck.exact.toLocaleString()}</strong> / {deck.required.toLocaleString()}
											exact matches
										</p>
										<StackedBar label={`${deck.name} availability`} {segments} />
										<dl class="deck-values">
											{#each segments as part}<div>
													<dt><span style:background={part.color}></span>{part.label}</dt>
													<dd>{part.value.toLocaleString()}</dd>
												</div>{/each}
										</dl>
									{:else}<p class="dashboard-note empty-deck">
											No cards yet. <a href={`/mtg/decks?deck=${encodeURIComponent(deck.id)}`}
												>Start building <span aria-hidden="true">↗</span></a
											>
										</p>{/if}
								</li>
							{/each}
						</ul>
						<p class="dashboard-note availability-note">
							Each deck uses your full inventory independently.
						</p>
					{:else}<div class="dashboard-empty">
							<p>No decks yet.</p>
							<a href="/mtg/decks" class="btn btn-secondary btn-sm">Create a deck</a>
						</div>{/if}
				</section>
				{#if dashboard.totals.total > 0}
					<section
						class="analytics-panel dashboard-composition"
						aria-labelledby="composition-heading"
					>
						<div class="section-heading">
							<h2 id="composition-heading">Finish &amp; condition</h2>
							<span class="unit-label">{dashboard.totals.foils.toLocaleString()} foil copies</span>
						</div>
						<CompositionRing
							label="Owned copies by finish"
							items={dashboard.finishes.map((item) => ({
								label: finishLabels[item.label] ?? item.label,
								value: item.quantity,
								share: item.share,
								color: item.label === 'foil' ? 'var(--color-violet)' : 'var(--color-chart-primary)'
							}))}
						/>
						<div class="condition-breakdown" role="group" aria-label="Owned copies by condition">
							<dl>
								{#each populatedConditions as item}<div>
										<dt>
											<span class="condition-mark"></span>{conditionLabels[item.label] ??
												item.label}
										</dt>
										<dd>
											{item.quantity.toLocaleString()} <span>{percent.format(item.share)}</span>
										</dd>
									</div>{/each}
							</dl>
							{#if zeroConditions.length}<details class="zero-conditions">
									<summary>{zeroConditions.length} conditions with no copies</summary>
									<dl>
										{#each zeroConditions as item}<div>
												<dt>{conditionLabels[item.label] ?? item.label}</dt>
												<dd>0 <span>{percent.format(item.share)}</span></dd>
											</div>{/each}
									</dl>
								</details>{/if}
						</div>
					</section>
				{/if}
			</div>
			<section class="analytics-panel recent-section" aria-labelledby="recent-heading">
				<div class="section-heading">
					<h2 id="recent-heading">Recently edited inventory</h2>
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
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 1rem;
		list-style: none;
		margin: 1.5rem 0;
		padding: 0;
	}
	.dashboard-totals a {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 32px;
		align-items: center;
		gap: 0.3rem 0.5rem;
		height: 100%;
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
		grid-row: 1;
		grid-column: 1;
		color: var(--color-text-secondary);
		font-size: 0.75rem;
	}
	.metric-icon {
		grid-row: 1/3;
		grid-column: 2;
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border-radius: 0.5rem;
		background: color-mix(in srgb, var(--metric-color) 12%, transparent);
		color: var(--metric-color);
	}
	.dashboard-totals strong {
		min-width: 0;
		overflow-wrap: anywhere;
		font: 400 2rem/1.2 var(--font-display);
		font-variant-numeric: tabular-nums;
	}
	.dashboard-totals small {
		grid-column: 1/-1;
		color: var(--color-text-muted);
		font-size: 0.6875rem;
		margin-top: 0.25rem;
	}
	.dashboard-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
		grid-template-areas: 'main side' 'recent recent';
		gap: 1.25rem;
		align-items: start;
	}
	.dashboard-main {
		grid-area: main;
	}
	.dashboard-side {
		grid-area: side;
	}
	.dashboard-main,
	.dashboard-side {
		display: grid;
		gap: 1.25rem;
		min-width: 0;
	}
	.dashboard-history {
		position: relative;
		min-width: 0;
	}
	.recent-section {
		grid-area: recent;
	}
	.dashboard-grid :global(.analytics-panel) {
		box-shadow: 0 1px 3px #00000008;
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
		margin-bottom: 1rem;
	}
	h2 {
		font: 400 1.125rem var(--font-display);
	}
	.panel-link {
		display: inline-flex;
		gap: 0.4rem;
		align-items: center;
		flex-shrink: 0;
		color: var(--color-text-secondary);
		font-size: 0.6875rem;
		text-decoration: none;
		min-height: 24px;
	}
	.panel-link:hover {
		color: var(--color-text-primary);
		text-decoration: underline;
	}
	.panel-link span {
		font-size: 0.875rem;
	}
	.unit-label,
	.dashboard-note,
	.format-label {
		font-size: 0.6875rem;
		color: var(--color-text-secondary);
	}
	.value-panel-header {
		position: absolute;
		top: 1.25rem;
		right: 1.5rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
	}
	.period-label {
		border: 1px solid var(--color-border);
		border-radius: 0.375rem;
		padding: 0.25rem 0.5rem;
		color: var(--color-text-secondary);
		font-size: 0.6875rem;
	}
	.dashboard-note {
		line-height: 1.7;
	}
	.deck-list,
	.recent-entries {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.deck-list li + li {
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid var(--color-border);
	}
	.deck-heading a {
		color: var(--color-text-primary);
		font-size: 0.8125rem;
		font-weight: 500;
		overflow-wrap: anywhere;
	}
	.format-label {
		font-size: 0.625rem;
	}
	.deck-required {
		margin: 0.5rem 0 0.75rem;
		font-size: 0.6875rem;
		color: var(--color-text-secondary);
	}
	.deck-required strong {
		font-weight: 500;
		color: var(--color-text-primary);
	}
	.deck-values {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		margin-top: 0.65rem;
	}
	.deck-values > div {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.deck-values dt {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		color: var(--color-text-muted);
		font-size: 0.625rem;
	}
	.deck-values dt span {
		width: 5px;
		height: 5px;
		border-radius: 50%;
	}
	.deck-values dd {
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
	}
	.empty-deck {
		margin-top: 0.5rem;
	}
	.empty-deck a {
		white-space: nowrap;
	}
	.availability-note {
		font-size: 0.625rem;
		margin-top: 1.25rem;
		color: var(--color-text-muted);
	}
	.condition-breakdown {
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid var(--color-border);
	}
	.condition-breakdown dl > div {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		align-items: center;
		min-height: 28px;
		font-size: 0.6875rem;
	}
	.condition-breakdown dt {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.condition-breakdown dd {
		font-variant-numeric: tabular-nums;
	}
	.condition-breakdown dd span {
		display: inline-block;
		width: 3.5rem;
		text-align: right;
		color: var(--color-text-muted);
	}
	.condition-mark {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--color-chart-primary);
	}
	.zero-conditions {
		margin-top: 0.5rem;
		color: var(--color-text-muted);
		font-size: 0.6875rem;
	}
	summary {
		cursor: pointer;
		min-height: 24px;
	}
	.recent-entries {
		display: grid;
		grid-template-columns: repeat(8, minmax(0, 1fr));
		gap: 1rem;
	}
	.recent-entries.empty {
		display: block;
	}
	.recent-entries a {
		display: block;
		height: 100%;
		color: var(--color-text-primary);
		text-decoration: none;
		border-radius: 0.375rem;
	}
	.recent-entries a:hover strong {
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.recent-art {
		display: block;
		aspect-ratio: 5/7;
		max-width: 160px;
		margin-bottom: 0.75rem;
	}
	.recent-art img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
		border-radius: 6px;
		box-shadow: 0 3px 8px #00000018;
	}
	.no-art {
		display: grid;
		place-items: center;
		width: 100%;
		height: 100%;
		border-radius: 6px;
		background: var(--color-surface);
		color: var(--color-text-muted);
	}
	.entry-heading {
		display: flex;
		align-items: baseline;
		gap: 0.35rem;
	}
	.entry-heading strong {
		min-width: 0;
		font-size: 0.6875rem;
		line-height: 1.6;
		font-weight: 500;
		overflow-wrap: anywhere;
	}
	.entry-quantity {
		flex-shrink: 0;
		margin-left: auto;
		font-size: 0.625rem;
		color: var(--color-text-secondary);
	}
	.recent-entries small {
		display: block;
		margin-top: 0.25rem;
		color: var(--color-text-muted);
		font-size: 0.625rem;
		line-height: 1.6;
		overflow-wrap: anywhere;
	}
	.dashboard-empty {
		padding: 1.5rem 0;
		font-size: 0.8125rem;
		line-height: 1.8;
	}
	.dashboard-empty p {
		margin-bottom: 1rem;
	}
	@media (max-width: 1100px) {
		.dashboard-totals {
			gap: 0.75rem;
		}
		.dashboard-totals a {
			padding: 1rem;
		}
		.metric-icon {
			display: none;
		}
		.dashboard-totals a {
			grid-template-columns: 1fr;
		}
		.recent-entries {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
		.recent-art {
			max-width: 180px;
		}
	}
	@media (max-width: 900px) {
		.dashboard-grid {
			grid-template-columns: 1fr;
			grid-template-areas: 'main' 'side' 'recent';
		}
		.dashboard-totals {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.metric-icon {
			display: grid;
		}
		.dashboard-totals a {
			grid-template-columns: minmax(0, 1fr) 32px;
		}
	}
	@media (max-width: 480px) {
		.value-panel-header {
			position: static;
			justify-content: flex-end;
			margin-bottom: 0.75rem;
		}

		.dashboard-totals {
			gap: 0.625rem;
		}
		.dashboard-totals a {
			padding: 0.875rem;
			grid-template-columns: 1fr;
		}
		.metric-icon {
			display: none;
		}
		.dashboard-totals strong {
			font-size: 1.875rem;
		}
		.dashboard-totals small {
			font-size: 0.625rem;
		}
		.recent-entries {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 1rem;
		}
		.deck-values > div {
			gap: 0.25rem;
		}
	}
</style>
