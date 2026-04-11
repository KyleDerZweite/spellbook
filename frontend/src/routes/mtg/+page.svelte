<script lang="ts">
	import { spacetimeState } from '$lib/spacetimedb/state.svelte';

	const MTG_ROUTE_CARDS = [
		{
			href: '/mtg/search',
			title: 'Catalog Search',
			description: 'Find exact printings fast, then send them straight into your owned inventory.',
			eyebrow: 'Scryfall-backed'
		},
		{
			href: '/mtg/inventory',
			title: 'Inventory',
			description: 'Track what you own and inspect set completion progress.',
			eyebrow: 'Owned ledger'
		},
		{
			href: '/mtg/decks',
			title: 'Deck Studio',
			description:
				'Build decks from owned cards and compare required counts against your MTG inventory.',
			eyebrow: 'First-class decks'
		}
	] as const;

	let stats = $derived(spacetimeState.getInventoryStats('mtg'));
	let decks = $derived(spacetimeState.getDecks('mtg').slice(0, 3));
</script>

<svelte:head>
	<title>MTG | Spellbook</title>
</svelte:head>

<div class="relative overflow-hidden">
	<div class="relative mx-auto flex max-w-6xl flex-col gap-10 px-6 py-10 sm:px-8 lg:px-12">
		<section
			class="overflow-hidden rounded-lg p-8 sm:p-10"
			style="
				background:
					linear-gradient(145deg, rgba(26, 20, 28, 0.94), rgba(13, 11, 15, 0.96)),
					radial-gradient(circle at 75% 20%, rgba(196, 146, 42, 0.26), transparent 28%);
				border: 1px solid rgba(196, 146, 42, 0.26);
				box-shadow: inset 0 1px 0 rgba(255,255,255,0.04), 0 40px 80px rgba(8, 7, 10, 0.35);
			"
		>
			<p class="font-mono text-xs uppercase tracking-[0.34em] text-gold-dim">
				Magic: The Gathering
			</p>
			<h1 class="mt-4 max-w-3xl font-display text-4xl font-bold text-gold-bright sm:text-5xl">
				The MTG wing is now inventory-first.
			</h1>
			<p class="mt-4 max-w-3xl font-body text-base leading-7 text-text-secondary sm:text-lg">
				Search the full catalog, capture owned printings into one canonical MTG inventory, then
				build decks without losing sight of what you actually own.
			</p>

			<div class="mt-8 grid gap-4 sm:grid-cols-3">
				<div class="rounded px-4 py-4 bg-stone/72 border border-gold/14">
					<p class="font-mono text-2xl text-gold-bright">{stats.total}</p>
					<p class="mt-1 font-body text-xs uppercase tracking-[0.2em] text-text-secondary">
						Owned Cards
					</p>
				</div>
				<div class="rounded px-4 py-4 bg-stone/72 border border-gold/14">
					<p class="font-mono text-2xl text-gold-bright">{stats.unique}</p>
					<p class="mt-1 font-body text-xs uppercase tracking-[0.2em] text-text-secondary">
						Unique Cards
					</p>
				</div>
				<div class="rounded px-4 py-4 bg-stone/72 border border-gold/14">
					<p class="font-mono text-2xl text-gold-bright">{spacetimeState.getDecks('mtg').length}</p>
					<p class="mt-1 font-body text-xs uppercase tracking-[0.2em] text-text-secondary">Decks</p>
				</div>
			</div>
		</section>

		<section class="grid gap-5 lg:grid-cols-[1.3fr_0.7fr]">
			<div class="grid gap-5">
				{#each MTG_ROUTE_CARDS as card}
					<a
						href={card.href}
						class="group rounded-lg p-6 no-underline transition-transform duration-200 hover:-translate-y-1"
						style="
							background: linear-gradient(145deg, rgba(24, 20, 28, 0.95), rgba(15, 12, 18, 0.95));
							border: 1px solid rgba(196, 146, 42, 0.18);
							box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
						"
					>
						<p class="font-display text-xs uppercase tracking-[0.24em] text-gold-dim">
							{card.eyebrow}
						</p>
						<h2 class="mt-3 font-display text-2xl font-bold text-text-primary">{card.title}</h2>
						<p class="mt-3 font-body leading-7 text-text-secondary">{card.description}</p>
						<div class="mt-6 font-display text-sm uppercase tracking-[0.24em] text-gold-bright">
							Open
							<span
								class="ml-2 inline-block transition-transform duration-150 group-hover:translate-x-1"
								>&#8594;</span
							>
						</div>
					</a>
				{/each}
			</div>

			<div
				class="rounded-lg p-6"
				style="
					background: linear-gradient(180deg, rgba(22, 18, 25, 0.96), rgba(13, 11, 15, 0.96));
					border: 1px solid rgba(196, 146, 42, 0.18);
				"
			>
				<p class="font-display text-xs uppercase tracking-[0.24em] text-gold-dim">Recent Decks</p>
				{#if decks.length > 0}
					<div class="mt-5 flex flex-col gap-3">
						{#each decks as deck}
							<a
								href="/mtg/decks"
								class="rounded px-4 py-4 no-underline transition-colors hover:bg-mist bg-stone/58 border border-gold/12"
							>
								<p class="font-display text-lg font-bold text-text-primary">{deck.name}</p>
								<p class="mt-1 font-body text-sm text-text-secondary">
									{deck.format || 'Casual'} deck
								</p>
							</a>
						{/each}
					</div>
				{:else}
					<p class="mt-5 font-body text-sm leading-7 text-text-secondary">
						No decks yet. Start with catalog search or head straight to the deck studio to create
						your first list.
					</p>
				{/if}
			</div>
		</section>
	</div>
</div>
