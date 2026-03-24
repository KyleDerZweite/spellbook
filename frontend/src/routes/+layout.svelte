<script lang="ts">
	import '../app.css';
	import Shell from '$lib/components/layout/Shell.svelte';
	import { browser } from '$app/environment';
	import { connect, disconnect } from '$lib/spacetimedb/client';
	import { initMeiliSearch } from '$lib/search/meilisearch';
	import type { Snippet } from 'svelte';

	interface Props {
		data: { user: App.Locals['user']; meiliSearchKey: string };
		children: Snippet;
	}

	let { data, children }: Props = $props();

	// Initialize MeiliSearch client with the server-fetched search key
	$effect(() => {
		if (browser && data.meiliSearchKey) {
			initMeiliSearch(data.meiliSearchKey);
		}
	});

	$effect(() => {
		if (browser && data.user) {
			connect(data.user);
			return () => disconnect();
		}
	});
</script>

<Shell>
	{@render children()}
</Shell>
