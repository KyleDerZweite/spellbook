<script lang="ts">
	import { showcaseAsset } from '#lib/showcase/assets.ts';
	import Button from '#lib/components/ui/button/Button.svelte';
	import { commanderDeck, commanderStack } from '#lib/showcase/commander-deck.ts';

	let pointedCard = $state<number | null>(null);
	let focusedCard = $state<number | null>(null);
	const selectedCard = $derived(pointedCard ?? focusedCard);
	const colorNames: Record<string, string> = {
		W: 'White',
		U: 'Blue',
		B: 'Black',
		R: 'Red',
		G: 'Green'
	};

	function cardLayer(index: number) {
		if (index === selectedCard) return commanderStack.length + 1;
		if (selectedCard !== null && index < selectedCard) return index + 1;
		return commanderStack.length - index;
	}

	function moveFocus(event: KeyboardEvent, index: number) {
		if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
		event.preventDefault();
		pointedCard = null;
		const buttons = (event.currentTarget as HTMLElement)
			.closest('.stack')
			?.querySelectorAll<HTMLButtonElement>('.stack-hit');
		if (!buttons?.length) return;
		const next =
			event.key === 'Home'
				? 0
				: event.key === 'End'
					? buttons.length - 1
					: (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
		buttons[next].focus();
		focusedCard = next;
	}
</script>

<article class="commander-card" aria-label="Commander deck preview">
	<header>
		<a
			class="deck-title"
			href={commanderDeck.sourceURL}
			target="_blank"
			rel="noreferrer"
			aria-label={'View ' + commanderDeck.name + ' on Archidekt (opens in a new tab)'}
		>
			{commanderDeck.name}
		</a>
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
	</header>
	<div
		class="stack"
		style:--stack-count={commanderStack.length}
		role="group"
		aria-label="Preview deck cards"
		onpointerleave={(event) => {
			if (event.pointerType !== 'touch') pointedCard = null;
		}}
		onfocusout={(event) => {
			const stack = event.currentTarget;
			queueMicrotask(() => {
				if (!stack.contains(document.activeElement)) focusedCard = null;
			});
		}}
	>
		{#each commanderStack as card, index (card.catalogCardId)}
			<div
				class="card-slot"
				class:selected={selectedCard === index}
				class:commander={card.role === 'commander'}
				style={'--index:' +
					index +
					';--shift:' +
					(selectedCard !== null && index < selectedCard
						? `${-Math.min(24, 8 * (selectedCard - index) + 6)}px`
						: selectedCard !== null && index > selectedCard
							? '10px'
							: '0px') +
					';--layer:' +
					cardLayer(index)}
			>
				<Button
					variant="ghost"
					class="stack-hit"
					aria-label={'Preview ' + card.name + (card.role === 'commander' ? ', Commander' : '')}
					aria-pressed={selectedCard === index}
					onpointermove={(event) => {
						if (event.pointerType !== 'touch') pointedCard = index;
					}}
					onfocus={() => {
						pointedCard = null;
						focusedCard = index;
					}}
					onclick={() => {
						pointedCard = null;
						focusedCard = index;
					}}
					onkeydown={(event) => moveFocus(event, index)}
				/>
				<span class="stack-picture" aria-hidden="true">
					<img
						src={showcaseAsset(card.localImage)}
						alt=""
						width={card.width}
						height={card.height}
						draggable="false"
						fetchpriority={card.role === 'commander' ? 'high' : 'auto'}
					/>
					{#if card.role === 'commander'}<span class="commander-marker commander-role"
							>Commander</span
						>{/if}
				</span>
			</div>
		{/each}
	</div>
	<div class="deck-details">
		<div class="deck-meta">
			<span
				><span class="commander-role">{commanderDeck.format}</span> · {commanderDeck.cardCount} cards</span
			>
		</div>
		<div class="deck-credit">
			<span class="credit">{commanderDeck.creator}</span>
			<a class="source" href={commanderDeck.sourceURL} target="_blank" rel="noreferrer">
				Archidekt <span aria-hidden="true">↗</span>
			</a>
		</div>
	</div>
</article>

<style>
	.commander-card {
		width: min(100%, var(--landing-deck-width, 324px));
		padding: 1.1rem 1.25rem 1rem;
		border: 1px solid color-mix(in srgb, var(--color-border) 70%, transparent);
		border-radius: 1.25rem;
		background: color-mix(in srgb, var(--color-card) 91%, transparent);
		color: var(--color-card-foreground);
		backdrop-filter: blur(18px);
		box-shadow:
			0 20px 56px #0002,
			0 2px 5px #0001;
	}
	header,
	.deck-meta {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
	}
	header {
		align-items: flex-start;
	}
	.deck-title {
		min-width: 0;
		color: inherit;
		text-decoration: none;
		font-family: var(--landing-heading-font, var(--font-display));
		font-size: 1.2rem;
		font-weight: var(--landing-heading-weight, 500);
		font-synthesis: none;
		line-height: 1.2;
		overflow-wrap: anywhere;
	}
	.colors {
		display: inline-flex;
		gap: 0.3rem;
		padding-top: 0.2rem;
		font-size: 0.95rem;
		flex-shrink: 0;
	}
	.stack {
		--card-width: var(--landing-card-width, 147px);
		--stack-width: calc(var(--card-width) + (var(--stack-count) - 1) * 9px);
		position: relative;
		height: calc(266px + (var(--card-width) - 147px) * 680 / 488);
		margin: 0.8rem 0 0.35rem;
	}
	.card-slot {
		display: contents;
	}
	.stack :global(.stack-hit),
	.stack-picture {
		position: absolute;
		left: calc(50% - var(--stack-width) / 2 + var(--index) * 9px);
		top: calc(40px - var(--index) * 1.5px);
		width: var(--card-width);
		aspect-ratio: 488 / 680;
		border-radius: 4% / 3%;
		z-index: var(--layer);
		transform: translateX(var(--shift))
			rotate(calc(var(--index) * 9deg / (var(--stack-count) - 1) - 4deg));
		transform-origin: 50% 50%;
		transition: transform 150ms cubic-bezier(0.2, 0.7, 0.2, 1);
	}
	.stack :global(.stack-hit) {
		height: auto;
		padding: 0;
		border: 0;
		background: transparent;
		outline: none;
		box-shadow: none;
	}
	.stack-picture {
		pointer-events: none;
	}
	.selected .stack-picture,
	.selected :global(.stack-hit) {
		transform: translateY(-12px) rotate(0deg) scale(1.16);
	}
	.stack :global(.stack-hit:hover) {
		background: transparent;
	}
	.commander-marker {
		position: absolute;
		inset: auto 0.25rem 0.25rem;
		border-radius: 0.2rem;
		padding: 0.2rem 0.3rem;
		background: var(--color-card);
		font-size: 0.5rem;
		line-height: 1.4;
		text-align: center;
	}
	.commander img {
		outline: 2px solid var(--color-role-commander);
		outline-offset: 2px;
	}
	.stack img {
		display: block;
		width: 100%;
		height: auto;
		border-radius: inherit;
		box-shadow:
			0 2px 4px #0004,
			0 9px 17px #0002;
		pointer-events: none;
		user-select: none;
	}
	.stack :global(.stack-hit:focus-visible + .stack-picture),
	.deck-title:focus-visible,
	.source:focus-visible {
		outline: 2px solid var(--color-ring);
		outline-offset: 5px;
	}
	.deck-title:hover,
	.source:hover {
		text-decoration: underline;
		text-underline-offset: 0.2em;
	}
	.deck-meta {
		align-items: flex-start;
		margin-top: 0.6rem;
		font-size: 0.72rem;
		color: var(--color-muted-foreground);
		gap: 0.45rem;
	}
	.deck-meta > span:first-child {
		flex-shrink: 0;
	}
	.credit {
		overflow-wrap: anywhere;
		min-width: 0;
	}
	.deck-credit {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 0.15rem 0.75rem;
		margin-top: 0.25rem;
		font-size: 0.65rem;
		color: var(--color-muted-foreground);
	}
	.source {
		display: inline-block;
		color: var(--color-muted-foreground);
		font-size: inherit;
		text-decoration: none;
	}
	@media (max-width: 600px) {
		.commander-card {
			width: min(100%, 300px);
			padding: 1rem;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.stack-picture,
		.stack :global(.stack-hit) {
			transition: none;
		}
	}
</style>
