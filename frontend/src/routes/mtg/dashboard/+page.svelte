<script lang="ts">
	import ValueSummary from '#lib/components/valuation/ValueSummary.svelte';
	import InventoryValueHistory from '#lib/components/valuation/InventoryValueHistory.svelte';
	import SavedStateStatus from '#lib/saved-state/SavedStateStatus.svelte';
	import { onMount, untrack } from 'svelte';
	import { workspaceSavedState } from '#lib/saved-state/workspace.svelte.ts';
	import { readSavedJSON } from '#lib/saved-state/read.ts';
	import type { ResourceSubscription } from '#lib/saved-state/workspace.ts';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
	let retrying = $state(false);
	let dashboard = $state(untrack(() => data.dashboard));
	let loadError = $state(untrack(() => data.loadError));
	let subscription: ResourceSubscription | undefined = $state();
	onMount(() => {
		subscription = workspaceSavedState.subscribe({
			topics: ['inventory', 'decks', 'scan', 'values'],
			clear: () => {
				dashboard = null;
				loadError = '';
			},
			refresh: async (lease) => {
				const current = await readSavedJSON<NonNullable<typeof dashboard>>(
					'/api/account/dashboard',
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
	const setScale = $derived(Math.max(1, otherSets, ...topSets.map((set) => set.quantity)));
	const percent = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 });
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
	<header class="dashboard-header">
		<div class="page-title"><h1>Dashboard</h1></div>
		<div class="dashboard-actions">
			<a href="/mtg/history" class="btn btn-secondary btn-sm">Inventory history</a>
			<a href="/mtg/search" class="btn btn-primary btn-sm">Add cards</a>
		</div>
	</header>
	{#if loadError}
		<div class="dashboard-empty" role="alert">
			<p>{loadError}</p>
			<button class="btn btn-secondary btn-sm" onclick={retry} disabled={retrying}
				>{retrying ? 'Loading...' : 'Try again'}</button
			>
		</div>
	{:else if dashboard}
		<div class="my-5 grid gap-4 lg:grid-cols-[1fr_2fr]">
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
		<dl class="dashboard-totals">
			<div class="owned-total">
				<dd>{dashboard.totals.total.toLocaleString()}</dd>
				<dt>Cards owned</dt>
			</div>
			{#each [{ label: 'Card names', value: dashboard.totals.names }, { label: 'Printings', value: dashboard.totals.printings }, { label: 'Sets', value: dashboard.totals.sets }] as stat}<div
				>
					<dd>{stat.value.toLocaleString()}</dd>
					<dt>{stat.label}</dt>
				</div>{/each}
		</dl>
		{#if dashboard.totals.total === 0}
			<div class="dashboard-empty">
				<p>Your inventory is empty. Add cards from Search.</p>
				<a href="/mtg/search" class="btn btn-primary btn-sm">Add cards</a>
			</div>
		{/if}
		<div class="dashboard-overview" class:empty-inventory={dashboard.totals.total === 0}>
			<section aria-labelledby="decks-heading">
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
									<div class="deck-required">{deck.required.toLocaleString()} required</div>
									<div class="composition-bar" aria-hidden="true">
										<span class="exact" style:width={`${(deck.exact / deck.required) * 100}%`}
										></span><span
											class="alternate"
											style:width={`${(deck.alternate / deck.required) * 100}%`}
										></span><span
											class="missing"
											style:width={`${(deck.missing / deck.required) * 100}%`}
										></span>
									</div>
									<dl class="deck-values">
										<div class="exact">
											<dt><span class="legend-mark"></span>Exact</dt>
											<dd>{deck.exact.toLocaleString()}</dd>
										</div>
										<div class="alternate">
											<dt><span class="legend-mark"></span>Alternate</dt>
											<dd>{deck.alternate.toLocaleString()}</dd>
										</div>
										<div class="missing">
											<dt><span class="legend-mark"></span>Missing</dt>
											<dd>{deck.missing.toLocaleString()}</dd>
										</div>
									</dl>
								{:else}<p class="dashboard-note empty-deck">No cards yet.</p>{/if}
							</li>{/each}
					</ul>
				{:else}<p class="dashboard-note">No decks yet.</p>
					<a href="/mtg/decks" class="btn btn-secondary btn-sm">Create a deck</a>{/if}
			</section>
			{#if dashboard.totals.total > 0}
				<section aria-labelledby="sets-heading">
					<div class="section-heading">
						<h2 id="sets-heading">Sets</h2>
						<span class="unit-label">Copies · Share</span>
					</div>
					<dl
						class="set-distribution"
						style:--set-count-width={`${Math.max(3, setScale.toLocaleString().length)}ch`}
					>
						{#each topSets as set}<div>
								<dt>{set.label.toUpperCase()}</dt>
								<dd>
									<span class="set-bar" aria-hidden="true"
										><span style:width={`${(set.quantity / setScale) * 100}%`}></span></span
									><span>{set.quantity.toLocaleString()}</span><span class="set-share"
										>{percent.format(set.share)}</span
									>
								</dd>
							</div>{/each}
						{#if otherSets > 0}<div class="other-sets">
								<dt>Other sets <small>{otherSetCount.toLocaleString()} sets</small></dt>
								<dd>
									<span class="set-bar" aria-hidden="true"
										><span style:width={`${(otherSets / setScale) * 100}%`}></span></span
									><span>{otherSets.toLocaleString()}</span><span class="set-share"
										>{percent.format(otherSets / dashboard.totals.total)}</span
									>
								</dd>
							</div>{/if}
					</dl>
				</section>
			{/if}
		</div>
		{#if dashboard.totals.total > 0}
			<div class="inventory-profile">
				<section aria-labelledby="finish-heading">
					<div class="section-heading">
						<h2 id="finish-heading">Finish</h2>
						<span class="unit-label">{dashboard.totals.foils.toLocaleString()} foil copies</span>
					</div>
					<div class="composition-bar" aria-hidden="true">
						{#each dashboard.finishes as finish}<span
								data-finish={finish.label}
								style:width={`${finish.share * 100}%`}
							></span>{/each}
					</div>
					<dl class="profile-values">
						{#each dashboard.finishes as finish}<div data-finish={finish.label}>
								<dt>
									<span class="legend-mark"></span>{finishLabels[finish.label] ?? finish.label}
								</dt>
								<dd>
									{finish.quantity.toLocaleString()} <span>{percent.format(finish.share)}</span>
								</dd>
							</div>{/each}
					</dl>
				</section>
				<section aria-labelledby="condition-heading">
					<h2 id="condition-heading">Condition</h2>
					<div class="composition-bar" aria-hidden="true">
						{#each dashboard.conditions as condition}<span
								data-condition={condition.label}
								style:width={`${condition.share * 100}%`}
							></span>{/each}
					</div>
					<dl class="profile-values condition-values">
						{#each dashboard.conditions as condition}<div data-condition={condition.label}>
								<dt>
									<span class="legend-mark"></span><span
										>{conditionLabels[condition.label] ?? condition.label}</span
									>
								</dt>
								<dd>
									{condition.quantity.toLocaleString()}
									<span>{percent.format(condition.share)}</span>
								</dd>
							</div>{/each}
					</dl>
				</section>
			</div>
		{:else}<p class="dashboard-note">{dashboard.totals.foils.toLocaleString()} foil copies</p>{/if}
		<section class="recent-section" aria-labelledby="recent-heading">
			<div class="section-heading">
				<h2 id="recent-heading">Recently edited inventory</h2>
				<a href="/mtg/inventory">Open inventory</a>
			</div>
			<ul class="recent-entries">
				{#each dashboard.recentEntries as entry}<li>
						<a href={`/mtg/search?q=${encodeURIComponent(entry.name)}`}>
							{#if entry.imageUri}<img
									src={entry.imageUri}
									alt=""
									width="34"
									height="48"
									loading="lazy"
								/>{/if}<span class="entry-info"
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
	.dashboard-header,
	.dashboard-actions,
	.section-heading,
	.deck-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	.dashboard-actions {
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.dashboard-totals {
		display: grid;
		grid-template-columns: 1.35fr repeat(3, 1fr);
		align-items: end;
		gap: 1.5rem;
		margin: 1.5rem 0 2rem;
	}
	dd {
		font-variant-numeric: tabular-nums;
	}
	.dashboard-totals dd {
		font-size: 1.5rem;
		line-height: 1.3;
	}
	.dashboard-totals .owned-total dd {
		font-size: 2.5rem;
	}
	.dashboard-totals dt,
	.dashboard-note,
	.unit-label,
	small,
	.deck-required,
	.deck-heading span {
		color: var(--color-text-secondary);
		font-size: 0.75rem;
	}
	h2 {
		font-family: var(--font-display);
		font-size: 1.35rem;
		font-weight: 400;
		margin-bottom: 1rem;
	}
	h2 span {
		margin-left: 0.5rem;
		font: 0.875rem var(--font-body);
		color: var(--color-text-secondary);
	}
	.dashboard-overview {
		display: grid;
		grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
		gap: 3rem;
	}
	.dashboard-overview.empty-inventory {
		grid-template-columns: 1fr;
	}
	section {
		min-width: 0;
	}
	.section-heading {
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}
	.section-heading h2 {
		margin-bottom: 0;
	}
	.section-heading a {
		font-size: 0.75rem;
	}
	.dashboard-note {
		line-height: 1.7;
		margin-bottom: 1rem;
	}
	.deck-list,
	.recent-entries {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.deck-list li + li {
		margin-top: 1.25rem;
		padding-top: 1.25rem;
		border-top: 1px solid var(--color-border);
	}
	.deck-heading {
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0.4rem 0.75rem;
	}
	.deck-heading a {
		font-size: 0.875rem;
		overflow-wrap: anywhere;
	}
	.deck-required {
		margin: 0.4rem 0 0.75rem;
	}
	.composition-bar {
		display: flex;
		width: 100%;
		height: 12px;
		overflow: hidden;
		border-radius: 3px;
	}
	.composition-bar > span {
		height: 100%;
		background: var(--segment-color);
	}
	.exact {
		--segment-color: var(--color-success);
	}
	.alternate,
	[data-finish='foil'] {
		--segment-color: var(--color-violet);
	}
	.missing {
		--segment-color: var(--color-warning);
	}
	.composition-bar .missing,
	.missing .legend-mark {
		background-image: repeating-linear-gradient(
			135deg,
			transparent 0 3px,
			var(--color-background) 3px 4px
		);
	}
	[data-finish='nonfoil'] {
		--segment-color: var(--color-text-muted);
	}
	[data-condition='NM'] {
		--segment-color: var(--color-success);
	}
	[data-condition='LP'] {
		--segment-color: var(--color-info);
	}
	[data-condition='MP'] {
		--segment-color: var(--color-warning);
	}
	[data-condition='HP'] {
		--segment-color: var(--color-violet);
	}
	[data-condition='DMG'] {
		--segment-color: var(--color-error);
	}
	.deck-values {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.5rem;
		margin-top: 0.6rem;
		font-size: 0.75rem;
	}
	.deck-values dt,
	.profile-values dt {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		color: var(--color-text-secondary);
	}
	.condition-values dt {
		align-items: baseline;
		overflow-wrap: anywhere;
	}
	.deck-values dd {
		margin-top: 0.35rem;
		font-size: 1rem;
	}
	.legend-mark {
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 1px;
		background: var(--segment-color);
		flex-shrink: 0;
	}
	.empty-deck {
		margin: 0.5rem 0 0;
	}
	.set-distribution {
		font-size: 0.8rem;
	}
	.set-distribution > div {
		display: grid;
		grid-template-columns: 7rem minmax(0, 1fr);
		align-items: center;
		gap: 1rem;
		min-height: 32px;
	}
	.set-distribution dt {
		overflow-wrap: anywhere;
	}
	.set-distribution dd {
		display: grid;
		grid-template-columns: minmax(0, 1fr) var(--set-count-width) 4rem;
		align-items: center;
		gap: 0.75rem;
		text-align: right;
	}
	.set-bar {
		height: 12px;
	}
	.set-bar > span {
		display: block;
		height: 100%;
		background: var(--color-info);
		border-radius: 2px;
	}
	.set-share {
		color: var(--color-text-secondary);
		font-size: 0.75rem;
	}
	.set-distribution .other-sets {
		margin-top: 0.4rem;
		padding-top: 0.6rem;
		border-top: 1px solid var(--color-border);
	}
	.other-sets small {
		display: block;
		margin-top: 0.2rem;
	}
	.other-sets .set-bar > span {
		background: var(--color-text-muted);
	}
	.inventory-profile {
		display: grid;
		grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
		gap: 3rem;
		margin-top: 2rem;
	}
	.profile-values {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem 2rem;
		margin-top: 0.75rem;
		font-size: 0.75rem;
	}
	.profile-values dd {
		margin-top: 0.35rem;
	}
	.profile-values dd span {
		margin-left: 0.5rem;
		color: var(--color-text-secondary);
	}
	.condition-values {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 0.75rem;
	}
	.recent-section {
		margin-top: 2rem;
	}
	.recent-entries {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0 3rem;
	}
	.recent-entries a {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.6rem 0;
		text-decoration: none;
		color: var(--color-text-primary);
	}
	.recent-entries a:hover strong {
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.recent-entries img {
		object-fit: cover;
		border-radius: 3px;
		flex-shrink: 0;
	}
	.entry-info {
		min-width: 0;
	}
	.recent-entries strong {
		display: block;
		font-size: 0.8rem;
		font-weight: 400;
		overflow-wrap: anywhere;
	}
	.recent-entries small {
		display: block;
		margin-top: 0.25rem;
	}
	.entry-quantity {
		margin-left: auto;
		font-size: 0.8rem;
		flex-shrink: 0;
	}
	.dashboard-empty {
		padding: 1rem 0 2rem;
		font-size: 0.85rem;
		line-height: 1.8;
	}
	.dashboard-empty p {
		max-width: 45rem;
		margin-bottom: 1rem;
	}
	@media (max-width: 900px) {
		.dashboard-overview,
		.inventory-profile {
			grid-template-columns: 1fr;
			gap: 2rem;
		}
		.recent-entries {
			gap: 0 1.5rem;
		}
	}
	@media (max-width: 600px) {
		.dashboard-header {
			align-items: flex-start;
			flex-direction: column;
		}
		.dashboard-totals {
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 1rem;
		}
		.dashboard-totals .owned-total {
			grid-column: 1/-1;
		}
		.dashboard-totals .owned-total dd {
			font-size: 2.25rem;
		}
		.recent-entries {
			grid-template-columns: 1fr;
		}
		.set-distribution > div {
			grid-template-columns: 5.5rem minmax(0, 1fr);
			gap: 0.5rem;
		}
		.set-distribution dd {
			grid-template-columns: minmax(0, 1fr) var(--set-count-width) 3.5rem;
			gap: 0.5rem;
		}
		.condition-values {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
	@media (max-width: 360px) {
		.condition-values {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
