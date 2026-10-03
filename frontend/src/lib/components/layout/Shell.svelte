<script lang="ts">
	import type { Snippet } from 'svelte';
	import Nav from './Nav.svelte';
	import Footer from './Footer.svelte';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();
</script>

<div class="flex h-dvh flex-col overflow-hidden bg-background">
	<Nav />
	<main id="main-content" tabindex="-1" class="flex min-h-0 flex-1 flex-col overflow-y-auto">
		<div class="min-h-0 flex-1">
			{@render children()}
		</div>
		<Footer />
	</main>
</div>
