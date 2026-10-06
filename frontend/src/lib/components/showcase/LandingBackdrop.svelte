<script lang="ts">
	import { showcaseAsset } from '#lib/showcase/assets.ts';
	import type { Snippet } from 'svelte';
	import { otherTCGCards, showcaseCards, showcasePacks } from '#lib/showcase/cards.ts';

	let {
		action,
		notice,
		deck
	}: {
		action: Snippet;
		notice: Snippet;
		deck?: Snippet;
	} = $props();

	const cardTile = (card: { slug: string; width: number; height: number }) => ({
		filename: `${card.slug}.webp`,
		width: card.width,
		height: card.height,
		pack: false
	});
	const wallCards = showcaseCards.map(cardTile);
	const otherCards = otherTCGCards.map(cardTile);
	const [magicPack, pokemonPack, yugiohPack, digimonPack] = showcasePacks.map((pack) => ({
		...cardTile(pack),
		pack: true
	}));
	const wallTiles = [
		wallCards[4],
		otherCards[0],
		magicPack,
		wallCards[2],
		otherCards[3],
		wallCards[1],
		otherCards[6],
		otherCards[4],
		wallCards[0],
		pokemonPack,
		wallCards[6],
		yugiohPack,
		wallCards[5],
		otherCards[2],
		digimonPack,
		wallCards[8],
		otherCards[7],
		wallCards[3],
		otherCards[5],
		magicPack,
		otherCards[0],
		wallCards[9],
		pokemonPack,
		wallCards[7],
		wallCards[10],
		otherCards[6],
		wallCards[11],
		otherCards[1],
		yugiohPack,
		wallCards[1],
		digimonPack,
		otherCards[3],
		wallCards[0],
		otherCards[2],
		magicPack,
		wallCards[6]
	];
</script>

<section class="landing-backdrop" aria-labelledby="backdrop-heading">
	<div class="artwork" aria-hidden="true">
		<div class="card-wall">
			{#each wallTiles as card, index (index)}
				<img
					src={showcaseAsset(card.filename)}
					alt=""
					width={card.width}
					height={card.height}
					class="wall-card"
					class:wall-pack={card.pack}
					style:--card-order={index}
					fetchpriority={index === 1 ? 'high' : 'auto'}
				/>
			{/each}
		</div>
	</div>
	<div class="entry">
		<h1 id="backdrop-heading" class="sr-only">Spellbook</h1>
		<div class="entry-action">{@render action()}</div>
		{@render notice()}
	</div>
	{#if deck}
		<div class="deck-entry">{@render deck()}</div>
	{/if}
</section>

<style>
	.landing-backdrop {
		flex: 1;
		position: relative;
		isolation: isolate;
		display: grid;
		grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
		align-items: center;
		min-height: 620px;
		padding: 3.5rem 0 0.5rem;
		column-gap: 2.5rem;
	}
	.artwork {
		position: absolute;
		z-index: -1;
		inset: -1rem calc(-1 * var(--backdrop-inset, 2rem)) 0;
		overflow: hidden;
		pointer-events: none;
		mask-image:
			linear-gradient(to bottom, transparent, black 8%, black 80%, transparent),
			linear-gradient(to right, transparent, black 6%, black 94%, transparent);
		mask-composite: intersect;
	}
	.artwork::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(
			90deg,
			color-mix(in srgb, var(--color-background) 95%, transparent) 4%,
			color-mix(in srgb, var(--color-background) 88%, transparent) 24%,
			color-mix(in srgb, var(--color-background) 40%, transparent) 48%,
			transparent 67%
		);
	}
	.card-wall {
		position: absolute;
		right: 0;
		top: calc(50% - var(--tile-width) * 0.65);
		--tile-width: clamp(100px, 11.5vw, 142px);
		display: grid;
		grid-template-columns: repeat(6, var(--tile-width));
		gap: clamp(10px, 1.25vw, 20px);
		transform: translateY(-50%) rotate(14deg);
		transform-origin: 50% 50%;
	}
	.wall-card {
		display: block;
		width: var(--tile-width);
		height: calc(var(--tile-width) * 614 / 440);
		aspect-ratio: 440 / 614;
		object-fit: contain;
		border-radius: 0.75rem;
		box-shadow: 0 14px 28px #0003;
		animation: card-reveal 700ms ease both;
		animation-delay: calc(var(--card-order) * 45ms);
	}
	.wall-card:nth-child(6n + 1) {
		translate: 0 calc(var(--tile-width) * 0.6);
	}
	.wall-card:nth-child(6n + 2) {
		translate: 0 calc(var(--tile-width) * 0.4);
	}
	.wall-card:nth-child(6n + 3) {
		translate: 0 calc(var(--tile-width) * 0.2);
	}
	.wall-pack {
		padding: 0.25rem;
		border-radius: 0;
		box-shadow: none;
		filter: drop-shadow(0 8px 10px #0003);
	}
	.entry {
		position: relative;
		z-index: 1;
		grid-column: 1;
		grid-row: 1;
		align-self: center;
		min-width: 0;
	}
	.entry-action {
		margin-top: 0;
	}
	.entry-action :global(.search-action) {
		margin-top: 0;
	}
	.deck-entry {
		position: relative;
		z-index: 1;
		grid-column: 2;
		grid-row: 1;
		justify-self: end;
		align-self: end;
		width: min(100%, var(--landing-deck-width, 324px));
	}
	@media (min-width: 1600px) {
		.card-wall {
			--tile-width: clamp(142px, calc(12vw - 50px), 280px);
		}
	}
	@keyframes card-reveal {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	@media (max-width: 1000px) {
		.landing-backdrop {
			min-height: 620px;
			padding: 3.5rem 0 1.5rem;
			column-gap: 1.5rem;
		}
	}
	@media (max-width: 700px) {
		.landing-backdrop {
			grid-template-columns: minmax(0, 1fr);
			min-height: 530px;
			align-items: start;
			padding: 1.5rem 0 1rem;
		}
		.entry {
			max-width: 100%;
			align-self: start;
			padding-top: 0;
		}
		.deck-entry {
			grid-column: 1;
			grid-row: 2;
			justify-self: end;
			width: min(100%, 300px);
			margin: 2rem 0 0;
		}
		.artwork {
			inset: 6rem calc(-1 * var(--backdrop-inset, 0.75rem)) 0;
			mask-image: linear-gradient(to bottom, transparent, black 12%, black 84%, transparent);
		}
		.artwork::after {
			background: linear-gradient(
				to bottom,
				var(--color-background),
				color-mix(in srgb, var(--color-background) 50%, transparent) 12%,
				transparent 35%
			);
		}
		.card-wall {
			--tile-width: clamp(72px, 16vw, 108px);
			top: 50%;
			right: -14%;
			gap: 0.5rem;
			transform: translateY(-50%) rotate(12deg);
		}
		.wall-card {
			border-radius: 0.375rem;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.wall-card {
			animation: none;
		}
	}
</style>
