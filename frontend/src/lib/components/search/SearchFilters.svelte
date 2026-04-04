<script lang="ts">
	import { Collapsible } from 'bits-ui';
	import type { SearchFilterState } from '$lib/search/filters.svelte';
	import type {
		CardType,
		FacetResponse,
		LegalityFormat,
		ManaColor,
		Rarity
	} from '$lib/search/types';
	import OrnamentalDivider from '$lib/components/layout/OrnamentalDivider.svelte';

	interface Props {
		filters: SearchFilterState;
		facets?: FacetResponse | null;
		class?: string;
	}

	let { filters, facets = null, class: className = '' }: Props = $props();

	let colorsOpen = $state(true);
	let rarityOpen = $state(true);
	let typesOpen = $state(false);
	let legalityOpen = $state(false);

	const MANA_COLORS: { id: ManaColor; label: string; msClass: string }[] = [
		{ id: 'W', label: 'White', msClass: 'ms-w' },
		{ id: 'U', label: 'Blue', msClass: 'ms-u' },
		{ id: 'B', label: 'Black', msClass: 'ms-b' },
		{ id: 'R', label: 'Red', msClass: 'ms-r' },
		{ id: 'G', label: 'Green', msClass: 'ms-g' },
		{ id: 'C', label: 'Colorless', msClass: 'ms-c' }
	];

	const RARITIES: { id: Rarity; label: string; color: string }[] = [
		{ id: 'common', label: 'Common', color: 'var(--color-rarity-common)' },
		{ id: 'uncommon', label: 'Uncommon', color: 'var(--color-rarity-uncommon)' },
		{ id: 'rare', label: 'Rare', color: 'var(--color-rarity-rare)' },
		{ id: 'mythic', label: 'Mythic', color: 'var(--color-rarity-mythic)' }
	];

	const CARD_TYPES: { id: CardType; label: string }[] = [
		{ id: 'Creature', label: 'Creature' },
		{ id: 'Instant', label: 'Instant' },
		{ id: 'Sorcery', label: 'Sorcery' },
		{ id: 'Enchantment', label: 'Enchantment' },
		{ id: 'Artifact', label: 'Artifact' },
		{ id: 'Planeswalker', label: 'Planeswalker' },
		{ id: 'Land', label: 'Land' },
		{ id: 'Battle', label: 'Battle' },
		{ id: 'Kindred', label: 'Kindred' }
	];

	const LEGALITY_FORMATS: { id: LegalityFormat; label: string }[] = [
		{ id: 'standard', label: 'Standard' },
		{ id: 'pioneer', label: 'Pioneer' },
		{ id: 'modern', label: 'Modern' },
		{ id: 'legacy', label: 'Legacy' },
		{ id: 'vintage', label: 'Vintage' },
		{ id: 'commander', label: 'Commander' },
		{ id: 'pauper', label: 'Pauper' },
		{ id: 'brawl', label: 'Brawl' }
	];
</script>

<aside class="flex w-full flex-col gap-4 md:w-[240px] md:shrink-0 {className}">
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
						class="flex h-9 w-9 items-center justify-center rounded-full transition-all duration-150"
						style="
							border: 2px solid {filters.selectedColors.has(color.id)
							? 'var(--color-gold-bright)'
							: 'transparent'};
							box-shadow: {filters.selectedColors.has(color.id) ? '0 0 8px rgba(232, 184, 75, 0.4)' : 'none'};
							opacity: {filters.selectedColors.has(color.id) ? '1' : '0.55'};
							background: none;
						"
						title={color.label}
						aria-pressed={filters.selectedColors.has(color.id)}
					>
						<i
							class="ms ms-cost ms-shadow {color.msClass}"
							style="font-size: 1.6rem;"
							aria-hidden="true"
						></i>
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
						class="flex w-full items-center gap-2.5 rounded px-2 py-1.5 font-body text-sm transition-all duration-150
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
						<i
							class="ms ms-rarity shrink-0"
							style="font-size: 1rem; color: {rarity.color};"
							aria-hidden="true"
						></i>
						<span class="flex-1 text-left">{rarity.label}</span>
						{#if facets?.rarity[rarity.id] != null}
							<span class="font-mono text-[10px] text-text-muted">
								{facets.rarity[rarity.id].toLocaleString()}
							</span>
						{/if}
					</button>
				{/each}
			</div>
		</Collapsible.Content>
	</Collapsible.Root>

	<OrnamentalDivider />

	<!-- Card Type section -->
	<Collapsible.Root bind:open={typesOpen}>
		<Collapsible.Trigger
			class="flex w-full cursor-pointer items-center justify-between border-none bg-transparent py-2 font-display text-sm uppercase tracking-widest text-text-secondary transition-colors hover:text-text-primary"
		>
			<span>Card Type</span>
			<span
				class="inline-block transition-transform duration-200"
				style:transform={typesOpen ? 'rotate(180deg)' : 'rotate(0deg)'}
			>
				&#9660;
			</span>
		</Collapsible.Trigger>
		<Collapsible.Content>
			<div class="flex flex-wrap gap-1.5 pt-2">
				{#each CARD_TYPES as type}
					<button
						onclick={() => filters.toggleType(type.id)}
						class="rounded px-2.5 py-1 font-body text-xs transition-all duration-150"
						style="
							background-color: {filters.selectedTypes.has(type.id) ? 'var(--color-mist)' : 'transparent'};
							border: 1px solid {filters.selectedTypes.has(type.id)
							? 'var(--color-gold)'
							: 'rgba(196, 146, 42, 0.2)'};
							color: {filters.selectedTypes.has(type.id)
							? 'var(--color-gold-bright)'
							: 'var(--color-text-secondary)'};
							cursor: pointer;
						"
						aria-pressed={filters.selectedTypes.has(type.id)}
					>
						{type.label}
					</button>
				{/each}
			</div>
		</Collapsible.Content>
	</Collapsible.Root>

	<OrnamentalDivider />

	<!-- Legality section -->
	<Collapsible.Root bind:open={legalityOpen}>
		<Collapsible.Trigger
			class="flex w-full cursor-pointer items-center justify-between border-none bg-transparent py-2 font-display text-sm uppercase tracking-widest text-text-secondary transition-colors hover:text-text-primary"
		>
			<span>Legality</span>
			<span
				class="inline-block transition-transform duration-200"
				style:transform={legalityOpen ? 'rotate(180deg)' : 'rotate(0deg)'}
			>
				&#9660;
			</span>
		</Collapsible.Trigger>
		<Collapsible.Content>
			<div class="flex flex-wrap gap-1.5 pt-2">
				{#each LEGALITY_FORMATS as format}
					<button
						onclick={() => filters.toggleLegality(format.id)}
						class="rounded px-2.5 py-1 font-body text-xs transition-all duration-150"
						style="
							background-color: {filters.selectedLegalities.has(format.id) ? 'var(--color-mist)' : 'transparent'};
							border: 1px solid {filters.selectedLegalities.has(format.id)
							? 'var(--color-gold)'
							: 'rgba(196, 146, 42, 0.2)'};
							color: {filters.selectedLegalities.has(format.id)
							? 'var(--color-gold-bright)'
							: 'var(--color-text-secondary)'};
							cursor: pointer;
						"
						aria-pressed={filters.selectedLegalities.has(format.id)}
					>
						{format.label}
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
