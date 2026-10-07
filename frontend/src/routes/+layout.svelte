<script lang="ts">
	import '../app.css';
	import { workspaceSavedState } from '#lib/saved-state/workspace.svelte.ts';
	import { afterNavigate } from '$app/navigation';
	import { confirmAuthenticatedNavigation } from '#lib/saved-state/authentication.ts';
	import { untrack, onDestroy } from 'svelte';
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

	let activation = $state('initial');
	let navigation = 0;
	let mounted = true;
	let authentication: AbortController | undefined;
	afterNavigate(({ shallow }) => {
		if (shallow) return;
		const currentNavigation = ++navigation;
		authentication?.abort();
		const accountId = data.user?.accountId;
		if (!accountId || workspaceSavedState.getState() !== 'expired') return;
		const controller = new AbortController();
		authentication = controller;
		const current = () =>
			mounted &&
			currentNavigation === navigation &&
			data.user?.accountId === accountId &&
			workspaceSavedState.getState() === 'expired';
		void confirmAuthenticatedNavigation(accountId, controller.signal, current).then((confirmed) => {
			if (confirmed && current()) activation = crypto.randomUUID();
		});
	});
	$effect(() => {
		const accountId = data.user?.accountId ?? null,
			user = data.user,
			currentActivation = activation;
		untrack(() => {
			workspaceSavedState.start({ accountId, activation: currentActivation });
			savedProfile.start();
			if (workspaceSavedState.getState() !== 'expired') authState.user = user;
		});
	});
	onDestroy(() => {
		mounted = false;
		navigation++;
		authentication?.abort();
		savedProfile.stop();
		workspaceSavedState.stop();
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
	{#if workspaceSavedState.getState() === 'expired' && data.user}
		<p role="alert">Your session has ended. <a href="/auth/login">Sign in again</a>.</p>
	{:else}
		{@render children()}
	{/if}
</Shell>
