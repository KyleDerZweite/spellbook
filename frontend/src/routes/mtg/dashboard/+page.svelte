<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
	let retrying = $state(false);
	const dashboard = $derived(data.dashboard);
	const finishLabels: Record<string, string> = { nonfoil: 'Nonfoil', foil: 'Foil' };
	const conditionLabels: Record<string, string> = {
		NM: 'Near mint',
		LP: 'Lightly played',
		MP: 'Moderately played',
		HP: 'Heavily played',
		DMG: 'Damaged'
	};
	const topSets = $derived(dashboard?.sets.slice(0, 8) ?? []);
	const otherSets = $derived(
		dashboard?.sets.slice(8).reduce((sum, set) => sum + set.quantity, 0) ?? 0
	);
	async function retry() {
		retrying = true;
		try {
			await invalidateAll();
		} finally {
			retrying = false;
		}
	}
</script>

<svelte:head
	><title>Dashboard | Spellbook</title><meta name="robots" content="noindex" /></svelte:head
>

<div class="workspace-container dashboard-page">
	<header class="dashboard-header">
		<div class="page-title"><h1>Dashboard</h1></div>
		<div class="dashboard-actions">
			<a href="/mtg/search" class="btn btn-primary">Add cards</a><a
				href="/mtg/scan"
				class="btn btn-secondary">Upload photo</a
			>
		</div>
	</header>
	{#if data.loadError}
		<div class="dashboard-empty" role="alert">
			<p>{data.loadError}</p>
			<button class="btn btn-secondary" onclick={retry} disabled={retrying}
				>{retrying ? 'Loading...' : 'Try again'}</button
			>
		</div>
	{:else if dashboard}
		<dl class="dashboard-totals">
			{#each [{ label: 'Cards owned', value: dashboard.totals.total }, { label: 'Card names', value: dashboard.totals.names }, { label: 'Printings', value: dashboard.totals.printings }, { label: 'Sets', value: dashboard.totals.sets }, { label: 'Foil copies', value: dashboard.totals.foils }, { label: 'Decks', value: dashboard.totals.decks }] as stat}
				<div>
					<dd>{stat.value.toLocaleString()}</dd>
					<dt>{stat.label}</dt>
				</div>
			{/each}
		</dl>
		{#if dashboard.totals.total === 0}
			<div class="dashboard-empty">
				<p>Your inventory is empty. Add cards from Search or upload a photo for review.</p>
				<a href="/mtg/search" class="btn btn-primary">Add cards</a>
			</div>
		{:else}
			<div class="distribution-grid">
				<section aria-labelledby="sets-heading">
					<h2 id="sets-heading">Sets</h2>
					<dl class="distribution-list">
						{#each topSets as set}<div>
								<dt>{set.label.toUpperCase()}</dt>
								<dd>{set.quantity.toLocaleString()} <span>copies</span></dd>
								<progress
									max={dashboard.totals.total}
									value={set.quantity}
									aria-label={`${set.label.toUpperCase()}: ${set.quantity} copies`}
								></progress>
							</div>{/each}
						{#if otherSets}<div>
								<dt>Other sets</dt>
								<dd>{otherSets.toLocaleString()} <span>copies</span></dd>
								<progress
									max={dashboard.totals.total}
									value={otherSets}
									aria-label={`Other sets: ${otherSets} copies`}
								></progress>
							</div>{/if}
					</dl>
				</section>
				<section aria-labelledby="finish-heading">
					<h2 id="finish-heading">Finish</h2>
					<dl class="distribution-list">
						{#each dashboard.finishes as finish}<div>
								<dt>{finishLabels[finish.label] ?? finish.label}</dt>
								<dd>{finish.quantity.toLocaleString()} <span>copies</span></dd>
								<progress
									max={dashboard.totals.total}
									value={finish.quantity}
									aria-label={`${finishLabels[finish.label] ?? finish.label}: ${finish.quantity} copies`}
								></progress>
							</div>{/each}
					</dl>
				</section>
				<section aria-labelledby="condition-heading">
					<h2 id="condition-heading">Condition</h2>
					<dl class="distribution-list">
						{#each dashboard.conditions as condition}<div>
								<dt>{conditionLabels[condition.label] ?? condition.label}</dt>
								<dd>{condition.quantity.toLocaleString()} <span>copies</span></dd>
								<progress
									max={dashboard.totals.total}
									value={condition.quantity}
									aria-label={`${conditionLabels[condition.label] ?? condition.label}: ${condition.quantity} copies`}
								></progress>
							</div>{/each}
					</dl>
				</section>
			</div>
		{/if}
		<div class="dashboard-columns">
			<section aria-labelledby="decks-heading">
				<div class="section-heading">
					<h2 id="decks-heading">Deck availability</h2>
					<a href="/mtg/decks">Open decks</a>
				</div>
				{#if dashboard.decks.length}
					<p class="dashboard-note">
						Each deck compares against your full inventory independently.
					</p>
					<!-- svelte-ignore a11y_no_noninteractive_tabindex (The scroll region must be reachable for keyboard scrolling.) -->
					<div class="table-scroll" tabindex="0" role="region" aria-label="Deck availability">
						<table>
							<thead
								><tr
									><th scope="col">Deck</th><th scope="col">Required</th><th scope="col">Exact</th
									><th scope="col">Alternate</th><th scope="col">Missing</th></tr
								></thead
							><tbody
								>{#each dashboard.decks as deck}<tr
										><th scope="row"
											><a href={`/mtg/decks?deck=${encodeURIComponent(deck.id)}`}>{deck.name}</a
											><small>{deck.format}</small></th
										><td>{deck.required}</td><td>{deck.exact}</td><td>{deck.alternate}</td><td
											>{deck.missing}</td
										></tr
									>{/each}</tbody
							>
						</table>
					</div>
				{:else}<p class="dashboard-note">No decks yet.</p>
					<a href="/mtg/decks" class="btn btn-secondary">Create a deck</a>{/if}
			</section>
			<section aria-labelledby="recent-heading">
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
									/>{/if}<span
									><strong>{entry.name}</strong><small
										>{entry.setCode.toUpperCase()} · {finishLabels[entry.finish] ?? entry.finish} · {entry.condition}</small
									></span
								><span class="entry-quantity">{entry.quantity}×</span>
							</a>
						</li>{:else}<li class="dashboard-note">No inventory entries yet.</li>{/each}
				</ul>
			</section>
		</div>
		<div class="scan-summary">
			<a href="/mtg/scan">Scan review</a><span
				>{dashboard.pendingScanReviews === null
					? 'Review count unavailable. Open Scan to review your sessions.'
					: `${dashboard.pendingScanReviews.toLocaleString()} ${dashboard.pendingScanReviews === 1 ? 'session' : 'sessions'} pending review`}</span
			>
		</div>
	{/if}
</div>

<style>
	.dashboard-header,
	.dashboard-actions,
	.section-heading {
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
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: 1rem;
		margin: 2rem 0 2.5rem;
	}
	.dashboard-totals dd {
		font-size: clamp(1.65rem, 2vw, 2.4rem);
		font-variant-numeric: tabular-nums;
		line-height: 1.3;
	}
	.dashboard-totals dt,
	.dashboard-note,
	.distribution-list dd span,
	small,
	.scan-summary span {
		color: var(--color-text-secondary);
		font-size: 0.75rem;
	}
	h2 {
		font-family: var(--font-display);
		font-size: 1.35rem;
		font-weight: 400;
		margin-bottom: 1rem;
	}
	.distribution-grid {
		display: grid;
		grid-template-columns: 1.25fr 1fr 1fr;
		gap: 3rem;
		padding-bottom: 2.5rem;
	}
	.distribution-list > div {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.35rem 1rem;
		margin-bottom: 1rem;
		font-size: 0.8rem;
	}
	.distribution-list dt {
		overflow-wrap: anywhere;
	}
	.distribution-list dd {
		font-variant-numeric: tabular-nums;
	}
	progress {
		grid-column: 1 / -1;
		appearance: none;
		width: 100%;
		height: 4px;
		border: 0;
		border-radius: 2px;
		overflow: hidden;
		background: var(--color-muted);
		color: var(--color-text-muted);
	}
	progress::-webkit-progress-bar {
		background: var(--color-muted);
	}
	progress::-webkit-progress-value {
		background: var(--color-text-muted);
	}
	progress::-moz-progress-bar {
		background: var(--color-text-muted);
	}
	.dashboard-columns {
		display: grid;
		grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
		gap: 3rem;
	}
	.dashboard-columns section {
		min-width: 0;
	}
	.section-heading {
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.section-heading h2 {
		margin-bottom: 0.5rem;
	}
	.section-heading a,
	.scan-summary a {
		font-size: 0.75rem;
	}
	.dashboard-note {
		line-height: 1.7;
		margin-bottom: 1rem;
	}
	.table-scroll {
		overflow-x: auto;
	}
	table {
		border-collapse: collapse;
		width: 100%;
		font-size: 0.75rem;
	}
	th,
	td {
		text-align: right;
		padding: 0.9rem 0.65rem;
		border-bottom: 1px solid var(--color-border);
		font-variant-numeric: tabular-nums;
	}
	th:first-child {
		text-align: left;
		padding-left: 0;
	}
	thead th {
		font-weight: 400;
		color: var(--color-text-secondary);
	}
	tbody th {
		font-weight: 400;
		min-width: 10rem;
		max-width: 24rem;
		overflow-wrap: anywhere;
	}
	tbody th small {
		display: block;
		margin-top: 0.25rem;
	}
	.recent-entries {
		list-style: none;
		margin: 0;
		padding: 0;
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
	.scan-summary {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		margin-top: 2rem;
		padding-top: 1.5rem;
		border-top: 1px solid var(--color-border);
	}
	.dashboard-empty {
		padding: 2rem 0;
		font-size: 0.85rem;
		line-height: 1.8;
	}
	.dashboard-empty p {
		max-width: 45rem;
		margin-bottom: 1rem;
	}
	@media (max-width: 1000px) {
		.dashboard-totals {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
		.distribution-grid {
			gap: 1.5rem;
		}
		.dashboard-columns {
			grid-template-columns: 1fr;
			gap: 2rem;
		}
	}
	@media (max-width: 600px) {
		.dashboard-header {
			align-items: flex-start;
			flex-direction: column;
		}
		.distribution-grid {
			grid-template-columns: 1fr;
			gap: 1rem;
		}
		.dashboard-totals {
			gap: 1.5rem 0.75rem;
		}
		.dashboard-totals dt {
			font-size: 0.65rem;
		}
	}
</style>
