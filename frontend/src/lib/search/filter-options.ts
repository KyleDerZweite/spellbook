import type { CardType, LegalityFormat, ManaColor, Rarity } from './types.ts';
import type { SearchFilterState } from './filters.svelte.ts';

export const MANA_COLORS: { id: ManaColor; label: string; msClass: string }[] = [
	{ id: 'W', label: 'White', msClass: 'ms-w' },
	{ id: 'U', label: 'Blue', msClass: 'ms-u' },
	{ id: 'B', label: 'Black', msClass: 'ms-b' },
	{ id: 'R', label: 'Red', msClass: 'ms-r' },
	{ id: 'G', label: 'Green', msClass: 'ms-g' },
	{ id: 'C', label: 'Colorless', msClass: 'ms-c' }
];

export const RARITIES: { id: Rarity; label: string; color: string }[] = [
	{ id: 'common', label: 'Common', color: 'var(--color-rarity-common)' },
	{ id: 'uncommon', label: 'Uncommon', color: 'var(--color-rarity-uncommon)' },
	{ id: 'rare', label: 'Rare', color: 'var(--color-rarity-rare)' },
	{ id: 'mythic', label: 'Mythic', color: 'var(--color-rarity-mythic)' }
];

export const CARD_TYPES: { id: CardType; label: string }[] = [
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

export const LEGALITY_FORMATS: { id: LegalityFormat; label: string }[] = [
	{ id: 'standard', label: 'Standard' },
	{ id: 'pioneer', label: 'Pioneer' },
	{ id: 'modern', label: 'Modern' },
	{ id: 'legacy', label: 'Legacy' },
	{ id: 'vintage', label: 'Vintage' },
	{ id: 'commander', label: 'Commander' },
	{ id: 'pauper', label: 'Pauper' },
	{ id: 'brawl', label: 'Brawl' }
];

export function getActiveFilters(filters: SearchFilterState) {
	return [
		...MANA_COLORS.filter((option) => filters.selectedColors.has(option.id)).map((option) => ({
			key: `color-${option.id}`,
			label: option.label,
			remove: () => filters.toggleColor(option.id)
		})),
		...RARITIES.filter((option) => filters.selectedRarities.has(option.id)).map((option) => ({
			key: `rarity-${option.id}`,
			label: option.label,
			remove: () => filters.toggleRarity(option.id)
		})),
		...CARD_TYPES.filter((option) => filters.selectedTypes.has(option.id)).map((option) => ({
			key: `type-${option.id}`,
			label: option.label,
			remove: () => filters.toggleType(option.id)
		})),
		...LEGALITY_FORMATS.filter((option) => filters.selectedLegalities.has(option.id)).map(
			(option) => ({
				key: `legality-${option.id}`,
				label: option.label,
				remove: () => filters.toggleLegality(option.id)
			})
		)
	];
}
