<script lang="ts">
	import type { DashboardSummary } from '@spellbook/contracts/dashboard.ts';
	let {
		dashboard,
		limit = 6,
		layout = 'strip'
	}: { dashboard: DashboardSummary; limit?: number; layout?: 'strip' | 'gallery' } = $props();
</script>

<section class="prototype-recent" class:gallery={layout === 'gallery'}>
	<header>
		<h2>Recently edited</h2>
		<a href="/mtg/inventory" aria-label="Open inventory">↗</a>
	</header>
	<div class="cards">
		{#each dashboard.recentEntries.slice(0, limit) as entry}<a
				href={`/mtg/inventory/${encodeURIComponent(entry.id)}`}
				class="card"
				><div class="art">
					{#if entry.imageUri}<img
							src={entry.imageUri}
							alt={entry.name}
							width="140"
							height="196"
							loading="lazy"
						/>{:else}<span>{entry.setCode.toUpperCase()}</span>{/if}
				</div>
				<span class="name">{entry.name}</span><small>{entry.quantity}×</small></a
			>{:else}<p>No recently edited cards.</p>{/each}
	</div>
</section>

<style>
	.prototype-recent {
		min-width: 0;
		padding: 1.25rem;
		border-radius: 0.85rem;
		background: var(--color-card);
		border: 1px solid color-mix(in srgb, var(--color-border) 45%, transparent);
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1rem;
	}
	h2 {
		font: 500 1rem var(--font-interface);
	}
	header a {
		color: var(--color-text-muted);
		text-decoration: none;
		font-size: 1rem;
	}
	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(76px, 1fr));
		gap: 0.875rem;
	}
	.gallery .cards {
		grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
	}
	.card {
		display: grid;
		grid-template-columns: 1fr auto;
		align-content: start;
		gap: 0.5rem 0.25rem;
		text-decoration: none;
		min-width: 0;
		color: var(--color-text-primary);
	}
	.art {
		grid-column: 1/-1;
		aspect-ratio: 5/7;
		border-radius: 5px;
		overflow: hidden;
		background: var(--color-surface);
	}
	.art img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	.art span {
		height: 100%;
		display: grid;
		place-items: center;
		color: var(--color-text-muted);
	}
	.name {
		font: 400 0.6875rem/1.4 var(--font-interface);
		overflow-wrap: anywhere;
	}
	.card:hover .name {
		text-decoration: underline;
	}
	small {
		font: 0.625rem var(--font-interface);
		color: var(--color-text-muted);
	}
	p {
		font: 0.8125rem var(--font-interface);
		color: var(--color-text-muted);
	}
</style>
