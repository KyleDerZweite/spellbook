<script lang="ts">
	import { useLanguage } from '#lib/i18n/context.ts';
	const language = useLanguage();
	import { printingLanguageOptions } from '#lib/search/languages.ts';
	import { cardTypeSymbol } from '#lib/mtg/type-symbol.ts';
	import { Collapsible } from 'bits-ui';
	import type { SearchFilterState } from '#lib/search/filters.svelte.ts';
	import type { FacetResponse } from '#lib/search/types.ts';
	import {
		filterOptionLabel,
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
	let languagesOpen = $state(false);
	let colorsOpen = $state(true);
	let rarityOpen = $state(true);
	let typesOpen = $state(false);
	let legalityOpen = $state(false);
</script>

{#snippet groupLabel(label: string, open: boolean, selected: number)}
	<span class="flex min-w-0 items-center gap-2">
		{label}
		{#if selected}<span
				class="filter-count"
				aria-label={language.t('filter.selected', { count: selected })}>{selected}</span
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

<aside class="search-filters {className}" aria-label={language.t('ui.Search.filters')}>
	<div class="filter-reset">
		<button
			type="button"
			class="filter-clear"
			disabled={!filters.hasFilters}
			onclick={() => filters.clear()}>{language.t('ui.Clear.filters')}</button
		>
	</div>
	<Collapsible.Root bind:open={colorsOpen}>
		<Collapsible.Trigger class="filter-trigger">
			{@render groupLabel(language.t('ui.Colors'), colorsOpen, filters.selectedColors.size)}
		</Collapsible.Trigger>
		<Collapsible.Content>
			<p id={descriptionId} class="sr-only">
				{filters.colorCycleLocked
					? language.t(
							'ui.Click.to.cycle.OR.AND.NOT.Colorless.also.cycles.off.Clear.filters.to.reset.colors'
						)
					: language.t(
							'ui.Click.to.cycle.OR.AND.NOT.then.off.A.second.color.filter.sets.remaining.WUBRG.colors.to.NOT.Colorless.stays.unchanged'
						)}
			</p>
			<div
				class="filter-colors"
				role="group"
				aria-label={language.t('ui.Card.colors')}
				aria-describedby={descriptionId}
			>
				{#each MANA_COLORS as color}
					{@const logic = filters.colorNot.has(color.id)
						? 'NOT'
						: filters.colorAll.has(color.id)
							? 'AND'
							: filters.colorAny.has(color.id)
								? 'OR'
								: 'off'}
					<button
						type="button"
						onclick={() => filters.toggleColor(color.id)}
						class="filter-color"
						data-logic={logic}
						aria-label={language.t('message.p0.p1.Next.click.p2', {
							p0: String(filterOptionLabel(color, language.locale)),
							p1: String(logic),
							p2: String(
								logic === 'off'
									? 'OR'
									: logic === 'OR'
										? 'AND'
										: logic === 'AND'
											? 'NOT'
											: color.id !== 'C' && filters.colorCycleLocked
												? 'OR'
												: 'off'
							)
						})}
						title={`${filterOptionLabel(color, language.locale)}: ${logic}`}
						aria-pressed={logic !== 'off'}
					>
						<i class="ms ms-cost {color.msClass}" aria-hidden="true"></i>
					</button>
				{/each}
			</div>
			<fieldset class="color-mode">
				<legend class="sr-only">{language.t('ui.Match.colors.by')}</legend>
				{#each [{ value: 'color', label: language.t('ui.Color') }, { value: 'identity', label: language.t('ui.Identity') }] as mode}
					<label
						><input
							type="radio"
							name={`${descriptionId}-color-mode`}
							checked={filters.colorField === mode.value}
							onchange={() => filters.setColorField(mode.value as 'color' | 'identity')}
						/>{mode.label}</label
					>
				{/each}
			</fieldset>
		</Collapsible.Content>
	</Collapsible.Root>
	<Collapsible.Root bind:open={rarityOpen}>
		<Collapsible.Trigger class="filter-trigger">
			{@render groupLabel(language.t('ui.Rarity'), rarityOpen, filters.selectedRarities.size)}
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
						<span class="option-label">{filterOptionLabel(rarity, language.locale)}</span>
						<span class="facet-count"
							>{facets?.rarity[rarity.id]?.toLocaleString(language.locale) ?? ''}</span
						>
						<span class="selection-mark" aria-hidden="true"></span>
					</button>
				{/each}
			</div>
		</Collapsible.Content>
	</Collapsible.Root>
	<Collapsible.Root bind:open={typesOpen}>
		<Collapsible.Trigger class="filter-trigger">
			{@render groupLabel(language.t('ui.Card.type'), typesOpen, filters.selectedTypes.size)}
		</Collapsible.Trigger>
		<Collapsible.Content>
			<div class="filter-options filter-option-grid">
				{#each CARD_TYPES as type}
					{@const symbol = cardTypeSymbol(type.id)}
					<button
						type="button"
						class="filter-option"
						onclick={() => filters.toggleType(type.id)}
						aria-pressed={filters.selectedTypes.has(type.id)}
					>
						<span class="selection-mark" aria-hidden="true"></span>{#if symbol}<i
								class={`type-symbol ms ms-${symbol}`}
								aria-hidden="true"
							></i>{/if}<span class="option-label">{filterOptionLabel(type, language.locale)}</span>
					</button>
				{/each}
			</div>
		</Collapsible.Content>
	</Collapsible.Root>
	<Collapsible.Root bind:open={legalityOpen}>
		<Collapsible.Trigger class="filter-trigger">
			{@render groupLabel(language.t('ui.Legality'), legalityOpen, filters.selectedLegalities.size)}
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
							>{filterOptionLabel(format, language.locale)}</span
						>
					</button>
				{/each}
			</div>
		</Collapsible.Content>
	</Collapsible.Root>
	<Collapsible.Root bind:open={languagesOpen}>
		<Collapsible.Trigger class="filter-trigger">
			{@render groupLabel(
				filters.selectedLanguages.size ? language.t('ui.Language') : language.t('ui.Language.All'),
				languagesOpen,
				filters.selectedLanguages.size
			)}
		</Collapsible.Trigger>
		<Collapsible.Content>
			<div class="filter-options" role="group" aria-label={language.t('ui.Printing.languages')}>
				<button
					type="button"
					class="filter-option"
					aria-pressed={filters.selectedLanguages.size === 0}
					onclick={() => filters.setLanguages([])}>{language.t('ui.All.languages')}</button
				>
				{#each printingLanguageOptions(language.locale) as printingLanguage}
					<button
						type="button"
						class="filter-option"
						aria-pressed={filters.selectedLanguages.has(printingLanguage.id)}
						onclick={() => filters.toggleLanguage(printingLanguage.id)}
					>
						<span class="selection-mark" aria-hidden="true"></span>
						<span class="language-flag" aria-hidden="true">{printingLanguage.flag}</span>
						<span class="option-label">{printingLanguage.label}</span>
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
	.language-flag {
		display: inline-flex;
		width: 20px;
		flex: none;
		align-items: center;
		justify-content: center;
		font-size: 16px;
		line-height: 1;
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
	.color-mode {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-top: 0;
		border: 0;
		padding: 0;
	}
	.color-mode label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		min-height: 36px;
		font-size: 0.75rem;
		cursor: pointer;
	}
	.color-mode input {
		accent-color: var(--color-text-primary);
	}
	.filter-color[data-logic='AND'] i {
		outline: 1px solid var(--color-text-primary);
		outline-offset: 3px;
	}
	.filter-color[data-logic='NOT'] i {
		outline: 1px solid var(--color-error);
		outline-offset: 3px;
	}
	.filter-color[data-logic='NOT'] i::after {
		content: '';
		position: absolute;
		width: 26px;
		height: 2px;
		background: var(--color-error);
		transform: rotate(-45deg);
		border-radius: 1px;
	}
	.filter-colors {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: 4px;
		padding: 4px 0 8px;
	}
	.filter-color {
		display: flex;
		min-height: 44px;
		min-width: 0;
		align-items: center;
		justify-content: center;
		border: 0;
		border-radius: 4px;
		background: none;
		cursor: pointer;
	}
	.filter-color i {
		position: relative;
		display: grid;
		width: 30px;
		height: 30px;
		place-items: center;
		border: 1px solid transparent;
		border-radius: 50%;
		font-size: 25px;
		line-height: 1;
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
	.type-symbol {
		width: 16px;
		flex: none;
		font-size: 14px;
		text-align: center;
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
