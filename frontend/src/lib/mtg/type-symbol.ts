/** Mana Font glyphs for actual card types. Kindred has no dedicated installed glyph. */
const typeSymbols = {
	Creature: 'creature',
	Instant: 'instant',
	Sorcery: 'sorcery',
	Enchantment: 'enchantment',
	Artifact: 'artifact',
	Land: 'land',
	Planeswalker: 'planeswalker',
	Battle: 'battle'
} as const;

export function cardTypeSymbol(type: string): string | undefined {
	return Object.hasOwn(typeSymbols, type)
		? typeSymbols[type as keyof typeof typeSymbols]
		: undefined;
}
