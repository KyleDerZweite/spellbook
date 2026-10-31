// Color belongs to the actual Magic category, shared by the reference compositions.
const manaColors: Record<string, string> = {
	White: 'var(--color-chart-mana-white)',
	Blue: 'var(--color-chart-mana-blue)',
	Black: 'var(--color-chart-mana-black)',
	Red: 'var(--color-chart-mana-red)',
	Green: 'var(--color-chart-mana-green)',
	Multicolor: 'var(--color-chart-mana-gold)',
	Colorless: 'var(--color-chart-mana-colorless)'
};
export const manaColor = (label: string) => manaColors[label] ?? 'var(--color-text-muted)';
const typeColors: Record<string, string> = {
	Land: '#a79a7e',
	Creature: '#83a990',
	Instant: '#8aa8c3',
	Sorcery: '#be8e79',
	Enchantment: '#ab9ac5',
	Artifact: '#9da5b0',
	Planeswalker: '#b69c63',
	Battle: '#b78277'
};
export const primaryTypeColor = (label: string) => typeColors[label] ?? 'var(--color-text-muted)';
