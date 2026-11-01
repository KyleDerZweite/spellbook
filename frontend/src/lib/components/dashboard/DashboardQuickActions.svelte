<script lang="ts">
	import PlusIcon from '#lib/components/ui/PlusIcon.svelte';
</script>

<section class="panel" aria-label="Quick Actions">
	<h2>Quick Actions</h2>
	<nav aria-label="Dashboard quick actions">
		<a href="/mtg/search"
			><PlusIcon /><span>Add cards</span><span class="arrow" aria-hidden="true">↗</span></a
		>
		<a href="/mtg/decks?flow=create"
			><PlusIcon /><span>New deck</span><span class="arrow" aria-hidden="true">↗</span></a
		>
		<a href="/mtg/scan">
			<svg
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
				focusable="false"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M4 12h16" /></svg
			>
			<span>Scan cards</span><span class="arrow" aria-hidden="true">↗</span>
		</a>
		<a href="/mtg/inventory?view=groups">
			<svg
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
				focusable="false"
				><path d="m3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4M12 11v10M7.5 5l9 4" /></svg
			>
			<span>Manage boxes</span><span class="arrow" aria-hidden="true">↗</span>
		</a>
	</nav>
</section>

<style>
	.panel {
		box-sizing: border-box;
		min-width: 0;
		min-height: 415px;
		padding: 24px 18px;
		border: 1px solid var(--color-border);
		border-radius: 10px;
		color: var(--color-text-primary);
		font: 400 13px/1.4 var(--font-interface);
	}
	h2 {
		margin: 0 0 24px;
		font: 400 20px/1.3 var(--font-display);
	}
	nav {
		display: grid;
		gap: 12px;
	}
	a {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 60px;
		padding: 12px;
		border: 1px solid var(--color-border);
		border-radius: 6px;
		color: inherit;
		text-decoration: none;
		overflow-wrap: anywhere;
	}
	a:hover {
		background: var(--color-surface);
	}
	a:focus-visible {
		outline: 2px solid var(--color-chart-primary);
		outline-offset: 3px;
	}
	a :global(svg) {
		flex: none;
	}
	.arrow {
		margin-left: auto;
		color: var(--color-text-secondary);
	}
	@media (max-width: 620px) {
		.panel {
			min-height: 0;
		}
	}
</style>
