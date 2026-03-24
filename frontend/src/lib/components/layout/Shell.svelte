<script lang="ts">
	import type { Snippet } from 'svelte';
	import Nav from './Nav.svelte';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();
</script>

<div class="flex h-screen flex-col overflow-hidden">
	<Nav />
	<main class="flex-1 overflow-y-auto">
		{@render children()}
	</main>
</div>
