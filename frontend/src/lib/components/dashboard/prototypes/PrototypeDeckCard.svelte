<script lang="ts">
	import type { DashboardDeck } from '@spellbook/contracts/dashboard.ts';
	import DeckAvailabilityRing from './PrototypeAvailability.svelte';
	let {
		deck,
		scale = 'standard',
		appearance = 'panel'
	}: {
		deck: DashboardDeck;
		scale?: 'standard' | 'featured';
		appearance?: 'panel' | 'plain';
	} = $props();
</script>

<article
	class="prototype-deck-card"
	class:featured={scale === 'featured'}
	class:plain={appearance === 'plain'}
>
	<a class="deck-title" href={`/mtg/decks?deck=${encodeURIComponent(deck.id)}`}>{deck.name}</a>
	{#if deck.required > 0}<div class="deck-visuals">
			<a
				class="commander"
				href={`/mtg/decks?deck=${encodeURIComponent(deck.id)}`}
				aria-label={`Open ${deck.name}`}
			>
				{#if deck.commanders[0]?.imageUri}<img
						src={deck.commanders[0].imageUri}
						alt={deck.commanders[0].name}
						width="128"
						height="179"
						loading="lazy"
					/>{:else}<span class="commander-placeholder" title="No commander assigned"
						><svg
							viewBox="0 0 24 24"
							width="32"
							height="32"
							fill="none"
							stroke="currentColor"
							stroke-width="1.2"
							aria-hidden="true"
							><path d="m12 3 9 5-9 5-9-5 9-5z M3 12l9 5 9-5 M3 16l9 5 9-5" /></svg
						></span
					>{/if}
			</a>
			<div class="availability">
				<DeckAvailabilityRing {deck} /><span class="deck-status" class:missing={deck.missing > 0}
					>{deck.missing ? `${deck.missing.toLocaleString()} missing` : 'All copies owned'}</span
				>
			</div>
		</div>
	{:else}<a class="empty-deck" href={`/mtg/decks?deck=${encodeURIComponent(deck.id)}`}
			><span aria-hidden="true">+</span>Start building</a
		>{/if}
</article>

<style>
	.prototype-deck-card {
		padding: 1.25rem;
		border: 1px solid color-mix(in srgb, var(--color-border) 45%, transparent);
		border-radius: 0.75rem;
		background: var(--color-card);
		min-width: 0;
	}
	.plain {
		padding: 0.5rem 0;
		border: 0;
		background: transparent;
	}
	.deck-title {
		display: block;
		font: 500 0.875rem/1.4 var(--font-interface);
		color: var(--color-text-primary);
		text-decoration: none;
		margin-bottom: 1rem;
		overflow-wrap: anywhere;
	}
	.deck-title:hover {
		text-decoration: underline;
	}
	.deck-visuals {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
	}
	.commander {
		display: block;
		flex: 0 1 104px;
		min-width: 72px;
		width: 104px;
		aspect-ratio: 5/7;
	}
	.commander img,
	.commander-placeholder {
		display: flex;
		width: 100%;
		height: 100%;
		object-fit: contain;
		border-radius: 8px;
	}
	.commander-placeholder {
		align-items: center;
		justify-content: center;
		border: 1px solid var(--color-border);
		background: var(--color-surface);
		color: var(--color-text-muted);
	}
	.availability {
		display: grid;
		justify-items: center;
		gap: 0.75rem;
		min-width: 0;
	}
	.deck-status {
		font: 400 0.6875rem var(--font-interface);
		color: var(--color-success);
	}
	.deck-status.missing {
		color: var(--color-warning);
	}
	.featured .commander {
		width: 144px;
		flex-basis: 144px;
	}
	.featured .deck-title {
		font-size: 1rem;
	}
	.empty-deck {
		display: grid;
		place-content: center;
		justify-items: center;
		gap: 0.75rem;
		min-height: 144px;
		color: var(--color-text-muted);
		font: 0.75rem var(--font-interface);
		text-decoration: none;
	}
	.empty-deck span {
		font-size: 2rem;
	}
	.empty-deck:hover {
		color: var(--color-text-primary);
	}
	@media (max-width: 480px) {
		.prototype-deck-card {
			padding: 1rem;
		}
		.commander {
			width: 104px;
		}
	}
</style>
