<script lang="ts">
	import type { Snippet } from 'svelte';
	import Nav from './Nav.svelte';
	import Footer from './Footer.svelte';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();
</script>

<div class="app-shell bg-background">
	<Nav />
	<main id="main-content" tabindex="-1" class="app-main">
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
