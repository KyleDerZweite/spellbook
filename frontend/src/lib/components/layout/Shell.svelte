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
	let main = $state<HTMLElement>();

	snapshot({
		id: 'workspace-scroll',
		capture: () => main?.scrollTop ?? 0,
		restore: (top) => {
			if (main) main.scrollTop = top;
		}
	});
	afterNavigate(({ from, to, type, shallow }) => {
		if (
			main &&
			from &&
			to &&
			!shallow &&
			type !== 'popstate' &&
			from.url.pathname !== to.url.pathname
		) {
			main.scrollTop = 0;
		}
	});
</script>

<div class="app-shell bg-background">
	<SearchOverlay />
	<Nav />
	<main bind:this={main} id="main-content" tabindex="-1" class="app-main">
		<div class="app-content">
			{@render children()}
		</div>
		<Footer />
	</main>
</div>

<style>
	.app-content:has(> :global(.public-home)),
	.app-content:has(> :global(.account-layout)) {
		display: flex;
		flex-direction: column;
	}
	.app-shell {
		--app-header-height: 72px;
	}
	@media (max-width: 1023px) {
		.app-shell {
			--app-header-height: 64px;
		}
	}
</style>
