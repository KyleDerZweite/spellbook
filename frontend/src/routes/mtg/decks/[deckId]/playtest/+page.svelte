<script lang="ts">
	import { useLanguage } from '#lib/i18n/context.ts';
	import type { PageProps } from './$types';
	import PlaytesterBoard from '#lib/components/decks/PlaytesterBoard.svelte';

	const language = useLanguage();
	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{language.t('playtest.pageTitle', { name: data.deck.name })}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

{#key data.deck.id}
	<PlaytesterBoard deck={data.deck} cards={data.cards} documents={data.documents} />
{/key}
