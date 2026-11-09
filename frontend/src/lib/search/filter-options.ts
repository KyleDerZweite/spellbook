import { translate, type MessageKey } from '#lib/i18n/messages.ts';
import type { Locale } from '#lib/i18n/locale.ts';
import { printingLanguageOptions, DEFAULT_SEARCH_LANGUAGES } from './languages.ts';
import type { CardType, LegalityFormat, ManaColor, Rarity } from './types.ts';
import type { SearchFilterState } from './filters.svelte.ts';

export const MANA_COLORS: {
	id: ManaColor;
	label: string;
	labelKey: MessageKey;
	msClass: string;
}[] = [
	{ id: 'W', label: 'White', labelKey: 'color.White', msClass: 'ms-w' },
	{ id: 'U', label: 'Blue', labelKey: 'color.Blue', msClass: 'ms-u' },
	{ id: 'B', label: 'Black', labelKey: 'color.Black', msClass: 'ms-b' },
	{ id: 'R', label: 'Red', labelKey: 'color.Red', msClass: 'ms-r' },
	{ id: 'G', label: 'Green', labelKey: 'color.Green', msClass: 'ms-g' },
	{ id: 'C', label: 'Colorless', labelKey: 'color.Colorless', msClass: 'ms-c' }
];

export const RARITIES: { id: Rarity; label: string; labelKey: MessageKey; color: string }[] = [
	{ id: 'common', label: 'Common', labelKey: 'rarity.common', color: 'var(--color-rarity-common)' },
	{
		id: 'uncommon',
		label: 'Uncommon',
		labelKey: 'rarity.uncommon',
		color: 'var(--color-rarity-uncommon)'
	},
	{ id: 'rare', label: 'Rare', labelKey: 'rarity.rare', color: 'var(--color-rarity-rare)' },
	{ id: 'mythic', label: 'Mythic', labelKey: 'rarity.mythic', color: 'var(--color-rarity-mythic)' }
];

export const CARD_TYPES: { id: CardType; label: string; labelKey: MessageKey }[] = [
	{ id: 'Creature', label: 'Creature', labelKey: 'type.Creature' },
	{ id: 'Instant', label: 'Instant', labelKey: 'type.Instant' },
	{ id: 'Sorcery', label: 'Sorcery', labelKey: 'type.Sorcery' },
	{ id: 'Enchantment', label: 'Enchantment', labelKey: 'type.Enchantment' },
	{ id: 'Artifact', label: 'Artifact', labelKey: 'type.Artifact' },
	{ id: 'Planeswalker', label: 'Planeswalker', labelKey: 'type.Planeswalker' },
	{ id: 'Land', label: 'Land', labelKey: 'type.Land' },
	{ id: 'Battle', label: 'Battle', labelKey: 'type.Battle' },
	{ id: 'Kindred', label: 'Kindred', labelKey: 'type.Kindred' }
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

export function getActiveFilters(filters: SearchFilterState, locale: Locale = 'en') {
	return [
		...(filters.selectedLanguages.size !== 2 ||
		!filters.selectedLanguages.has('de') ||
		!filters.selectedLanguages.has('en')
			? filters.selectedLanguages.size
				? printingLanguageOptions(locale)
						.filter((option) => filters.selectedLanguages.has(option.id))
						.map((option) => ({
							key: `language-${option.id}`,
							label: option.label,
							remove: () => filters.toggleLanguage(option.id)
						}))
				: [
						{
							key: 'language-all',
							label: translate(locale, 'ui.All.languages'),
							remove: () => filters.setLanguages([...DEFAULT_SEARCH_LANGUAGES])
						}
					]
			: []),
		...MANA_COLORS.filter((option) => filters.selectedColors.has(option.id)).map((option) => ({
			key: `color-${option.id}`,
			label: `${filterOptionLabel(option, locale)} ${filters.colorNot.has(option.id) ? 'NOT' : filters.colorAll.has(option.id) ? 'AND' : 'OR'}`,
			remove: () => filters.removeColor(option.id)
		})),
		...RARITIES.filter((option) => filters.selectedRarities.has(option.id)).map((option) => ({
			key: `rarity-${option.id}`,
			label: filterOptionLabel(option, locale),
			remove: () => filters.toggleRarity(option.id)
		})),
		...CARD_TYPES.filter((option) => filters.selectedTypes.has(option.id)).map((option) => ({
			key: `type-${option.id}`,
			label: filterOptionLabel(option, locale),
			remove: () => filters.toggleType(option.id)
		})),
		...LEGALITY_FORMATS.filter((option) => filters.selectedLegalities.has(option.id)).map(
			(option) => ({
				key: `legality-${option.id}`,
				label: filterOptionLabel(option, locale),
				remove: () => filters.toggleLegality(option.id)
			})
		)
	];
}

export function filterOptionLabel(
	option: { label: string; labelKey?: MessageKey },
	locale: Locale
): string {
	return option.labelKey ? translate(locale, option.labelKey) : option.label;
}
