<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { pwaState } from '#lib/pwa/state.svelte.ts';
	import AppStatus from '#lib/components/pwa/AppStatus.svelte';
	import { afterNavigate, onNavigate, disableScrollHandling, snapshot } from '$app/navigation';
	import { hasDeepBrowseAnchor } from '#lib/browsing/pagination.ts';
	import Nav from './Nav.svelte';
	import Footer from './Footer.svelte';
	import SearchOverlay from '#lib/components/search/SearchOverlay.svelte';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();
	onMount(() => pwaState.start());
	snapshot({
		id: 'workspace-scroll',
		capture: () => ({ x: window.scrollX, y: window.scrollY }),
		restore: (position) => window.scrollTo(position.x, position.y)
	});
	onNavigate(({ to, type, shallow }) => {
		if (to && !shallow && type !== 'popstate' && !to.url.hash && hasDeepBrowseAnchor(to.url))
			disableScrollHandling();
	});
	afterNavigate(({ from, to, type, shallow }) => {
		if (
			!from ||
			!to ||
			shallow ||
			type === 'popstate' ||
			to.url.hash ||
			hasDeepBrowseAnchor(to.url)
		)
			return;
		if (from.url.pathname !== to.url.pathname) window.scrollTo(0, 0);
		else if (from.scroll) window.scrollTo(from.scroll.x, from.scroll.y);
	});
</script>

<div class="app-shell bg-background" class:installed={pwaState.standalone}>
	<SearchOverlay />
	<Nav />
	<main id="main-content" tabindex="-1" class="app-main">
		<div class="app-content">
			<AppStatus />
			{@render children()}
		</div>
		<Footer />
	</main>
</div>

<style>
	@media (max-width: 700px) {
		.installed {
			--app-header-height: calc(64px + env(safe-area-inset-top, 0px));
			padding-bottom: calc(4.5rem + env(safe-area-inset-bottom, 0px));
		}
		.installed :global(:focus-visible) {
			scroll-margin-top: calc(var(--app-header-height) + 18px);
			scroll-margin-bottom: calc(5.5rem + env(safe-area-inset-bottom, 0px));
		}
	}

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
