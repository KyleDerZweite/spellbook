<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import CardGrid from '$lib/components/cards/CardGrid.svelte';
	import OrnamentalDivider from '$lib/components/layout/OrnamentalDivider.svelte';
	import { activeGameState } from '$lib/state/activeGame.svelte';
	import type { CardDocument } from '$lib/search/types';
	import { SITE_NAME, pageMetadata } from '$lib/seo/site';

	const RECENT_LIMIT = 6;

	let query = $state('');
	let inputEl: HTMLInputElement | null = $state(null);

	const isAuthenticated = $derived(Boolean(page.data.user));
	const gameLabel = $derived(activeGameState.current.toUpperCase());

	const meta = $derived(
		pageMetadata({
			origin: page.url.origin,
			path: '/',
			title: `${SITE_NAME} | Your ${gameLabel} library`,
			description: 'Search the catalog and track the cards you own, all in one place.'
		})
	);

	let stats = $derived(page.data.stats);
	let setsCompleteLabel = $derived(`${stats.completedSets} / ${stats.sets || 0} sets complete`);
	let recentAdditions = $derived(
		(page.data.recentAdditions as CardDocument[]).slice(0, RECENT_LIMIT)
	);

	$effect(() => {
		// Focus the search input on first paint so the primary action is ready.
		inputEl?.focus();
	});

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

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		const q = query.trim();
		goto(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
	}
</script>

<svelte:head>
	<title>{meta.title}</title>
	<meta name="description" content={meta.description} />
	<link rel="canonical" href={meta.canonical} />
	<meta property="og:title" content={meta.title} />
	<meta property="og:description" content={meta.description} />
	<meta property="og:url" content={meta.url} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={SITE_NAME} />
	<meta name="twitter:title" content={meta.title} />
	<meta name="twitter:description" content={meta.description} />
</svelte:head>

<div class="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-12">
	{#if !isAuthenticated}
		<section class="surface-card flex flex-col gap-4 p-8 text-center sm:p-10">
			<p class="font-mono text-[11px] uppercase tracking-[0.3em] text-text-secondary">
				{gameLabel} Library
			</p>
			<h1 class="font-display text-3xl font-bold text-gold-bright sm:text-4xl">
				Sign in to enter your library.
			</h1>
			<p class="font-body text-base leading-7 text-text-secondary">
				Spellbook keeps your catalog search and owned card ledger behind a personal sign-in.
			</p>
			<div class="mt-2 flex justify-center">
				<a
					href={`/auth/login?returnTo=${encodeURIComponent('/')}`}
					class="inline-flex rounded-lg px-6 py-3 font-display text-xs uppercase tracking-[0.24em] text-text-on-gold no-underline bg-linear-to-br from-gold-dim to-gold border border-gold-bright"
				>
					Sign In
				</a>
			</div>
		</section>
	{:else}
		<header class="flex flex-col gap-2">
			<p class="font-mono text-[11px] uppercase tracking-[0.3em] text-text-secondary">
				{gameLabel} Library
			</p>
			<h1 class="font-display text-2xl font-bold text-gold-bright sm:text-3xl">
				Your {gameLabel} library
			</h1>
			<p class="font-body text-base leading-7 text-text-secondary">
				Search the catalog, track what you own.
			</p>
		</header>

		<form onsubmit={handleSubmit} class="relative" role="search" aria-label="Search catalog">
			<span
				class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-muted"
				aria-hidden="true"
			>
				&#128269;
			</span>
			<input
				bind:this={inputEl}
				bind:value={query}
				type="search"
				name="q"
				autocomplete="off"
				placeholder="Search cards, sets, or oracle text..."
				aria-label="Search cards, sets, or oracle text"
				class="search-input w-full rounded-lg py-3 pl-11 pr-20 font-body text-base text-text-primary placeholder:italic placeholder:text-text-muted focus:outline-none bg-crypt border border-gold/30"
			/>
			<span
				class="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 items-center gap-1 font-mono text-[10px] text-text-muted sm:flex"
			>
				<kbd class="rounded bg-slate px-1.5 py-0.5">&#8984;K</kbd>
			</span>
		</form>

		{#if stats.total === 0}
			<p class="font-body text-sm leading-7 text-text-secondary">
				You haven't added any cards yet. Try searching for one to start your library.
			</p>
		{:else}
			<p class="font-mono text-[12px] text-text-secondary">
				{stats.total}
				{stats.total === 1 ? 'card' : 'cards'} &middot; {stats.unique} unique &middot; {setsCompleteLabel}
				&middot;
				<a
					href="/inventory"
					class="text-gold-bright no-underline transition-colors hover:text-amber"
				>
					Inventory &#8594;
				</a>
			</p>
		{/if}

		{#if recentAdditions.length > 0}
			<section class="flex flex-col gap-4">
				<OrnamentalDivider />
				<div class="flex items-baseline justify-between gap-4">
					<h2 class="font-display text-lg text-text-primary">Recent additions</h2>
					<a
						href="/inventory"
						class="font-display text-[11px] uppercase tracking-[0.24em] text-text-secondary no-underline transition-colors hover:text-gold-bright"
					>
						View all &#8594;
					</a>
				</div>
				<CardGrid cards={recentAdditions} />
			</section>
		{/if}

		<nav
			class="mt-2 flex flex-wrap gap-x-6 gap-y-2 font-display text-[11px] uppercase tracking-[0.24em] text-text-secondary"
			aria-label="Quick links"
		>
			<a href="/inventory" class="no-underline transition-colors hover:text-gold-bright">
				Inventory
			</a>
			<span class="text-text-muted">Scan (soon)</span>
		</nav>
	{/if}
</div>
