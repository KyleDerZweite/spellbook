<script lang="ts">
	import { dev } from '$app/env';
	import PublicLanding from '#lib/components/showcase/PublicLanding.svelte';
	import { page } from '$app/state';
	import CardGrid from '#lib/components/cards/CardGrid.svelte';
	import type { CardDocument } from '#lib/search/types.ts';
	import { SITE_NAME, pageMetadata } from '#lib/seo/site.ts';

	let inputEl: HTMLInputElement | null = $state(null);
	const isAuthenticated = $derived(Boolean(page.data.user));
	const isLandingReview = $derived(dev && page.url.searchParams.get('review') === 'landing');
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

<div
	class:home-workspace={isAuthenticated && !isLandingReview}
	class:public-home={!isAuthenticated || isLandingReview}
>
	{#if isAuthenticated && !isLandingReview}
		<header class="dashboard-header">
			<div class="page-title">
				<h1>Your cards</h1>
			</div>
			<a href="/mtg/scan" class="btn btn-secondary">Scan cards</a>
		</header>
		<form
			method="GET"
			action="/mtg/search"
			role="search"
			aria-label="Search catalog"
			class="dashboard-search"
		>
			<label for="workspace-search" class="sr-only">Search Magic cards</label><svg
				aria-hidden="true"
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.6"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg
			>
			<input
				bind:this={inputEl}
				id="workspace-search"
				name="q"
				type="search"
				placeholder="Search Magic cards by name or rules text"
				autocomplete="off"
			/><kbd>⌘ / Ctrl K</kbd><button class="btn btn-primary">Search cards</button>
		</form>
		<dl class="inventory-totals">
			<div>
				<dd>{stats.total.toLocaleString()}</dd>
				<dt>{stats.total === 1 ? 'card owned' : 'cards owned'}</dt>
			</div>
			<div>
				<dd>{stats.unique.toLocaleString()}</dd>
				<dt>{stats.unique === 1 ? 'unique card' : 'unique cards'}</dt>
			</div>
			<div>
				<dd>{stats.sets.toLocaleString()}</dd>
				<dt>{stats.sets === 1 ? 'set' : 'sets'}</dt>
			</div>
			<a href="/mtg/inventory">Open inventory <span aria-hidden="true">→</span></a>
		</dl>
		<div class="dashboard-columns">
			<section class="recent-cards" aria-labelledby="recent-heading">
				<div class="section-heading">
					<h2 id="recent-heading">Recent cards</h2>
					<a href="/mtg/inventory">View all →</a>
				</div>
				{#if recentAdditions.length}<CardGrid
						cards={recentAdditions}
						onSelect={(card) => {
							window.location.href = `/mtg/search?q=${encodeURIComponent(card.name)}`;
						}}
					/>
				{:else}<div class="empty-workspace">
						<svg
							width="48"
							height="48"
							viewBox="0 0 48 48"
							fill="none"
							stroke="currentColor"
							aria-hidden="true"
							><rect x="15" y="7" width="23" height="33" rx="4" /><path
								d="M10 12 5 14l7 30 20-5M22 23h9m-4.5-4.5v9"
							/></svg
						>
						<h3>No cards yet</h3>
						<p>Search for a card to add it.</p>
						<a href="/mtg/search" class="btn btn-primary">Find cards</a>
					</div>{/if}
			</section>
			<aside class="decks-section" aria-labelledby="decks-heading">
				<div class="section-heading">
					<h2 id="decks-heading">Decks</h2>
					<a href="/mtg/decks">Open builder →</a>
				</div>
				{#each page.data.recentDecks as deck}<a
						class="deck-link"
						href={`/mtg/decks?deck=${deck.id}`}
						><span class="deck-icon" aria-hidden="true">▱</span><span
							><strong>{deck.name}</strong><small>{deck.format}</small></span
						><span aria-hidden="true">→</span></a
					>
				{:else}<div class="deck-empty">
						<h3>No decks yet</h3>
						<p>Create a deck or import a decklist.</p>
						<a class="btn btn-secondary" href="/mtg/decks">Create a deck</a>
					</div>{/each}
				<a href="/mtg/scan" class="scan-link"
					><svg
						width="22"
						height="22"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M7 12h10" /></svg
					><span><strong>Scan cards</strong><small>Upload and review a photo.</small></span><span
						aria-hidden="true">→</span
					></a
				>
			</aside>
		</div>
	{:else}
		<PublicLanding />
	{/if}
</div>

<style>
	.public-home {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
	}
	.home-workspace {
		max-width: 1440px;
		margin: auto;
		padding: 2rem 2.5rem 3rem;
	}
	.section-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1.25rem;
	}
	.section-heading h2 {
		font-size: 1rem;
		font-weight: 600;
		letter-spacing: -0.02em;
	}
	.section-heading a {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		text-decoration: none;
		white-space: nowrap;
	}
	.section-heading a:hover {
		color: var(--color-primary);
	}
	.dashboard-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}
	.dashboard-search {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		border: 1px solid var(--color-input);
		border-radius: 0.75rem;
		padding: 0.5rem 0.5rem 0.5rem 1rem;
		background: var(--color-surface);
	}
	.dashboard-search svg {
		color: var(--color-text-muted);
		flex-shrink: 0;
	}
	.dashboard-search input {
		flex: 1;
		min-width: 0;
		background: transparent;
		border: 0;
		padding: 0.65rem 0.25rem;
		font-size: 0.95rem;
	}
	.dashboard-search kbd {
		font-size: 0.65rem;
		color: var(--color-text-muted);
		padding: 0.2rem 0.4rem;
		border: 1px solid var(--color-border);
		border-radius: 4px;
	}
	.inventory-totals {
		display: flex;
		align-items: center;
		gap: 2rem;
		padding: 1.5rem 0;
		margin-bottom: 1rem;
		border-bottom: 1px solid var(--color-border);
	}
	.inventory-totals > div {
		display: flex;
		gap: 0.5rem;
		align-items: baseline;
	}
	.inventory-totals dd {
		font-weight: 650;
		font-size: 1.3rem;
		font-variant-numeric: tabular-nums;
	}
	.inventory-totals dt {
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}
	.inventory-totals > a {
		margin-left: auto;
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		text-decoration: none;
	}
	.dashboard-columns {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 300px;
		gap: 2rem;
		padding-top: 1rem;
	}
	.recent-cards {
		min-width: 0;
	}
	.empty-workspace {
		border: 1px dashed var(--color-border);
		border-radius: 0.75rem;
		padding: 3rem 1.5rem;
		text-align: center;
	}
	.empty-workspace svg {
		margin: 0 auto 1rem;
		color: var(--color-text-muted);
	}
	.empty-workspace h3,
	.deck-empty h3 {
		font-size: 1rem;
		font-weight: 550;
	}
	.empty-workspace p,
	.deck-empty p {
		font-size: 0.8rem;
		line-height: 1.7;
		color: var(--color-text-muted);
		margin: 0.5rem auto 1.25rem;
		max-width: 25rem;
	}
	.deck-empty {
		border: 1px solid var(--color-border);
		padding: 1.25rem;
		border-radius: 0.75rem;
	}
	.deck-link {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		padding: 1rem 0;
		border-bottom: 1px solid var(--color-border);
		color: var(--color-text-primary);
		text-decoration: none;
	}
	.deck-icon {
		width: 42px;
		height: 48px;
		display: grid;
		place-items: center;
		border-radius: 5px;
		background: var(--color-muted);
		color: var(--color-primary);
		font-size: 2rem;
	}
	.deck-link > span:nth-child(2) {
		flex: 1;
		min-width: 0;
	}
	.deck-link strong,
	.scan-link strong {
		display: block;
		font-size: 0.85rem;
		font-weight: 550;
		overflow-wrap: anywhere;
	}
	.deck-link small,
	.scan-link small {
		display: block;
		font-size: 0.7rem;
		color: var(--color-text-muted);
		margin-top: 0.3rem;
	}
	.deck-link:hover strong {
		color: var(--color-primary);
	}
	.scan-link {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-top: 1.5rem;
		padding: 1.25rem;
		background: var(--color-surface);
		border-radius: 0.75rem;
		color: var(--color-text-secondary);
		text-decoration: none;
	}
	.scan-link svg {
		flex-shrink: 0;
	}
	@media (max-width: 1000px) {
		.home-workspace {
			padding: 1.5rem;
		}
		.dashboard-columns {
			grid-template-columns: 1fr 260px;
			gap: 1.5rem;
		}
	}
	@media (max-width: 700px) {
		.home-workspace {
			padding: 1.25rem 1rem 2rem;
		}
		.section-heading {
			align-items: flex-start;
			flex-wrap: wrap;
			gap: 0.65rem;
		}
		.dashboard-columns {
			grid-template-columns: 1fr;
		}
		.dashboard-search {
			flex-wrap: wrap;
		}
		.dashboard-search kbd {
			display: none;
		}
		.dashboard-search input {
			font-size: 1rem;
		}
		.dashboard-search button {
			width: 100%;
		}
		.inventory-totals {
			gap: 0.75rem;
			flex-wrap: wrap;
		}
		.inventory-totals > div {
			flex-direction: column;
			gap: 0;
			flex: 1;
		}
		.inventory-totals > a {
			width: 100%;
			margin: 0.5rem 0 0;
		}
	}
</style>
