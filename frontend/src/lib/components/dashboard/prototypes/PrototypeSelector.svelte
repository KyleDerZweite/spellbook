<script lang="ts">
	import { goto } from '$app/navigation';
	import collectionReference from './references/collection-workbench.png?url';
	import deckReference from './references/deck-workbench.png?url';
	import overviewReference from './references/collection-overview.png?url';
	let { design }: { design: number } = $props();
	const variants = [
		{ id: 6, name: 'Collection', reference: collectionReference },
		{ id: 7, name: 'Decks', reference: deckReference },
		{ id: 8, name: 'Overview', reference: overviewReference }
	];
	const index = $derived(variants.findIndex((v) => v.id === design));
	const current = $derived(variants[index]);
	const adjacent = (offset: number) =>
		variants[(index + offset + variants.length) % variants.length].id;
</script>

<svelte:window
	onkeydown={(event) => {
		if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
			return;
		const element = event.target;
		if (
			!(element instanceof HTMLElement) ||
			(element !== document.body && !element.closest('.prototype-selector')) ||
			element.closest('input, textarea, select, [contenteditable="true"]')
		)
			return;
		if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
			event.preventDefault();
			const next = adjacent(event.key === 'ArrowLeft' ? -1 : 1);
			void goto(`/mtg/dashboard/${next}`, { reset: false });
		}
	}}
/>
<nav class="prototype-selector" aria-label="Dashboard design selector">
	<span class="preview-label">Design preview</span><a
		class="arrow"
		href={`/mtg/dashboard/${adjacent(-1)}`}
		aria-label="Previous design">←</a
	>{#each variants as variant}<a
			href={`/mtg/dashboard/${variant.id}`}
			aria-current={design === variant.id ? 'page' : undefined}
			aria-label={`Design ${variant.id}: ${variant.name}`}
			><strong>{variant.id}</strong><span>{variant.name}</span></a
		>{/each}<a class="arrow" href={`/mtg/dashboard/${adjacent(1)}`} aria-label="Next design">→</a>
	<details class="references">
		<summary aria-label="Design references">Refs</summary>
		<div>
			<a href={current.reference} target="_blank" rel="noopener">Saved reference ↗</a>
		</div>
	</details>
	<a class="baseline" href="/mtg/dashboard" aria-label="Open current Dashboard">↗</a>
</nav>

<style>
	.prototype-selector {
		position: fixed;
		z-index: 90;
		left: 50%;
		bottom: 1rem;
		transform: translateX(-50%);
		display: flex;
		gap: 4px;
		align-items: center;
		padding: 6px;
		border: 1px solid var(--color-border);
		border-radius: 12px;
		background: var(--color-surface);
		box-shadow: 0 4px 24px #0003;
		max-width: calc(100vw - 1.25rem);
		font: 400 0.6875rem var(--font-interface);
	}
	.preview-label {
		font-size: 0.6875rem;
		color: var(--color-text-muted);
		white-space: nowrap;
		padding: 0 0.5rem;
	}
	a {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		min-width: 36px;
		min-height: 36px;
		padding: 0.5rem;
		border-radius: 6px;
		text-decoration: none;
		color: var(--color-text-secondary);
		white-space: nowrap;
	}
	a:hover {
		background: var(--color-muted);
		color: var(--color-text-primary);
	}
	a[aria-current='page'] {
		background: var(--color-primary);
		color: var(--color-primary-foreground);
	}
	strong {
		font-weight: 500;
	}
	.arrow {
		font-size: 1rem;
	}
	.baseline {
		border-left: 1px solid var(--color-border);
		border-radius: 0;
	}
	.references {
		position: relative;
	}
	.references summary {
		cursor: pointer;
		list-style: none;
		padding: 0.5rem;
		color: var(--color-text-muted);
	}
	.references summary::-webkit-details-marker {
		display: none;
	}
	.references div {
		position: absolute;
		right: 0;
		bottom: calc(100% + 16px);
		min-width: 160px;
		padding: 0.5rem;
		border: 1px solid var(--color-border);
		border-radius: 8px;
		background: var(--color-surface);
		box-shadow: 0 4px 20px #0003;
	}
	.references div a {
		justify-content: space-between;
	}
	@media (max-width: 1100px) {
		a span,
		.preview-label {
			display: none;
		}
		a {
			min-width: 32px;
			min-height: 42px;
			padding: 0.5rem;
		}
		.prototype-selector {
			gap: 2px;
			bottom: 0.75rem;
		}
	}
	@media (max-width: 480px) {
		.arrow,
		.references,
		.baseline {
			display: none;
		}
	}
</style>
