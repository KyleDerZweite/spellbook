<script lang="ts">
	import type { Snippet } from 'svelte';
	import { afterNavigate, beforeNavigate, snapshot } from '$app/navigation';
	import Nav from './Nav.svelte';
	import Footer from './Footer.svelte';
	import SearchOverlay from '#lib/components/search/SearchOverlay.svelte';
	import ScrollArea from '#lib/components/ui/scroll-area/ScrollArea.svelte';
	import { cancelWheelScroll } from '#lib/components/ui/scroll-area/wheel.ts';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();
	let main = $state<HTMLDivElement | null>(null);

	beforeNavigate(() => cancelWheelScroll(main));

	snapshot({
		id: 'workspace-scroll',
		capture: () => main?.scrollTop ?? 0,
		restore: (top) => {
			cancelWheelScroll(main);
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
			cancelWheelScroll(main);
			main.scrollTop = 0;
		}
	});
</script>

<div class="app-shell bg-background">
	<SearchOverlay />
	<Nav scrollViewport={main} />
	<ScrollArea
		tag="main"
		bind:viewportRef={main}
		id="main-content"
		tabindex={-1}
		class="app-main"
		viewportClass="app-main-viewport"
		viewportLabel="Main content"
		onfocus={(event) => {
			if (event.target === event.currentTarget) main?.focus({ preventScroll: true });
		}}
	>
		<div class="app-content">
			{@render children()}
		</div>
		<Footer />
	</ScrollArea>
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
