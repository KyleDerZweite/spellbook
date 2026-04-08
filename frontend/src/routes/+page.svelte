<script lang="ts">
	import { page } from '$app/state';

	const gameCards = [
		{
			id: 'mtg',
			href: '/mtg/',
			name: 'Magic: The Gathering',
			tagline: 'Live now',
			description:
				'Search the full MTG catalog, track owned cards, build decks, and arrange a living spellbook.',
			accent: 'var(--color-gold)',
			available: true
		},
		{
			id: 'pokemon',
			href: '/pokemon/',
			name: 'Pokemon',
			tagline: 'Coming next',
			description: 'Prepared in the route and product model, but not catalog-backed yet.',
			accent: 'var(--color-mana-red)',
			available: false
		},
		{
			id: 'yugioh',
			href: '/yugioh/',
			name: 'Yu-Gi-Oh!',
			tagline: 'Planned',
			description:
				'Will get its own search vocabulary, card metadata, and deck flow when the adapter lands.',
			accent: 'var(--color-mana-blue)',
			available: false
		}
	] as const;

	const isAuthenticated = $derived(Boolean(page.data.user));

	function getEntryHref(game: (typeof gameCards)[number]): string | undefined {
		if (!game.available) {
			return undefined;
		}

		return isAuthenticated ? game.href : `/auth/login?returnTo=${encodeURIComponent(game.href)}`;
	}
</script>

<svelte:head>
	<title>Spellbook | Choose Your Game</title>
</svelte:head>

<div class="relative overflow-hidden">
	<div
		class="relative mx-auto flex min-h-[calc(100vh-8rem)] max-w-6xl flex-col justify-center px-6 py-12 sm:px-8 lg:px-12"
	>
		<div class="max-w-3xl">
			<p class="font-mono text-xs uppercase tracking-[0.35em] text-gold-dim">Spellbook Platform</p>
			<h1 class="mt-4 font-display text-4xl font-bold text-gold-bright sm:text-5xl lg:text-6xl">
				Choose the card game you want to inhabit.
			</h1>
			<p class="mt-4 max-w-2xl font-body text-base leading-7 text-text-secondary sm:text-lg">
				Spellbook is now structured as a game-scoped product. MTG is the first live experience.
				Pokemon and Yu-Gi-Oh! already have reserved entry points so their search and inventory
				models can diverge cleanly when they arrive.
			</p>
		</div>

		<div class="mt-10 grid gap-5 lg:grid-cols-[1.35fr_0.85fr_0.85fr]">
			{#each gameCards as game}
				<a
					href={getEntryHref(game)}
					class="group relative overflow-hidden rounded-lg p-6 no-underline transition-transform duration-200 {game.available
						? 'hover:-translate-y-1'
						: 'cursor-default'}"
					style="
						background:
							linear-gradient(160deg, rgba(24, 20, 28, 0.92), rgba(13, 11, 15, 0.96)),
							radial-gradient(circle at top right, color-mix(in srgb, {game.accent} 22%, transparent), transparent 45%);
						border: 1px solid color-mix(in srgb, {game.accent} 32%, rgba(255,255,255,0.08));
						box-shadow:
							inset 0 1px 0 rgba(255,255,255,0.04),
							0 30px 60px rgba(6, 5, 8, 0.35);
					"
				>
					<div
						class="absolute inset-x-0 top-0 h-1"
						style="background: linear-gradient(90deg, transparent, {game.accent}, transparent);"
					></div>
					<div class="flex items-start justify-between gap-4">
						<div>
							<p
								class="font-display text-xs uppercase tracking-[0.26em]"
								style="color: {game.accent};"
							>
								{game.tagline}
							</p>
							<h2 class="mt-3 font-display text-2xl font-bold text-text-primary">
								{game.name}
							</h2>
						</div>
						<span
							class="rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-[0.25em]"
							style="
								background-color: rgba(28, 23, 32, 0.72);
								border: 1px solid color-mix(in srgb, {game.accent} 45%, transparent);
								color: {game.available ? game.accent : 'var(--color-text-muted)'};
							"
						>
							{game.available ? (isAuthenticated ? 'Enter' : 'Sign In') : 'Reserved'}
						</span>
					</div>
					<p class="mt-6 font-body leading-7 text-text-secondary">{game.description}</p>

					{#if game.available}
						<div
							class="mt-8 flex items-center gap-3 font-display text-sm uppercase tracking-[0.24em] text-gold-bright"
						>
							{isAuthenticated ? 'Enter MTG' : 'Sign In to Enter'}
							<span class="transition-transform duration-150 group-hover:translate-x-1"
								>&#8594;</span
							>
						</div>
					{:else}
						<div class="mt-8 font-display text-sm uppercase tracking-[0.24em] text-text-muted">
							Catalog adapter not connected yet
						</div>
					{/if}
				</a>
			{/each}
		</div>
	</div>
</div>
