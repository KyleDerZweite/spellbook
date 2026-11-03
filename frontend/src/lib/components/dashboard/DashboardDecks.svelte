<script lang="ts">
	import PlusIcon from '#lib/components/ui/PlusIcon.svelte';
	import type { DashboardSummary } from '@spellbook/contracts/dashboard.ts';
	import OwnershipProgress from '#lib/components/decks/OwnershipProgress.svelte';
	let { dashboard }: { dashboard: DashboardSummary } = $props();
</script>

<section class="dashboard-decks dashboard-surface" aria-labelledby="decks-heading">
	<div class="section-heading">
		<h2 id="decks-heading">Your decks</h2>
		<a href="/mtg/decks">View decks ↗</a>
	</div>
	{#if dashboard.decks.length}<ul>
			{#each dashboard.decks.slice(0, 6) as deck (deck.id)}
				<li>
					<a
						class="mini-card"
						href={`/mtg/decks?deck=${encodeURIComponent(deck.id)}`}
						title={deck.name}
					>
						<div class="art">
							{#if deck.commanders[0]?.artCrop}<img
									src={deck.commanders[0].artCrop}
									alt=""
									width="80"
									height="96"
									loading="lazy"
								/>{:else}<i class="ms ms-commander" aria-hidden="true"></i>{/if}
						</div>
						<div class="details">
							<span class="deck-name">{deck.name}</span>
							<div class="meta">
								<span>{deck.format}</span><span aria-label="Commander color identity"
									>{#each ['W', 'U', 'B', 'R', 'G'].filter( (color) => deck.commanders.some( (card) => card.colorIdentity?.includes(color) ) ) as color}<i
											class={`ms ms-${color.toLowerCase()} ms-cost`}
											role="img"
											aria-label={`${color} identity`}
										></i>{/each}</span
								>
							</div>
							<OwnershipProgress {...deck} />
						</div>
					</a>
				</li>{/each}
		</ul>{:else}<p>No decks yet.</p>
		<a href="/mtg/decks" class="btn btn-secondary btn-sm"><PlusIcon />Create a deck</a>{/if}
</section>

<style>
	.dashboard-decks {
		container: deck-grid / inline-size;
		min-width: 0;
		padding: 24px 18px;
		border-radius: 10px;
	}
	.section-heading {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 12px;
		margin-bottom: 24px;
	}
	h2 {
		margin: 0;
		font: 400 20px/1.3 var(--font-display);
	}
	.section-heading a {
		font-size: 12px;
		color: var(--color-text-secondary);
	}
	ul {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 20px;
		list-style: none;
		padding: 0;
		margin: 0;
	}
	li {
		min-width: 0;
	}
	.mini-card {
		display: flex;
		gap: 12px;
		min-width: 0;
		color: var(--color-text-primary);
		text-decoration: none;
	}
	.mini-card:hover .deck-name {
		text-decoration: underline;
	}
	.mini-card:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 4px;
	}
	.art {
		display: grid;
		place-items: center;
		flex: 0 0 72px;
		height: 96px;
		overflow: hidden;
		border-radius: 5px;
		background: var(--color-card);
		color: var(--color-text-muted);
	}
	img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.details {
		flex: 1;
		min-width: 0;
	}
	.deck-name {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		min-height: 2.6rem;
		overflow: hidden;
		overflow-wrap: anywhere;
		font: 400 16px/1.3 var(--font-display);
	}
	.meta {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		margin: 5px 0 10px;
		font-size: 11px;
		color: var(--color-text-secondary);
	}
	.meta span {
		display: flex;
		gap: 3px;
	}
	@container deck-grid (min-width: 480px) {
		ul {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@container deck-grid (min-width: 760px) {
		ul {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
</style>
