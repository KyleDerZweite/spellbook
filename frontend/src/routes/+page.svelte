<script lang="ts">
	import { goto } from '$app/navigation';
	import OrnamentalDivider from '$lib/components/layout/OrnamentalDivider.svelte';
	import { spacetimeState } from '$lib/spacetimedb/state.svelte';

	let quickSearch = $state('');

	function handleSearchSubmit() {
		if (quickSearch.trim().length >= 2) {
			goto(`/search?q=${encodeURIComponent(quickSearch.trim())}`);
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			handleSearchSubmit();
		}
	}

	let stats = $derived(spacetimeState.globalStats);
	let recentCollections = $derived(
		[...spacetimeState.collections]
			.sort((a, b) => Number(b.createdAt) - Number(a.createdAt))
			.slice(0, 3)
	);

	// Accent colors for collection tiles
	const ACCENT_COLORS = [
		'var(--color-gold)',
		'var(--color-mana-blue)',
		'var(--color-mana-green)'
	];
</script>

<div class="flex flex-col items-center px-6 py-12">
	<!-- Welcome -->
	<div class="mb-8 text-center">
		{#if spacetimeState.userProfile}
			<p class="mb-2 font-body text-sm text-text-secondary">
				Welcome back, {spacetimeState.userProfile.username}
			</p>
		{/if}
		<h1
			class="font-display text-4xl font-bold text-gold-bright"
			style="text-shadow: 0 0 24px rgba(232, 184, 75, 0.25);"
		>
			SPELLBOOK
		</h1>
		<p class="mt-2 font-body italic text-text-secondary">Your arcane library awaits</p>
	</div>

	<!-- Quick Search -->
	<div class="relative mb-10 w-full max-w-xl">
		<span
			class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg text-text-muted"
			aria-hidden="true"
		>
			&#128269;
		</span>
		<input
			type="text"
			bind:value={quickSearch}
			onkeydown={handleKeydown}
			placeholder="Search the multiverse..."
			class="w-full rounded-sm py-3.5 pl-12 pr-4 font-body text-lg text-text-primary placeholder:italic placeholder:text-text-muted focus:outline-none"
			style="
				background-color: var(--color-stone);
				border: 1px solid rgba(196, 146, 42, 0.3);
				box-shadow: 0 0 32px rgba(196, 146, 42, 0.08);
			"
			onfocus={(e: FocusEvent) => { const el = e.currentTarget as HTMLInputElement; el.style.borderColor = 'var(--color-gold)'; el.style.boxShadow = '0 0 32px rgba(196, 146, 42, 0.15), 0 0 0 2px rgba(196, 146, 42, 0.15)'; }}
			onblur={(e: FocusEvent) => { const el = e.currentTarget as HTMLInputElement; el.style.borderColor = 'rgba(196, 146, 42, 0.3)'; el.style.boxShadow = '0 0 32px rgba(196, 146, 42, 0.08)'; }}
		/>
	</div>

	<!-- Connection status -->
	<div class="mb-8 flex items-center gap-2">
		<span
			class="inline-block h-2 w-2 rounded-full"
			style="background-color: {spacetimeState.connected ? 'var(--color-success)' : 'var(--color-error)'};"
		></span>
		<span class="font-body text-xs text-text-muted">
			{spacetimeState.connected ? 'Connected to SpacetimeDB' : 'Disconnected'}
		</span>
		{#if spacetimeState.error}
			<span class="font-body text-xs text-error">({spacetimeState.error})</span>
		{/if}
	</div>

	<!-- Stats -->
	{#if stats.totalCards > 0}
		<div class="mb-8 flex items-center gap-10">
			<div class="text-center">
				<p class="font-mono text-2xl font-medium text-gold-bright">{stats.totalCards}</p>
				<p class="font-body text-xs text-text-secondary">Total Cards</p>
			</div>
			<div class="text-center">
				<p class="font-mono text-2xl font-medium text-gold-bright">{stats.uniqueCards}</p>
				<p class="font-body text-xs text-text-secondary">Unique Cards</p>
			</div>
			<div class="text-center">
				<p class="font-mono text-2xl font-medium text-gold-bright">{stats.totalCollections}</p>
				<p class="font-body text-xs text-text-secondary">Collections</p>
			</div>
		</div>
	{/if}

	<!-- Recent Collections -->
	{#if recentCollections.length > 0}
		<OrnamentalDivider class="mb-6 w-full max-w-xl" />

		<h2 class="mb-4 font-display text-sm uppercase tracking-widest text-text-secondary">
			Recent Collections
		</h2>

		<div class="grid w-full max-w-xl gap-4" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));">
			{#each recentCollections as collection, i (collection.id)}
				{@const collStats = spacetimeState.getCollectionStats(collection.id)}
				<a
					href="/collections/{collection.id}"
					class="group flex flex-col overflow-hidden rounded no-underline transition-all duration-200"
					style="
						background-color: var(--color-stone);
						border: 1px solid rgba(196, 146, 42, 0.22);
						border-radius: 4px;
						box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
					"
					onmouseenter={(e) => {
						const el = e.currentTarget as HTMLElement;
						el.style.transform = 'translateY(-2px)';
						el.style.boxShadow = 'inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 4px 16px rgba(138, 106, 42, 0.2)';
						el.style.borderColor = 'rgba(196, 146, 42, 0.4)';
					}}
					onmouseleave={(e) => {
						const el = e.currentTarget as HTMLElement;
						el.style.transform = 'translateY(0)';
						el.style.boxShadow = 'inset 0 1px 0 rgba(255, 255, 255, 0.04)';
						el.style.borderColor = 'rgba(196, 146, 42, 0.22)';
					}}
				>
					<div class="h-1 w-full" style="background-color: {ACCENT_COLORS[i % ACCENT_COLORS.length]};"></div>
					<div class="p-3">
						<h3 class="font-display text-sm font-bold text-text-primary">{collection.name}</h3>
						<p class="mt-1 font-mono text-xs text-text-secondary">
							{collStats.total} cards
						</p>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>
