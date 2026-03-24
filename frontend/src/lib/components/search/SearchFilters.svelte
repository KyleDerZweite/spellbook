<script lang="ts">
	import { Collapsible } from 'bits-ui';
	import type { SearchFilterState } from '$lib/search/filters.svelte';
	import type { ManaColor, Rarity } from '$lib/search/types';
	import OrnamentalDivider from '$lib/components/layout/OrnamentalDivider.svelte';

	interface Props {
		filters: SearchFilterState;
		class?: string;
	}

	let { filters, class: className = '' }: Props = $props();

	let colorsOpen = $state(true);
	let rarityOpen = $state(true);

	const MANA_COLORS: { id: ManaColor; label: string; bg: string; text: string }[] = [
		{ id: 'W', label: 'White', bg: 'var(--color-mana-white)', text: '#1a1208' },
		{ id: 'U', label: 'Blue', bg: 'var(--color-mana-blue)', text: '#e8dfc8' },
		{ id: 'B', label: 'Black', bg: 'var(--color-mana-black)', text: '#e8dfc8' },
		{ id: 'R', label: 'Red', bg: 'var(--color-mana-red)', text: '#e8dfc8' },
		{ id: 'G', label: 'Green', bg: 'var(--color-mana-green)', text: '#e8dfc8' },
		{ id: 'C', label: 'Colorless', bg: 'var(--color-mana-colorless)', text: '#1a1208' }
	];

	const RARITIES: { id: Rarity; label: string; color: string }[] = [
		{ id: 'common', label: 'Common', color: 'var(--color-rarity-common)' },
		{ id: 'uncommon', label: 'Uncommon', color: 'var(--color-rarity-uncommon)' },
		{ id: 'rare', label: 'Rare', color: 'var(--color-rarity-rare)' },
		{ id: 'mythic', label: 'Mythic', color: 'var(--color-rarity-mythic)' }
	];
</script>

<aside
	class="flex flex-col gap-4 {className}"
	style="min-width: 220px; max-width: 280px;"
>
	<!-- Colors section -->
	<Collapsible.Root bind:open={colorsOpen}>
		<Collapsible.Trigger
			class="flex w-full cursor-pointer items-center justify-between border-none bg-transparent py-2 font-display text-sm uppercase tracking-widest text-text-secondary transition-colors hover:text-text-primary"
		>
			<span>Colors</span>
			<span
				class="inline-block transition-transform duration-200"
				style:transform={colorsOpen ? 'rotate(180deg)' : 'rotate(0deg)'}
			>
				&#9660;
			</span>
		</Collapsible.Trigger>
		<Collapsible.Content>
			<div class="flex flex-wrap gap-2 pt-2">
				{#each MANA_COLORS as color}
					<button
						onclick={() => filters.toggleColor(color.id)}
						class="flex h-9 w-9 items-center justify-center rounded-full font-mono text-xs font-medium transition-all duration-150"
						style="
							background-color: {color.bg};
							color: {color.text};
							border: 2px solid {filters.selectedColors.has(color.id) ? 'var(--color-gold-bright)' : 'transparent'};
							box-shadow: {filters.selectedColors.has(color.id) ? '0 0 8px rgba(232, 184, 75, 0.4)' : 'none'};
							opacity: {filters.selectedColors.has(color.id) ? '1' : '0.7'};
						"
						title={color.label}
						aria-pressed={filters.selectedColors.has(color.id)}
					>
						{color.id}
					</button>
				{/each}
			</div>
		</Collapsible.Content>
	</Collapsible.Root>

	<OrnamentalDivider />

	<!-- Rarity section -->
	<Collapsible.Root bind:open={rarityOpen}>
		<Collapsible.Trigger
			class="flex w-full cursor-pointer items-center justify-between border-none bg-transparent py-2 font-display text-sm uppercase tracking-widest text-text-secondary transition-colors hover:text-text-primary"
		>
			<span>Rarity</span>
			<span
				class="inline-block transition-transform duration-200"
				style:transform={rarityOpen ? 'rotate(180deg)' : 'rotate(0deg)'}
			>
				&#9660;
			</span>
		</Collapsible.Trigger>
		<Collapsible.Content>
			<div class="flex flex-col gap-1.5 pt-2">
				{#each RARITIES as rarity}
					<button
						onclick={() => filters.toggleRarity(rarity.id)}
						class="flex items-center gap-2.5 rounded px-2 py-1.5 font-body text-sm transition-all duration-150
							{filters.selectedRarities.has(rarity.id)
							? 'text-text-primary'
							: 'text-text-secondary hover:text-text-primary'}"
						style="
							background-color: {filters.selectedRarities.has(rarity.id) ? 'var(--color-mist)' : 'transparent'};
							border: none;
							cursor: pointer;
						"
						aria-pressed={filters.selectedRarities.has(rarity.id)}
					>
						<span
							class="inline-block h-2.5 w-2.5 rounded-full"
							style="background-color: {rarity.color};"
						></span>
						{rarity.label}
					</button>
				{/each}
			</div>
		</Collapsible.Content>
	</Collapsible.Root>

	<!-- Clear filters -->
	{#if filters.hasFilters}
		<OrnamentalDivider />
		<button
			onclick={() => filters.clear()}
			class="cursor-pointer rounded border bg-transparent px-3 py-1.5 font-display text-xs uppercase tracking-wider text-gold-bright transition-all duration-150 hover:bg-mist"
			style="border-color: rgba(196, 146, 42, 0.5);"
		>
			Clear Filters
		</button>
	{/if}
</aside>
