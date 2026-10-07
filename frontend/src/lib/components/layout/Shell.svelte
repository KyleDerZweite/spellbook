<script lang="ts">
	import type { Snippet } from 'svelte';
	import { afterNavigate, snapshot } from '$app/navigation';
	import Nav from './Nav.svelte';
	import Footer from './Footer.svelte';
	import SearchOverlay from '#lib/components/search/SearchOverlay.svelte';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();
	snapshot({
		id: 'workspace-scroll',
		capture: () => ({ x: window.scrollX, y: window.scrollY }),
		restore: (position) => window.scrollTo(position.x, position.y)
	});
	afterNavigate(({ from, to, type, shallow }) => {
		if (!from || !to || shallow || type === 'popstate' || to.url.hash) return;
		if (from.url.pathname !== to.url.pathname) window.scrollTo(0, 0);
		else if (from.scroll) window.scrollTo(from.scroll.x, from.scroll.y);
	});
</script>

<div class="app-shell bg-background">
	<SearchOverlay />
	<Nav />
	<main id="main-content" tabindex="-1" class="app-main">
		<div class="app-content">
			{@render children()}
		</div>
		<Footer />
	</main>
</div>

<style>
	.app-content:has(> :global(.full-search)) {
		flex: 1 0 0;
		min-height: calc(32rem + var(--app-header-height));
	}
	.app-content:has(> :global(.public-home)),
	.app-content:has(> :global(.full-search)),
	.app-content:has(> :global(.account-layout)) {
		display: flex;
		flex-direction: column;
	}
</style>
