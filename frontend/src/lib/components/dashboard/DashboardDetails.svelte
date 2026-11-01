<script lang="ts">
	import PlusIcon from '#lib/components/ui/PlusIcon.svelte';
	import type { DashboardSummary } from '@spellbook/contracts/dashboard.ts';
	import ProportionChart from '#lib/components/charts/ProportionChart.svelte';
	import DeckAvailabilityRing from '#lib/components/charts/DeckAvailabilityRing.svelte';
	let { dashboard }: { dashboard: DashboardSummary } = $props();
	const finishLabels: Record<string, string> = { nonfoil: 'Nonfoil', foil: 'Foil' };
	const conditionLabels: Record<string, string> = {
		NM: 'Near mint',
		LP: 'Lightly played',
		MP: 'Moderately played',
		HP: 'Heavily played',
		DMG: 'Damaged'
	};
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
</script>

<details class="dashboard-details">
	<summary>Deck availability and inventory details</summary>
	<div class="details-grid">
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
					<a href="/mtg/decks" class="btn btn-secondary btn-sm"><PlusIcon />Create a deck</a>
				</div>{/if}
		</section>
		{#if dashboard.totals.total > 0}<section
				class="analytics-panel dashboard-composition"
				aria-label="Inventory composition"
			>
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
			</section>{/if}
	</div>
</details>

<style>
	.dashboard-details {
		margin-top: 24px;
		color: var(--color-text-secondary);
		font-size: 12px;
	}
	.dashboard-details > summary {
		cursor: pointer;
		padding-block: 8px;
		width: fit-content;
	}
	.details-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
		gap: 16px;
		margin-top: 16px;
	}
	section {
		min-width: 0;
	}
	.section-heading {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		align-items: baseline;
		margin-bottom: 16px;
	}
	h2 {
		font: 400 20px var(--font-display);
		color: var(--color-text-primary);
	}
	.panel-link {
		font-size: 12px;
		color: var(--color-text-secondary);
	}
	.panel-link:hover {
		text-decoration: underline;
	}
	.deck-list {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.deck-list > li {
		display: flex;
		align-items: center;
		gap: 20px;
		padding: 16px 0;
	}
	.deck-list > li + li {
		border-top: 1px solid var(--color-border);
	}
	.deck-copy {
		flex: 1;
		min-width: 0;
	}
	.deck-name {
		font-size: 13px;
		overflow-wrap: anywhere;
		color: var(--color-text-primary);
	}
	.commander-line,
	.commander-previews {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.commander-line {
		margin-top: 8px;
	}
	.commander-previews img,
	.mini-card {
		width: 32px;
		height: 44px;
		object-fit: contain;
		border-radius: 4px;
	}
	.mini-card {
		display: grid;
		place-items: center;
		border: 1px solid var(--color-border);
	}
	.format-label,
	.deck-status,
	.dashboard-note {
		font-size: 11px;
	}
	.deck-status {
		display: flex;
		align-items: center;
		gap: 4px;
		color: var(--color-success);
		margin-top: 8px;
	}
	.deck-status.missing {
		color: var(--color-warning);
	}
	.deck-status i {
		width: 4px;
		height: 4px;
		border-radius: 50%;
		background: currentColor;
	}
	.empty-deck .deck-copy {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 8px;
	}
	.dashboard-composition {
		display: grid;
		gap: 24px;
		align-content: start;
	}
	.bar-heading,
	.bar-note {
		display: flex;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 8px;
	}
	.bar-heading {
		margin-bottom: 8px;
	}
	.bar-heading strong {
		font-weight: 400;
		color: var(--color-text-primary);
	}
	.bar-note {
		font-size: 11px;
		color: var(--color-text-muted);
		margin-top: 8px;
	}
	.exact-data {
		font-size: 11px;
	}
	.exact-data summary {
		cursor: pointer;
	}
	dl {
		display: grid;
		gap: 8px;
		margin-top: 12px;
	}
	dl > div {
		display: flex;
		justify-content: space-between;
		gap: 12px;
	}
	@media (max-width: 760px) {
		.details-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
