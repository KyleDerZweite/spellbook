// Color belongs to the actual Magic category, shared by the reference compositions.
const manaColors: Record<string, string> = {
	White: '#c9bb91',
	Blue: '#7fa6c4',
	Black: '#827d88',
	Red: '#bd7e69',
	Green: '#7ea58a',
	Multicolor: '#b59e67',
	Colorless: '#9ba3ac'
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
