<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { pwaState } from '#lib/pwa/state.svelte.ts';
	import AppStatus from '#lib/components/pwa/AppStatus.svelte';
	import { afterNavigate, onNavigate, disableScrollHandling, snapshot } from '$app/navigation';
	import { hasDeepBrowseAnchor } from '#lib/browsing/pagination.ts';
	import Nav from './Nav.svelte';
	import Footer from './Footer.svelte';
	import SearchOverlay from '#lib/components/search/SearchOverlay.svelte';
	import PowerSearch from '#lib/components/search/PowerSearch.svelte';
	import type { SocialLink } from '#lib/social.ts';

	interface Props {
		socialLinks?: readonly SocialLink[];
		children: Snippet;
	}

	let { socialLinks, children }: Props = $props();
	let ready = $state(false);
	onMount(() => {
		const stop = pwaState.start();
		ready = true;
		return stop;
	});
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

<div
	class="app-shell bg-background"
	class:installed={pwaState.standalone}
	data-global-search-ready={ready}
>
	<SearchOverlay />
	<PowerSearch />
	<Nav />
	<main id="main-content" tabindex="-1" class="app-main">
		<div class="app-content">
			<AppStatus />
			{@render children()}
		</div>
		<Footer {socialLinks} />
	</main>
</div>

<style>
	@media screen and (max-width: 700px) {
		.installed {
			--app-header-height: calc(64px + env(safe-area-inset-top, 0px));
		}
		:global(html:has(.app-shell > .app-bottom-nav)) {
			--app-bottom-nav-height: calc(4.5rem + env(safe-area-inset-bottom, 0px));
			scroll-padding-bottom: var(--app-bottom-nav-height);
		}
		.app-shell:has(> :global(.app-bottom-nav)) {
			padding-bottom: var(--app-bottom-nav-height);
		}
		.installed :global(:focus-visible),
		.app-shell:has(> :global(.app-bottom-nav)) :global(:focus-visible) {
			scroll-margin-top: calc(var(--app-header-height) + var(--space-page-margin));
			scroll-margin-bottom: 1rem;
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
