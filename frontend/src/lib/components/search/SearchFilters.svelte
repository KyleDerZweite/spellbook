<script lang="ts">
	import { Collapsible } from 'bits-ui';
	import type { SearchFilterState } from '#lib/search/filters.svelte.ts';
	import type { FacetResponse } from '#lib/search/types.ts';
	import {
		MANA_COLORS,
		RARITIES,
		CARD_TYPES,
		LEGALITY_FORMATS
	} from '#lib/search/filter-options.ts';

	interface Props {
		filters: SearchFilterState;
		facets?: FacetResponse | null;
		class?: string;
	}
	let { filters, facets = null, class: className = '' }: Props = $props();
	const descriptionId = $props.id();
	let colorsOpen = $state(true);
	let rarityOpen = $state(true);
	let typesOpen = $state(false);
	let legalityOpen = $state(false);
</script>

{#snippet groupLabel(label: string, open: boolean, selected: number)}
	<span class="flex min-w-0 items-center gap-2">
		{label}
		{#if selected}<span class="filter-count" aria-label={`${selected} selected`}>{selected}</span
			>{/if}
	</span>
	<svg
		aria-hidden="true"
		width="14"
		height="14"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.6"
		class="filter-chevron"
		class:expanded={open}><path d="m6 9 6 6 6-6" /></svg
	>
{/snippet}

<aside class="search-filters {className}" aria-label="Search filters">
	<div class="filter-reset">
		<button
			type="button"
			class="filter-clear"
			disabled={!filters.hasFilters}
			onclick={() => filters.clear()}>Clear filters</button
		>
	</div>
	<Collapsible.Root bind:open={colorsOpen}>
		<Collapsible.Trigger class="filter-trigger">
			{@render groupLabel('Deck colors', colorsOpen, filters.selectedColors.size)}
		</Collapsible.Trigger>
		<Collapsible.Content>
			<p id={descriptionId} class="sr-only">
				Choose the allowed color identity. Includes colorless cards and cards using only your
				selected colors. Colorless alone shows only colorless identities. Format legality is a
				separate filter.
			</p>
			<div
				class="filter-colors"
				role="group"
				aria-label="Allowed deck colors"
				aria-describedby={descriptionId}
			>
				{#each MANA_COLORS as color}
					<button
						type="button"
						onclick={() => filters.toggleColor(color.id)}
						class="filter-color"
						aria-label={color.label}
						title={color.id === 'C' ? 'Colorless only' : color.label}
						aria-pressed={filters.selectedColors.has(color.id)}
					>
						<i class="ms ms-cost {color.msClass}" aria-hidden="true"></i>
					</button>
				{/each}
			</div>
		</Collapsible.Content>
	</Collapsible.Root>
	<Collapsible.Root bind:open={rarityOpen}>
		<Collapsible.Trigger class="filter-trigger">
			{@render groupLabel('Rarity', rarityOpen, filters.selectedRarities.size)}
		</Collapsible.Trigger>
		<Collapsible.Content>
			<div class="filter-options">
				{#each RARITIES as rarity}
					<button
						type="button"
						class="filter-option filter-rarity"
						onclick={() => filters.toggleRarity(rarity.id)}
						aria-pressed={filters.selectedRarities.has(rarity.id)}
					>
						<i class="ms ms-rarity" style:color={rarity.color} aria-hidden="true"></i>
						<span class="option-label">{rarity.label}</span>
						<span class="facet-count">{facets?.rarity[rarity.id]?.toLocaleString() ?? ''}</span>
						<span class="selection-mark" aria-hidden="true"></span>
					</button>
				{/each}
			</div>
		</Collapsible.Content>
	</Collapsible.Root>
	<Collapsible.Root bind:open={typesOpen}>
		<Collapsible.Trigger class="filter-trigger">
			{@render groupLabel('Card type', typesOpen, filters.selectedTypes.size)}
		</Collapsible.Trigger>
		<Collapsible.Content>
			<div class="filter-options filter-option-grid">
				{#each CARD_TYPES as type}
					<button
						type="button"
						class="filter-option"
						onclick={() => filters.toggleType(type.id)}
						aria-pressed={filters.selectedTypes.has(type.id)}
					>
						<span class="selection-mark" aria-hidden="true"></span><span class="option-label"
							>{type.label}</span
						>
					</button>
				{/each}
			</div>
		</Collapsible.Content>
	</Collapsible.Root>
	<Collapsible.Root bind:open={legalityOpen}>
		<Collapsible.Trigger class="filter-trigger">
			{@render groupLabel('Legality', legalityOpen, filters.selectedLegalities.size)}
		</Collapsible.Trigger>
		<Collapsible.Content>
			<div class="filter-options filter-option-grid">
				{#each LEGALITY_FORMATS as format}
					<button
						type="button"
						class="filter-option"
						onclick={() => filters.toggleLegality(format.id)}
						aria-pressed={filters.selectedLegalities.has(format.id)}
					>
						<span class="selection-mark" aria-hidden="true"></span><span class="option-label"
							>{format.label}</span
						>
					</button>
				{/each}
			</div>
		</Collapsible.Content>
	</Collapsible.Root>
</aside>

<style>
	.search-filters {
		display: flex;
		width: 100%;
		min-width: 0;
		flex-direction: column;
		gap: 12px;
	}
	.filter-reset {
		display: flex;
		height: 32px;
		align-items: center;
		justify-content: flex-end;
	}
	.filter-clear {
		border: 0;
		background: none;
		padding: 6px 0;
		font: inherit;
		font-size: 12px;
		color: var(--color-text-secondary);
		text-decoration: underline;
		text-underline-offset: 4px;
		cursor: pointer;
	}
	.filter-clear:disabled {
		color: var(--color-text-muted);
		opacity: 0.55;
		cursor: default;
		text-decoration: none;
	}
	.search-filters :global(.filter-trigger) {
		display: flex;
		width: 100%;
		min-height: 36px;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		border: 0;
		background: none;
		padding: 0;
		color: var(--color-text-secondary);
		font: inherit;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
	}
	.search-filters :global(.filter-trigger:hover) {
		color: var(--color-text-primary);
	}
	.filter-count {
		color: var(--color-text-muted);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
	}
	.filter-chevron {
		flex-shrink: 0;
		transition: transform 120ms ease;
	}
	.filter-chevron.expanded {
		transform: rotate(180deg);
	}
	.filter-colors {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: 4px;
		padding: 4px 0 8px;
	}
	.filter-color {
		display: flex;
		height: 40px;
		min-width: 0;
		align-items: center;
		justify-content: center;
		border: 0;
		border-radius: 4px;
		background: none;
		cursor: pointer;
	}
	.filter-color i {
		display: grid;
		width: 34px;
		height: 34px;
		place-items: center;
		border: 1px solid transparent;
		border-radius: 50%;
		font-size: 25px;
		opacity: 0.72;
	}
	.filter-color:hover i,
	.filter-color[aria-pressed='true'] i {
		opacity: 1;
	}
	.filter-color[aria-pressed='true'] i {
		border-color: var(--color-text-primary);
	}
	.filter-options {
		display: grid;
		gap: 2px;
		padding: 2px 0 8px;
	}
	.filter-option-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
		column-gap: 8px;
	}
	.filter-option {
		display: flex;
		min-width: 0;
		min-height: 32px;
		align-items: center;
		gap: 7px;
		border: 0;
		background: none;
		padding: 4px 0;
		color: var(--color-text-secondary);
		font: inherit;
		font-size: 12px;
		text-align: left;
		cursor: pointer;
	}
	.option-label {
		white-space: nowrap;
	}
	.filter-option:hover,
	.filter-option[aria-pressed='true'] {
		color: var(--color-text-primary);
	}
	.filter-option[aria-pressed='true'] .option-label {
		text-decoration: underline;
		text-underline-offset: 4px;
	}
	.selection-mark {
		width: 12px;
		height: 12px;
		flex-shrink: 0;
		border: 1px solid var(--color-text-muted);
		border-radius: 2px;
	}
	.filter-option[aria-pressed='true'] .selection-mark {
		border-color: var(--color-text-primary);
		background: var(--color-text-primary);
		box-shadow: inset 0 0 0 2px var(--color-background);
	}
	.filter-rarity i {
		width: 16px;
		font-size: 14px;
	}
	.facet-count {
		flex: 1;
		min-width: 4ch;
		color: var(--color-text-muted);
		font-variant-numeric: tabular-nums;
		text-align: right;
	}
	@media (max-width: 767px) {
		.filter-color,
		.filter-option,
		.search-filters :global(.filter-trigger) {
			min-height: 44px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.filter-chevron {
			transition: none;
		}
	}
</style>
