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
							<a
								class="deck-name"
								title={deck.name}
								href={`/mtg/decks?deck=${encodeURIComponent(deck.id)}`}>{deck.name}</a
							>
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
												width="112"
												height="156"
												loading="lazy"
											/>
										{:else}
											<span class="art-placeholder" title={commander.name}>Art unavailable</span>
										{/if}
									{/each}
								{:else}
									<span class="art-placeholder" title="No Commander preview"
										><i class="ms ms-commander" aria-hidden="true"></i><span>No preview</span></span
									>
								{/if}
							</a>
							<div class="deck-status">
								<span class="format-label"
									><i
										class={`ms ms-${deck.format.toLowerCase() === 'commander' ? 'commander' : 'deck'}`}
										aria-hidden="true"
									></i>{deck.format}</span
								>
								{#if deck.required > 0}
									<div
										class="availability"
										style:--deck-count-size={`${Math.min(
											18,
											64 /
												Math.max(
													(deck.exact + deck.alternate).toLocaleString().length,
													deck.required.toLocaleString().length
												)
										)}px`}
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
		container-type: inline-size;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		padding: 24px 18px;
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
		container: deck-grid / inline-size;
		min-height: 0;
		padding: 3px;
	}
	.deck-scroll:focus-visible,
	a:focus-visible {
		outline: 2px solid var(--color-text-primary);
		outline-offset: 2px;
	}
	.deck-list {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 10px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.deck-list > li {
		min-width: 0;
		padding: 8px;
		border: 1px solid var(--color-border);
		border-radius: 6px;
	}
	.deck-heading {
		min-width: 0;
		margin-bottom: 12px;
	}
	.deck-name {
		min-width: 0;
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		height: 2.6em;
		overflow: hidden;
		overflow-wrap: anywhere;
		color: var(--color-text-primary);
		font: 400 18px/1.3 var(--font-display);
	}
	.format-label {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		flex: 0 1 auto;
		padding: 2px 6px;
		border: 1px solid var(--color-border);
		border-radius: 4px;
		font-size: 11px;
	}
	.format-label .ms {
		font-size: 14px;
	}
	.format-label,
	.dashboard-note {
		color: var(--color-text-secondary);
		overflow-wrap: anywhere;
	}
	.deck-content {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 4px;
	}
	.commander-previews {
		display: flex;
		align-items: flex-start;
		isolation: isolate;
		min-width: 0;
		max-width: 100%;
	}
	.commander-previews img,
	.art-placeholder {
		box-sizing: border-box;
		flex: 0 0 112px;
		width: 112px;
		height: 156px;
		border-radius: 4px;
	}
	.commander-previews > :first-child {
		z-index: 1;
	}
	.commander-previews > :nth-child(2) {
		margin-left: -96px;
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
	.deck-status {
		display: flex;
		flex: 0 0 88px;
		min-width: 0;
		flex-direction: column;
		align-items: center;
		gap: 8px;
	}
	.availability {
		width: 88px;
		min-width: 0;
	}
	.availability :global(.proportion-ring) {
		width: 88px;
		height: 88px;
	}
	.availability :global(.chart-center strong) {
		margin: 0;
		font-size: var(--deck-count-size);
		white-space: nowrap;
		max-width: 48px;
	}
	.availability :global(.chart-center strong span) {
		display: block;
	}
	.availability :global(.proportion-ring:has(.native-chart-data)) {
		height: auto;
	}
	.availability :global(.proportion-ring:has(.native-chart-data) svg),
	.availability :global(.proportion-ring:has(.native-chart-data) .chart-center) {
		height: 88px;
	}
	.art-placeholder i {
		font-size: 24px;
	}
	.empty-deck {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}
	@container deck-grid (min-width: 486px) {
		.deck-list {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@container deck-grid (min-width: 734px) {
		.deck-list {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
	@container deck-grid (min-width: 982px) {
		.deck-list {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
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
