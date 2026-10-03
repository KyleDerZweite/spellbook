<script lang="ts">
	import { page } from '$app/state';
	import { asset } from '$app/paths';
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

<div class="home-workspace">
	<section class="workspace-entry panel">
		<div class="entry-content">
			<h1>{isAuthenticated ? 'Your workspace' : 'Spellbook'}</h1>
			{#if isAuthenticated}
				<form
					method="GET"
					action="/search"
					role="search"
					aria-label="Search catalog"
					class="workspace-search"
				>
					<label for="workspace-search" class="sr-only">Search Magic cards</label>
					<input
						bind:this={inputEl}
						id="workspace-search"
						name="q"
						type="search"
						autocomplete="off"
						placeholder="Search cards by name or rules text"
						class="input"
					/>
					<button type="submit" class="btn btn-primary">Search</button>
				</form>
			{:else}
				<div class="account-actions">
					<a href="/auth/register" class="btn btn-primary">Create account</a><a
						href="/auth/login"
						class="btn btn-secondary">Sign in</a
					>
				</div>
			{/if}
			<nav class="workspace-actions" aria-label="Workspace">
				<a href="/decks"
					><svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						aria-hidden="true"><path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5" /></svg
					><span>Deck builder</span></a
				>
				<a href="/search"
					><svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg
					><span>Card search</span></a
				>
				<a href="/inventory"
					><svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						aria-hidden="true"
						><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M4 10h16M10 10v10" /></svg
					><span>Inventory</span></a
				>
				<a href="/scan"
					><svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M7 12h10" /></svg
					><span>Scan review</span></a
				>
			</nav>
		</div>
		<div class="entry-art" aria-hidden="true">
			<img
				src={asset('brand/card-box.webp')}
				alt=""
				width="1200"
				height="1000"
				fetchpriority="high"
			/>
		</div>
	</section>
	{#if isAuthenticated}
		<dl class="workspace-stats">
			<div class="panel">
				<dt>Cards</dt>
				<dd>{stats.total.toLocaleString()}</dd>
			</div>
			<div class="panel">
				<dt>Unique cards</dt>
				<dd>{stats.unique.toLocaleString()}</dd>
			</div>
			<div class="panel">
				<dt>Sets</dt>
				<dd>{stats.sets.toLocaleString()}</dd>
			</div>
		</dl>
	{/if}
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

<style>
	.home-workspace {
		width: 100%;
		max-width: 1280px;
		margin: 0 auto;
		padding: 2rem 1.5rem;
		display: grid;
		gap: 1rem;
	}
	.workspace-entry {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 300px;
		overflow: hidden;
		min-height: 300px;
		background:
			radial-gradient(
				ellipse at 100% 50%,
				color-mix(in srgb, var(--color-primary) 5%, transparent),
				transparent 60%
			),
			var(--color-card);
	}
	.entry-content {
		padding: 2rem;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 1.5rem;
		min-width: 0;
	}
	h1 {
		font-size: 1.4rem;
		line-height: 1.3;
		font-weight: 650;
		margin: 0;
	}
	.workspace-search {
		display: flex;
		gap: 0.5rem;
	}
	.workspace-search input {
		min-width: 0;
		flex: 1;
	}
	.account-actions {
		display: flex;
		gap: 0.5rem;
	}
	.workspace-actions {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.5rem;
	}
	.workspace-actions a {
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.65rem;
		border: 1px solid var(--color-border);
		border-radius: 0.6rem;
		padding: 0.9rem 0.7rem;
		text-decoration: none;
		color: var(--color-text-primary);
		background: color-mix(in srgb, var(--color-background) 50%, transparent);
		font-size: 0.75rem;
		transition:
			border-color 150ms,
			background-color 150ms;
	}
	.workspace-actions a:hover {
		border-color: var(--color-primary);
		background: var(--color-muted);
	}
	.workspace-actions svg {
		width: 21px;
		height: 21px;
		color: var(--color-primary);
	}
	.workspace-actions a:nth-child(2) svg {
		color: var(--color-accentblue);
	}
	.workspace-actions a:nth-child(3) svg {
		color: var(--color-accentviolet);
	}
	.entry-art {
		align-self: center;
		position: relative;
	}
	.entry-art img {
		display: block;
		width: 100%;
		height: auto;
		object-fit: contain;
	}
	.workspace-stats {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.75rem;
		margin: 0;
	}
	.workspace-stats > div {
		padding: 1rem 1.2rem;
	}
	.workspace-stats dt {
		color: var(--color-text-secondary);
		font-size: 0.75rem;
	}
	.workspace-stats dd {
		margin: 0.4rem 0 0;
		font-size: 1.35rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	@media (max-width: 1000px) {
		.workspace-entry {
			grid-template-columns: minmax(0, 1fr) 230px;
		}
		.entry-content {
			padding: 1.5rem;
		}
	}
	@media (max-width: 700px) {
		.home-workspace {
			padding: 1rem;
		}
		.workspace-entry {
			grid-template-columns: 1fr;
		}
		.entry-art {
			grid-row: 1;
			width: 180px;
			margin: 0.5rem auto -1rem;
		}
		.entry-content {
			padding: 1.25rem;
			gap: 1rem;
		}
		.workspace-actions {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.workspace-actions a {
			flex-direction: row;
			align-items: center;
			padding: 0.85rem;
		}
		.workspace-stats > div {
			padding: 0.85rem 0.75rem;
		}
		.workspace-stats dd {
			font-size: 1.1rem;
		}
	}
</style>
