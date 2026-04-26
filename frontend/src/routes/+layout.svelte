<script lang="ts">
	import '../app.css';
	import Shell from '$lib/components/layout/Shell.svelte';
	import { browser } from '$app/environment';
	import { initMeiliSearch } from '$lib/search/meilisearch';
	import { authState } from '$lib/auth/state.svelte';
	import { activeGameState } from '$lib/state/activeGame.svelte';
	import { SITE_NAME, SITE_THEME_COLOR } from '$lib/seo/site';
	import type { Snippet } from 'svelte';
	import type { AuthUser } from '$lib/auth/types';
	import type { Game } from '$lib/search/types';

	interface Props {
		data: {
			user: AuthUser | null;
			meiliSearchKey: string;
			activeGame: Game;
		};
		children: Snippet;
	}

	let { data, children }: Props = $props();

	// Initialize MeiliSearch client with the server-fetched search key
	$effect(() => {
		authState.user = data.user;
	});

	$effect(() => {
		activeGameState.hydrate(data.activeGame);
	});

	$effect(() => {
		if (browser && data.meiliSearchKey) {
			initMeiliSearch(data.meiliSearchKey);
		}
	});
</script>

<svelte:head>
	<meta name="application-name" content={SITE_NAME} />
	<meta property="og:site_name" content={SITE_NAME} />
	<meta property="og:type" content="website" />
	<meta name="twitter:card" content="summary" />
	<meta name="theme-color" content={SITE_THEME_COLOR} />
</svelte:head>

<Shell>
	{@render children()}
</Shell>
