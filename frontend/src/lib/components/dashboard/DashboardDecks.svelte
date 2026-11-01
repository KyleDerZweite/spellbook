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
					<li>
						<div class="deck-heading">
							<a class="deck-name" href={`/mtg/decks?deck=${encodeURIComponent(deck.id)}`}
								>{deck.name}</a
							>
							<span class="format-label">{deck.format}</span>
						</div>
						<div class="deck-content">
							<a
								class="commander-previews"
								href={`/mtg/decks?deck=${encodeURIComponent(deck.id)}`}
								aria-label={`Open ${deck.name}`}
							>
								{#if deck.commanders.length}
									{#each deck.commanders.slice(0, 2) as commander (commander.catalogCardId)}
										{#if commander.imageUri}
											<img
												src={commander.imageUri}
												alt={commander.name}
												width="64"
												height="89"
												loading="lazy"
											/>
										{:else}
											<span class="art-placeholder" title={commander.name}>Art unavailable</span>
										{/if}
									{/each}
								{:else}
									<span class="art-placeholder">No Commander preview</span>
								{/if}
							</a>
							{#if deck.required > 0}
								<div
									class="availability"
									style:--deck-count-size={deck.required >= 100000
										? '0.75rem'
										: deck.required >= 10000
											? '0.875rem'
											: '1.125rem'}
								>
									<DeckAvailabilityRing {deck} />
								</div>
							{:else}
								<div class="empty-deck">
									<span class="dashboard-note">No cards yet</span><a
										class="panel-link"
										href={`/mtg/decks?deck=${encodeURIComponent(deck.id)}`}>Start building ↗</a
									>
								</div>
							{/if}
						</div>
						{#if deck.required > 0}
							<dl class="availability-counts">
								<div class="exact">
									<dt><i aria-hidden="true"></i>Exact</dt>
									<dd>{deck.exact.toLocaleString()}</dd>
								</div>
								<div class="alternate">
									<dt><i aria-hidden="true"></i>Alternate</dt>
									<dd>{deck.alternate.toLocaleString()}</dd>
								</div>
								<div class="missing">
									<dt><i aria-hidden="true"></i>Missing</dt>
									<dd>{deck.missing.toLocaleString()}</dd>
								</div>
							</dl>
						{/if}
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
		margin-bottom: 20px;
	}
	h2 {
		margin: 0;
		font: 400 20px/1.3 var(--font-display);
	}
	.panel-link {
		color: var(--color-text-secondary);
	}
	.panel-link:hover,
	.deck-name:hover {
		text-decoration: underline;
	}
	.deck-scroll {
		min-height: 0;
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
		padding: 18px 0;
	}
	.deck-list > li:first-child {
		padding-top: 0;
	}
	.deck-list > li + li {
		border-top: 1px solid var(--color-border);
	}
	.deck-heading {
		margin-bottom: 12px;
	}
	.deck-name {
		display: block;
		overflow-wrap: anywhere;
		color: var(--color-text-primary);
		font: 400 18px/1.3 var(--font-display);
	}
	.format-label {
		display: block;
		margin-top: 4px;
	}
	.format-label,
	.dashboard-note {
		color: var(--color-text-secondary);
		overflow-wrap: anywhere;
	}
	.deck-content {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.commander-previews {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		min-width: 0;
		max-width: 100%;
	}
	.commander-previews img,
	.art-placeholder {
		box-sizing: border-box;
		flex: 0 0 64px;
		width: 64px;
		height: 89px;
		border-radius: 4px;
	}
	.commander-previews img {
		object-fit: contain;
	}
	.art-placeholder {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 4px;
		padding: 5px;
		border: 1px solid var(--color-border);
		background: var(--color-card);
		color: var(--color-text-secondary);
		font-size: 10px;
		text-align: center;
		overflow-wrap: anywhere;
	}
	.availability {
		flex: 0 0 104px;
		min-width: 0;
	}
	.availability :global(.proportion-ring) {
		width: 104px;
		height: 104px;
	}
	.availability :global(.chart-center strong) {
		font-size: var(--deck-count-size);
		overflow-wrap: anywhere;
		max-width: 68px;
	}
	.availability :global(.chart-center strong span) {
		display: block;
	}
	.availability :global(.proportion-ring:has(.native-chart-data)) {
		height: auto;
	}
	.availability :global(.proportion-ring:has(.native-chart-data) svg),
	.availability :global(.proportion-ring:has(.native-chart-data) .chart-center) {
		height: 104px;
	}
	.availability-counts {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 16px;
		margin: 12px 0 0;
		font-size: 12px;
	}
	.availability-counts > div {
		min-width: 0;
	}
	.availability-counts dt {
		display: flex;
		align-items: center;
		gap: 5px;
		color: var(--color-text-secondary);
	}
	.availability-counts dd {
		margin: 2px 0 0 11px;
		font-variant-numeric: tabular-nums;
		overflow-wrap: anywhere;
	}
	.availability-counts i {
		width: 6px;
		height: 6px;
		flex: 0 0 6px;
		border-radius: 50%;
	}
	.exact i {
		background: var(--color-success);
	}
	.alternate i {
		background: var(--color-violet);
	}
	.missing i {
		background: var(--color-warning);
	}
	.empty-deck {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}
	@media (min-width: 1150px) {
		.dashboard-decks {
			height: 480px;
		}
		.deck-scroll {
			overflow-y: auto;
			scrollbar-gutter: stable;
		}
	}
</style>
