<section class="prototype-actions">
	<h2>Quick actions</h2>
	<nav aria-label="Dashboard quick actions">
		<a href="/mtg/search"
			><span aria-hidden="true">⌕</span>Find cards<span aria-hidden="true">↗</span></a
		><a href="/mtg/decks"
			><span aria-hidden="true">▱</span>Open decks<span aria-hidden="true">↗</span></a
		><a href="/mtg/inventory"
			><span aria-hidden="true">▦</span>Inventory<span aria-hidden="true">↗</span></a
		><a href="/app/connect"
			><span aria-hidden="true">⌘</span>Connect device<span aria-hidden="true">↗</span></a
		>
	</nav>
</section>

<style>
	.prototype-actions {
		padding: 1.25rem;
		border-radius: 0.85rem;
		background: var(--color-card);
		border: 1px solid color-mix(in srgb, var(--color-border) 45%, transparent);
	}
	h2 {
		font: 500 1rem var(--font-interface);
		margin-bottom: 0.75rem;
	}
	nav {
		display: grid;
	}
	a {
		display: grid;
		grid-template-columns: 22px 1fr auto;
		align-items: center;
		gap: 0.65rem;
		padding: 0.65rem 0;
		font: 0.8125rem var(--font-interface);
		color: var(--color-text-secondary);
		text-decoration: none;
	}
	a:hover {
		color: var(--color-text-primary);
		text-decoration: underline;
	}
	a span {
		color: var(--color-text-muted);
	}
</style>
