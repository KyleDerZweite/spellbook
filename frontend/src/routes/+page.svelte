<script lang="ts">
	import PublicLanding from '#lib/components/showcase/PublicLanding.svelte';
	import { page } from '$app/state';
	import { SITE_NAME, pageMetadata } from '#lib/seo/site.ts';
	const meta = $derived(
		pageMetadata({
			origin: page.url.origin,
			path: '/',
			title: `${SITE_NAME} | Your Magic workspace`,
			description: 'Build Magic: The Gathering decks, search cards, and organize your inventory.'
		})
	);
</script>

<svelte:head>
	<title>{meta.title}</title>
	<meta name="description" content={meta.description} />
	<link rel="canonical" href={meta.canonical} />
	<meta property="og:title" content={meta.title} />
	<meta property="og:description" content={meta.description} />
	<meta property="og:url" content={meta.url} />
	<meta name="twitter:title" content={meta.title} />
	<meta name="twitter:description" content={meta.description} />
</svelte:head>

<div class="public-home"><PublicLanding /></div>

<style>
	.public-home {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
	}
</style>
