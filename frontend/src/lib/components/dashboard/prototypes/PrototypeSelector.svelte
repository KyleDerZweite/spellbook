<script lang="ts">
	let { design }: { design: number } = $props();
	const names = ['Calm', 'Gallery', 'Studio', 'Bento', 'Collection'];
	const references = [
		[
			{ name: 'Things 3', url: 'https://culturedcode.com/things/' },
			{ name: 'shadcn', url: 'https://ui.shadcn.com/examples/dashboard' }
		],
		[
			{ name: 'Craft', url: 'https://www.craft.do/' },
			{ name: 'Apple Music', url: 'https://www.apple.com/apple-music/' }
		],
		[
			{ name: 'Linear', url: 'https://linear.app/' },
			{ name: 'Raycast', url: 'https://www.raycast.com/' }
		],
		[
			{ name: 'shadcn', url: 'https://ui.shadcn.com/examples/dashboard' },
			{ name: 'Raycast', url: 'https://www.raycast.com/' }
		],
		[
			{ name: 'Bear', url: 'https://bear.app/' },
			{ name: 'Craft', url: 'https://www.craft.do/' }
		]
	];
</script>

<nav class="prototype-selector" aria-label="Dashboard design selector">
	<span class="preview-label">Design preview</span><a
		class="arrow"
		href={`/mtg/dashboard/${design === 1 ? 5 : design - 1}`}
		aria-label="Previous design">←</a
	>{#each names as name, index}<a
			href={`/mtg/dashboard/${index + 1}`}
			aria-current={design === index + 1 ? 'page' : undefined}
			aria-label={`Design ${index + 1}: ${name}`}><strong>{index + 1}</strong><span>{name}</span></a
		>{/each}<a
		class="arrow"
		href={`/mtg/dashboard/${design === 5 ? 1 : design + 1}`}
		aria-label="Next design">→</a
	>
	<details class="references">
		<summary aria-label="Design references">Refs</summary>
		<div>
			{#each references[design - 1] as reference}<a
					href={reference.url}
					target="_blank"
					rel="noopener">{reference.name} ↗</a
				>{/each}
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
		box-shadow: 0 5px 24px #0003;
		max-width: calc(100vw - 1.25rem);
		font: 400 0.6875rem var(--font-interface);
	}
	.preview-label {
		font-size: 0.625rem;
		color: var(--color-text-muted);
		white-space: nowrap;
		padding: 0 0.5rem;
	}
	a {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
		min-width: 36px;
		min-height: 36px;
		padding: 0.5rem 0.6rem;
		border-radius: 7px;
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
		bottom: calc(100% + 14px);
		min-width: 160px;
		padding: 0.4rem;
		border: 1px solid var(--color-border);
		border-radius: 8px;
		background: var(--color-surface);
		box-shadow: 0 4px 20px #0003;
	}
	.references div a {
		justify-content: space-between;
	}
	@media (max-width: 760px) {
		a span,
		.preview-label {
			display: none;
		}
		a {
			min-width: 34px;
			min-height: 42px;
			padding: 0.4rem 0.5rem;
		}
		.prototype-selector {
			gap: 2px;
			bottom: 0.75rem;
		}
	}
	@media (max-width: 480px) {
		.arrow {
			display: none;
		}
	}
</style>
