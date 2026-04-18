<script lang="ts">
	import { spacetimeState } from '$lib/spacetimedb/state.svelte';

	// Decks is implemented but intentionally hidden from the hub while
	// search, inventory, and scan are the product focus. Direct URL still works.
	// Scan has no frontend surface yet; it is shown here as "Coming soon" so
	// users see the intended pillar set.
	const MTG_ROUTE_CARDS = [
		{
			href: '/mtg/search',
			title: 'Catalog Search',
			description: 'Find exact printings fast, then send them straight into your owned inventory.',
			eyebrow: 'Scryfall-backed',
			available: true
		},
		{
			href: '/mtg/inventory',
			title: 'Inventory',
			description: 'Track what you own and inspect set completion progress.',
			eyebrow: 'Owned ledger',
			available: true
		},
		{
			href: undefined,
			title: 'Scan',
			description:
				'Capture cards with your camera and review candidates before anything lands in inventory.',
			eyebrow: 'Coming soon',
			available: false
		}
	] as const;

	let stats = $derived(spacetimeState.getInventoryStats('mtg'));
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
				Search the full catalog and capture owned printings into one canonical MTG inventory. Scan
				support is coming next.
			</p>

			<div class="mt-8 grid gap-4 sm:grid-cols-2">
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
			</div>
		</section>

		<section class="grid gap-5">
			{#each MTG_ROUTE_CARDS as card}
				{@const baseClass = 'group rounded-lg p-6 no-underline transition-transform duration-200'}
				{@const interactiveClass = card.available
					? 'hover:-translate-y-1'
					: 'cursor-default opacity-70'}
				{#if card.available && card.href}
					<a
						href={card.href}
						class="{baseClass} {interactiveClass}"
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
				{:else}
					<div
						class="{baseClass} {interactiveClass}"
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
						<div class="mt-6 font-display text-sm uppercase tracking-[0.24em] text-text-muted">
							In progress
						</div>
					</div>
				{/if}
			{/each}
		</section>
	</div>
</div>
