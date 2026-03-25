<script lang="ts">
	import type { Snippet } from 'svelte';
	import Nav from './Nav.svelte';
	import Footer from './Footer.svelte';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();
</script>

<div class="flex h-screen flex-col overflow-hidden">
	<Nav />
	<main class="flex flex-1 flex-col overflow-y-auto">
		<div class="flex-1">
			{@render children()}
		</div>
		<Footer />
	</main>
</div>
