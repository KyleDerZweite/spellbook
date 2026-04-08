<script lang="ts">
	import '../app.css';
	import Shell from '$lib/components/layout/Shell.svelte';
	import { browser } from '$app/environment';
	import { connect, disconnect } from '$lib/spacetimedb/client';
	import { initMeiliSearch } from '$lib/search/meilisearch';
	import { authState } from '$lib/auth/state.svelte';
	import type { Snippet } from 'svelte';
	import type { AuthUser } from '$lib/auth/types';

	interface Props {
		data: { user: AuthUser | null; spacetimeToken: string | null; meiliSearchKey: string };
		children: Snippet;
	}

	let { data, children }: Props = $props();

	// Initialize MeiliSearch client with the server-fetched search key
	$effect(() => {
		authState.user = data.user;
	});

	$effect(() => {
		if (browser && data.meiliSearchKey) {
			initMeiliSearch(data.meiliSearchKey);
		}
	});

	$effect(() => {
		if (!browser) {
			return;
		}

		if (data.user && data.spacetimeToken) {
			connect({ user: data.user, token: data.spacetimeToken });
			return () => disconnect();
		}

		disconnect();
	});
</script>

<Shell>
	{@render children()}
</Shell>
