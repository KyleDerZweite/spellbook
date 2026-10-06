<script lang="ts">
	import { showcaseAsset } from '#lib/showcase/assets.ts';
	import Button from '#lib/components/ui/button/Button.svelte';
	import { commanderDeck, commanderStack } from '#lib/showcase/commander-deck.ts';

	let selectedCard = $state(1);
	let deckElement: HTMLElement;
	const currentCard = $derived(commanderStack[selectedCard]);
	const colorNames: Record<string, string> = {
		W: 'White',
		U: 'Blue',
		B: 'Black',
		R: 'Red',
		G: 'Green'
	};

	function selectCard(index: number) {
		selectedCard = (index + commanderStack.length) % commanderStack.length;
	}

	function moveFocus(event: KeyboardEvent, index: number) {
		if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key))
			return;
		event.preventDefault();
		selectCard(
			event.key === 'Home'
				? 0
				: event.key === 'End'
					? commanderStack.length - 1
					: index + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1)
		);
		deckElement.querySelectorAll<HTMLButtonElement>('[data-deck-card]')[selectedCard]?.focus();
	}
</script>

<article class="commander-deck" aria-label="Commander deck preview" bind:this={deckElement}>
	<a
		class="deck-title"
		href={commanderDeck.sourceURL}
		target="_blank"
		rel="noreferrer"
		aria-label={'View ' + commanderDeck.name + ' on Archidekt (opens in a new tab)'}
	>
		{commanderDeck.name}
	</a>
	<div class="deck-stage" role="group" aria-label="Preview deck cards">
		<div class="ground-shadow" aria-hidden="true"></div>
		<div class="deck-box">
			<div class="box-back material" aria-hidden="true"></div>
			<div class="box-floor" aria-hidden="true"></div>
			<div class="sleeve-edges" aria-hidden="true"></div>
			{#each commanderStack as card, index (card.catalogCardId)}
				<Button
					variant="ghost"
					class={card.role === 'commander'
						? 'preview-card commander-window'
						: 'preview-card seated-card'}
					data-deck-card
					data-selected={selectedCard === index}
					style={'--card-depth:' + (-49 + (index - 1) * 16) + 'px'}
					tabindex={selectedCard === index ? 0 : -1}
					aria-label={'Preview ' + card.name + (card.role === 'commander' ? ', Commander' : '')}
					aria-pressed={selectedCard === index}
					onpointerenter={(event) => {
						if (event.pointerType !== 'touch') selectCard(index);
					}}
					onfocus={() => selectCard(index)}
					onclick={() => selectCard(index)}
					onkeydown={(event) => moveFocus(event, index)}
				>
					<img
						src={showcaseAsset(card.localImage)}
						alt=""
						width={card.width}
						height={card.height}
						draggable="false"
						fetchpriority={card.role === 'commander' ? 'high' : 'auto'}
					/>
				</Button>
			{/each}
			<div class="box-left material" aria-hidden="true"></div>
			<div class="box-right material" aria-hidden="true"></div>
			<div class="box-front material" aria-hidden="true"></div>
			<div class="front-rim" aria-hidden="true"></div>
		</div>
	</div>
	<div class="card-selection">
		<Button
			variant="ghost"
			size="icon"
			class="browse-card"
			aria-label="Preview previous card"
			onclick={() => selectCard(selectedCard - 1)}
		>
			<svg
				aria-hidden="true"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"><path d="m14 6-6 6 6 6" /></svg
			>
		</Button>
		<p class="current-card" aria-live="polite" aria-atomic="true">
			<span>{currentCard.name}</span>
			<span class="card-position">{selectedCard + 1} / {commanderStack.length}</span>
		</p>
		<Button
			variant="ghost"
			size="icon"
			class="browse-card"
			aria-label="Preview next card"
			onclick={() => selectCard(selectedCard + 1)}
		>
			<svg
				aria-hidden="true"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"><path d="m10 6 6 6-6 6" /></svg
			>
		</Button>
	</div>
	<div class="deck-details">
		<div class="deck-meta">
			<span
				><span class="commander-role">{commanderDeck.format}</span> · {commanderDeck.cardCount} cards</span
			>
			<span
				class="colors"
				role="img"
				aria-label="{commanderDeck.colorIdentity
					.map((color) => colorNames[color])
					.join(' and ')} color identity"
			>
				{#each commanderDeck.colorIdentity as color (color)}
					<i class="ms ms-cost ms-{color.toLowerCase()}" aria-hidden="true"></i>
				{/each}
			</span>
		</div>
		<div class="deck-credit">
			<span class="credit">{commanderDeck.creator}</span>
			<a class="source" href={commanderDeck.sourceURL} target="_blank" rel="noreferrer"
				>Archidekt <span aria-hidden="true">↗</span></a
			>
		</div>
	</div>
</article>

<style>
	.commander-deck {
		position: relative;
		isolation: isolate;
		width: 100%;
		color: var(--color-foreground);
	}
	.commander-deck::before {
		content: '';
		position: absolute;
		z-index: -1;
		inset: -9% 0 -8%;
		pointer-events: none;
		background:
			radial-gradient(
				ellipse 52% 12% at 50% 12%,
				color-mix(in srgb, var(--color-background) 96%, transparent) 35%,
				transparent 100%
			),
			radial-gradient(
				ellipse 54% 16% at 50% 87%,
				color-mix(in srgb, var(--color-background) 96%, transparent) 35%,
				transparent 100%
			),
			radial-gradient(
				ellipse,
				var(--color-background) 23%,
				color-mix(in srgb, var(--color-background) 90%, transparent) 42%,
				transparent 72%
			);
	}
	.deck-title {
		display: block;
		max-width: 20rem;
		margin-inline: auto;
		color: inherit;
		text-align: center;
		text-decoration: none;
		font-family: var(--font-display);
		font-size: 1.2rem;
		font-weight: 400;
		line-height: 1.3;
		text-wrap: balance;
	}
	.deck-stage {
		position: relative;
		height: 365px;
		perspective: 1050px;
		perspective-origin: 50% 40%;
	}
	.deck-box {
		position: absolute;
		left: calc(50% - 89px);
		top: 112px;
		width: 178px;
		height: 234px;
		transform-style: preserve-3d;
		transform: rotateX(-18deg) rotateY(-27deg) rotateZ(-3deg);
	}
	.material {
		background-color: #242527;
		background-image:
			repeating-linear-gradient(32deg, #ffffff03 0 1px, transparent 1px 2px),
			repeating-linear-gradient(-32deg, #0000000c 0 1px, transparent 1px 2px);
		border: 1px solid #393a3c;
		box-shadow:
			inset 0 0 0 3px #191a1c,
			inset 0 0 0 4px #ffffff09;
	}
	.box-back,
	.box-front,
	.box-left,
	.box-right,
	.box-floor,
	.front-rim,
	.sleeve-edges {
		position: absolute;
		pointer-events: auto;
	}
	.box-back {
		inset: -7px 0 0;
		border-radius: 8px 8px 4px 4px;
		transform: translateZ(-63px);
		background-color: #151618;
	}
	.box-floor {
		width: 178px;
		height: 126px;
		top: 171px;
		background: #101113;
		transform: rotateX(90deg);
	}
	.box-left,
	.box-right {
		top: 0;
		width: 126px;
		height: 234px;
		border-radius: 5px;
		background-color: #1c1d1f;
	}
	.box-left {
		left: -63px;
		transform: rotateY(90deg);
	}
	.box-right {
		clip-path: path('M 0 0 H 36 V 8 C 36 43 90 43 90 8 V 0 H 126 V 234 H 0 Z');
		left: 115px;
		transform: rotateY(90deg);
		background-image:
			linear-gradient(105deg, #ffffff04, transparent 65%, #0001),
			repeating-linear-gradient(32deg, #ffffff03 0 1px, transparent 1px 2px),
			repeating-linear-gradient(-32deg, #0000000c 0 1px, transparent 1px 2px);
	}
	.box-front {
		inset: 0;
		border-radius: 7px;
		transform: translateZ(63px);
	}
	.box-front::after {
		content: '';
		position: absolute;
		inset: 8px;
		border: 1px dashed #77797c33;
		border-radius: 4px;
	}
	.front-rim {
		left: 1px;
		top: -3px;
		width: 176px;
		height: 6px;
		background: linear-gradient(#46474a, #242528 45%, #17181a);
		border-radius: 5px;
		transform: translateZ(64px);
	}
	.sleeve-edges {
		pointer-events: none;
		left: 14px;
		top: -3px;
		width: 150px;
		height: 110px;
		background: repeating-linear-gradient(
			to bottom,
			#777a7d 0 0.4px,
			#3a3c40 0.4px 0.75px,
			#55585b 0.75px 1.1px
		);
		transform-origin: 50% 0;
		transform: translateZ(-53px) rotateX(90deg);
		border: 1px solid #26282b;
	}
	.deck-box :global(.preview-card) {
		position: absolute;
		left: 14px;
		top: 0;
		display: block;
		width: 150px;
		height: auto;
		min-height: 0;
		padding: 0;
		aspect-ratio: 488 / 680;
		border: 0;
		border-radius: 6px;
		background: #141519;
		box-shadow:
			0 0 0 1px #161719,
			0 2px 3px #0006;
		transition: transform 140ms cubic-bezier(0.2, 0.7, 0.2, 1);
	}
	.deck-box :global(.seated-card) {
		transform: translate3d(0, -6px, var(--card-depth));
	}
	.deck-box :global(.seated-card[data-selected='true']) {
		transform: translate3d(0, -90px, var(--card-depth));
	}
	.deck-box :global(.commander-window) {
		top: 13px;
		transform: translateZ(64px);
		box-shadow:
			0 0 0 4px #141517,
			0 0 0 5px #3a3b3e,
			0 3px 5px #0008;
	}
	.deck-box :global(.commander-window)::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		pointer-events: none;
		background: linear-gradient(125deg, #ffffff18, transparent 38%, transparent 78%, #ffffff0a);
	}
	.deck-box :global(.preview-card:hover) {
		background: #141519;
	}
	.deck-box :global(.preview-card:focus-visible) {
		outline: 3px solid var(--color-ring);
		outline-offset: 4px;
	}
	.deck-box :global(.preview-card img) {
		display: block;
		width: 100%;
		height: auto;
		border-radius: inherit;
		pointer-events: none;
		user-select: none;
	}
	.ground-shadow {
		position: absolute;
		left: 14%;
		right: 7%;
		bottom: 1px;
		height: 30px;
		border-radius: 50%;
		background: #0005;
		filter: blur(16px);
		transform: rotate(-8deg);
		pointer-events: none;
	}
	.card-selection {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		margin-top: 0.25rem;
	}
	.card-selection :global(.browse-card) {
		width: 44px;
		height: 44px;
		flex-shrink: 0;
		color: var(--color-text-secondary);
	}
	.current-card {
		flex: 1;
		min-width: 0;
		min-height: 3.25rem;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.15rem;
		margin: 0;
		font-size: 0.75rem;
		line-height: 1.5;
		text-align: center;
	}
	.card-position {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}
	.deck-details {
		margin: 0.55rem 0.25rem 0;
	}
	.deck-meta,
	.deck-credit {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.25rem 0.75rem;
		color: var(--color-text-secondary);
		font-size: 0.75rem;
		line-height: 1.6;
	}
	.colors {
		display: inline-flex;
		gap: 0.3rem;
		font-size: 0.85rem;
	}
	.deck-credit {
		flex-wrap: wrap;
		margin-top: 0.25rem;
		font-size: 0.75rem;
	}
	.credit {
		overflow-wrap: anywhere;
		min-width: 0;
	}
	.source {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		min-height: 44px;
		padding-inline: 0.25rem;
		color: inherit;
		text-decoration: none;
	}
	.deck-title:hover,
	.source:hover {
		text-decoration: underline;
		text-underline-offset: 0.2em;
	}
	.deck-title:focus-visible,
	.source:focus-visible {
		outline: 2px solid var(--color-ring);
		outline-offset: 5px;
	}
	@media (min-width: 1800px) {
		.deck-stage {
			height: 408px;
		}
		.deck-box {
			top: 132px;
			transform: scale(1.13) rotateX(-18deg) rotateY(-27deg) rotateZ(-3deg);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.deck-box :global(.preview-card) {
			transition: none;
		}
	}
</style>
