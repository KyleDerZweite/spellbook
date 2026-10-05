<script lang="ts">
	import '../app.css';
	import Shell from '#lib/components/layout/Shell.svelte';
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

	$effect(() => {
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
</svelte:head>

<Shell>
	{@render children()}
</Shell>
