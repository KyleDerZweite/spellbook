<script lang="ts">
	import PlusIcon from '#lib/components/ui/PlusIcon.svelte';
	import type { DashboardSummary } from '@spellbook/contracts/dashboard.ts';
	import DeckAvailabilityRing from '#lib/components/charts/DeckAvailabilityRing.svelte';
	let { dashboard }: { dashboard: DashboardSummary } = $props();
</script>

<section class="dashboard-decks dashboard-surface" aria-labelledby="decks-heading">
	<div class="section-heading">
		<h2 id="decks-heading">Your decks</h2>
		<a href="/mtg/decks" class="panel-link">View decks <span aria-hidden="true">↗</span></a>
	</div>
	{#if dashboard.decks.length}
		<!-- svelte-ignore a11y_no_noninteractive_tabindex (Native scrolling region needs keyboard access.) -->
		<div class="deck-scroll" role="region" aria-label="Your decks availability" tabindex="0">
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
														height="44"
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
		</div>
	{:else}<div class="dashboard-empty">
			<p>No decks yet.</p>
			<a href="/mtg/decks" class="btn btn-secondary btn-sm"><PlusIcon />Create a deck</a>
		</div>{/if}
</section>

<style>
	.dashboard-decks {
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		max-height: 415px;
		padding: 24px 18px;
		border: 1px solid var(--color-border);
		border-radius: 10px;
		color: var(--color-text-primary);
		font: 400 13px/1.4 var(--font-interface);
	}
	.section-heading {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: baseline;
		gap: 8px;
		margin-bottom: 24px;
	}
	h2 {
		margin: 0;
		font: 400 20px/1.3 var(--font-display);
	}
	.panel-link {
		color: var(--color-text-secondary);
	}
	.panel-link:hover {
		text-decoration: underline;
	}
	.deck-scroll {
		min-height: 0;
		overflow-y: auto;
		scrollbar-gutter: stable;
		padding: 3px;
	}
	.deck-scroll:focus-visible,
	a:focus-visible {
		outline: 2px solid var(--color-text-primary);
		outline-offset: 2px;
	}
	.deck-list {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.deck-list > li {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px 0;
	}
	.deck-list > li:first-child {
		padding-top: 0;
	}
	.deck-list > li + li {
		border-top: 1px solid var(--color-border);
	}
	.deck-list :global(.proportion-ring) {
		flex: 0 0 96px;
		width: 96px;
		height: 96px;
	}
	.deck-list :global(.proportion-ring:has(.native-chart-data)) {
		height: auto;
	}
	.deck-list :global(.proportion-ring:has(.native-chart-data) svg),
	.deck-list :global(.proportion-ring:has(.native-chart-data) .chart-center) {
		height: 96px;
	}
	.deck-copy {
		flex: 1;
		min-width: 0;
	}
	.deck-name {
		overflow-wrap: anywhere;
		color: var(--color-text-primary);
	}
	.commander-line,
	.commander-previews {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}
	.commander-line {
		margin-top: 8px;
	}
	.commander-previews img,
	.mini-card {
		flex: 0 0 32px;
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
	.dashboard-note {
		color: var(--color-text-secondary);
		overflow-wrap: anywhere;
	}
	.deck-status {
		display: flex;
		align-items: center;
		gap: 4px;
		color: var(--color-success);
		margin: 8px 0 0;
		overflow-wrap: anywhere;
	}
	.deck-status.missing {
		color: var(--color-warning);
	}
	.deck-status i {
		flex: 0 0 4px;
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
	@media (min-width: 1150px) {
		.dashboard-decks {
			height: 415px;
		}
	}
	@media (max-width: 620px) {
		.dashboard-decks {
			max-height: none;
		}
		.deck-scroll {
			overflow: visible;
			scrollbar-gutter: auto;
		}
	}
</style>
