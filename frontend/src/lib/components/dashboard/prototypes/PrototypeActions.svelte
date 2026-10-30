<script lang="ts">
	const actions = [
		{
			href: '/mtg/search',
			label: 'Find cards',
			path: 'm21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0'
		},
		{
			href: '/mtg/decks',
			label: 'Open decks',
			path: 'm12 3 9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 16l9 5 9-5'
		},
		{ href: '/mtg/inventory', label: 'Inventory', path: 'M3 3h18v18H3zM3 9h18M9 9v12' },
		{ href: '/app/connect', label: 'Connect device', path: 'M6 2h12v20H6zM10 18h4' }
	];
</script>

<section class="prototype-actions">
	<h2>Quick actions</h2>
	<nav aria-label="Dashboard quick actions">
		{#each actions as action}<a href={action.href}
				><svg
					viewBox="0 0 24 24"
					width="18"
					height="18"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linejoin="round"
					stroke-linecap="round"
					aria-hidden="true"><path d={action.path} /></svg
				>{action.label}<span aria-hidden="true">↗</span></a
			>{/each}
	</nav>
</section>

<style>
	.prototype-actions {
		padding: 20px;
		border-radius: 12px;
		background: var(--color-card);
		border: 1px solid color-mix(in srgb, var(--color-border) 45%, transparent);
	}
	h2 {
		font: 500 16px var(--font-interface);
		margin-bottom: 12px;
	}
	nav {
		display: grid;
	}
	a {
		display: grid;
		grid-template-columns: 24px 1fr auto;
		align-items: center;
		gap: 8px;
		min-height: 40px;
		font: 400 13px var(--font-interface);
		color: var(--color-text-secondary);
		text-decoration: none;
		border-radius: 4px;
	}
	a:hover {
		color: var(--color-text-primary);
		background: var(--color-surface);
	}
	svg,
	a span {
		color: var(--color-text-muted);
	}
</style>
