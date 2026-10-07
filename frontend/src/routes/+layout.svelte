<script lang="ts">
	import '../app.css';
	import { savedProfile } from '#lib/saved-state/profile.svelte.ts';
	import Shell from '#lib/components/layout/Shell.svelte';
	import { page } from '$app/state';
	import { parseSearchUrl } from '#lib/search/navigation.ts';
	import { provideSearchSession } from '#lib/search/session.svelte.ts';
	import { authState } from '#lib/auth/state.svelte.ts';
	import { activeGameState } from '#lib/state/activeGame.svelte.ts';
	import { SITE_NAME } from '#lib/seo/site.ts';
	import type { Snippet } from 'svelte';
	import type { AuthUser } from '#lib/auth/types.ts';
	import type { Game } from '#lib/search/types.ts';

	interface Props {
		data: {
			user: AuthUser | null;
			activeGame: Game;
		};
		children: Snippet;
	}

	let { data, children }: Props = $props();
	const search = provideSearchSession();
	if (page.url.pathname === '/mtg/search') search.hydrate(parseSearchUrl(page.url));

	$effect(() => {
		savedProfile.start(data.user?.accountId ?? null);
		authState.user = data.user;
	});

	$effect(() => {
		activeGameState.hydrate(data.activeGame);
	});
</script>

<svelte:head>
	<meta name="application-name" content={SITE_NAME} />
	<meta property="og:site_name" content={SITE_NAME} />
	<meta property="og:type" content="website" />
	<meta name="twitter:card" content="summary" />
	<link rel="describedby" type="text/plain" href="/llms.txt" title="Spellbook agent guide" />
</svelte:head>

<Shell>
	{#if savedProfile.status === 'expired' && data.user}
		<p role="alert">Your session has ended. <a href="/auth/login">Sign in again</a>.</p>
	{:else}
		{@render children()}
	{/if}
</Shell>
