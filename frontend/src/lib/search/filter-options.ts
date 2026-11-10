import { translate, type MessageKey } from '#lib/i18n/messages.ts';
import type { Locale } from '#lib/i18n/locale.ts';
import type { CardType, LegalityFormat, ManaColor, Rarity } from './types.ts';

export const MANA_COLORS: {
	id: ManaColor;
	labelKey: MessageKey;
	msClass: string;
}[] = [
	{ id: 'W', labelKey: 'color.White', msClass: 'ms-w' },
	{ id: 'U', labelKey: 'color.Blue', msClass: 'ms-u' },
	{ id: 'B', labelKey: 'color.Black', msClass: 'ms-b' },
	{ id: 'R', labelKey: 'color.Red', msClass: 'ms-r' },
	{ id: 'G', labelKey: 'color.Green', msClass: 'ms-g' },
	{ id: 'C', labelKey: 'color.Colorless', msClass: 'ms-c' }
];

export const RARITIES: { id: Rarity; labelKey: MessageKey; color: string }[] = [
	{ id: 'common', labelKey: 'rarity.common', color: 'var(--color-rarity-common)' },
	{
		id: 'uncommon',
		labelKey: 'rarity.uncommon',
		color: 'var(--color-rarity-uncommon)'
	},
	{ id: 'rare', labelKey: 'rarity.rare', color: 'var(--color-rarity-rare)' },
	{ id: 'mythic', labelKey: 'rarity.mythic', color: 'var(--color-rarity-mythic)' }
];

export const CARD_TYPES: { id: CardType; labelKey: MessageKey }[] = [
	{ id: 'Creature', labelKey: 'type.Creature' },
	{ id: 'Instant', labelKey: 'type.Instant' },
	{ id: 'Sorcery', labelKey: 'type.Sorcery' },
	{ id: 'Enchantment', labelKey: 'type.Enchantment' },
	{ id: 'Artifact', labelKey: 'type.Artifact' },
	{ id: 'Planeswalker', labelKey: 'type.Planeswalker' },
	{ id: 'Land', labelKey: 'type.Land' },
	{ id: 'Battle', labelKey: 'type.Battle' },
	{ id: 'Kindred', labelKey: 'type.Kindred' }
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

export function filterOptionLabel(
	option: { labelKey: MessageKey } | { label: string },
	locale: Locale
): string {
	return 'labelKey' in option ? translate(locale, option.labelKey) : option.label;
}
