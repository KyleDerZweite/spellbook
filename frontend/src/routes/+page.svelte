<script lang="ts">
	import { page } from '$app/state';
	import CardGrid from '#lib/components/cards/CardGrid.svelte';
	import type { CardDocument } from '#lib/search/types.ts';
	import { SITE_NAME, pageMetadata } from '#lib/seo/site.ts';

	let inputEl: HTMLInputElement | null = $state(null);
	const isAuthenticated = $derived(Boolean(page.data.user));
	const stats = $derived(page.data.stats);
	const recentAdditions = $derived((page.data.recentAdditions as CardDocument[]).slice(0, 6));
	const meta = $derived(
		pageMetadata({
			origin: page.url.origin,
			path: '/',
			title: `${SITE_NAME} | Your Magic workspace`,
			description: 'Build Magic: The Gathering decks, search cards, and organize your inventory.'
		})
	);

	$effect(() => {
		function handleKeydown(event: KeyboardEvent) {
			if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
				event.preventDefault();
				inputEl?.focus();
			}
		}
		window.addEventListener('keydown', handleKeydown);
		return () => window.removeEventListener('keydown', handleKeydown);
	});
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

<div class="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
	<header class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="font-display text-xl font-semibold text-gold-bright">
			{isAuthenticated ? 'Your MTG library' : 'Spellbook'}
		</h1>
		{#if !isAuthenticated}
			<div class="flex gap-2">
				<a href="/auth/login" class="btn btn-secondary">Sign in</a><a
					href="/auth/register"
					class="btn btn-primary">Create account</a
				>
			</div>
		{/if}
	</header>
	{#if isAuthenticated}
		<form
			method="GET"
			action="/search"
			role="search"
			aria-label="Search catalog"
			class="flex flex-wrap items-center gap-2"
		>
			<label for="workspace-search" class="sr-only">Search Magic cards</label>
			<input
				bind:this={inputEl}
				id="workspace-search"
				name="q"
				type="search"
				autocomplete="off"
				placeholder="Search cards by name or rules text..."
				class="input min-w-0 flex-1 basis-48"
			/>
			<button type="submit" class="btn btn-primary">Search</button>
		</form>
		<p class="text-sm text-text-secondary">
			{stats.total.toLocaleString()} cards · {stats.unique.toLocaleString()} unique · {stats.completedSets}
			/ {stats.sets} sets complete
		</p>
	{/if}
	<nav class="flex flex-wrap gap-2" aria-label="Workspace">
		<a href="/decks" class="btn btn-secondary">Deck builder</a>
		<a href="/search" class="btn btn-secondary">Card search</a>
		<a href="/inventory" class="btn btn-secondary">Inventory</a>
		<a href="/scan" class="btn btn-secondary">Scan review</a>
	</nav>
	{#if isAuthenticated && recentAdditions.length > 0}
		<section aria-label="Recent additions">
			<CardGrid
				cards={recentAdditions}
				onSelect={(card) => {
					window.location.href = `/search?q=${encodeURIComponent(card.name)}`;
				}}
			/>
		</section>
	{/if}
</div>
