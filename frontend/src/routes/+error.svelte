<script lang="ts">
	import { page } from '$app/state';
</script>

<svelte:head>
	<title>{page.status} | Spellbook</title>
</svelte:head>

<div class="mx-auto max-w-2xl px-4 py-8 sm:px-6">
	<div class="page-title mb-3">
		<h1>{page.status === 404 ? 'Page not found' : 'Page unavailable'}</h1>
	</div>
	<p class="text-sm leading-relaxed text-text-secondary">
		{page.error?.message ?? 'This page could not be loaded.'}
	</p>
	<div class="mt-6 flex flex-wrap gap-3">
		{#if page.status >= 500}
			<button class="btn btn-primary" onclick={() => window.location.reload()}>Try again</button>
		{/if}
		<a class="btn btn-secondary" href="/mtg/search">Search cards</a>
		<a class="btn btn-ghost" href="/">Home</a>
	</div>
</div>
