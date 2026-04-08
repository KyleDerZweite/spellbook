import type { CardType, LegalityFormat, ManaColor, Rarity } from './types';

const COLORED_MANA: ManaColor[] = ['W', 'U', 'B', 'R', 'G'];

function buildColorFilter(selectedColors: Set<ManaColor>): string | null {
	if (selectedColors.size === 0) {
		return null;
	}

	const includesColorless = selectedColors.has('C');
	const coloredSelection = COLORED_MANA.filter((color) => selectedColors.has(color));

	if (coloredSelection.length === 0) {
		return 'colors IS EMPTY';
	}

	const allowedColors = coloredSelection.map((color) => `colors = "${color}"`).join(' OR ');
	const forbiddenColors = COLORED_MANA.filter((color) => !coloredSelection.includes(color)).map(
		(color) => `NOT colors = "${color}"`
	);
	const exactSubsetFilter = [`(${allowedColors})`, ...forbiddenColors, 'colors IS NOT EMPTY'].join(
		' AND '
	);

	if (!includesColorless) {
		return `(${exactSubsetFilter})`;
	}

	return `((colors IS EMPTY) OR (${exactSubsetFilter}))`;
}

/**
 * Reactive filter state for card search.
 * Uses Svelte 5 runes ($state) for reactivity.
 */
export class SearchFilterState {
	selectedColors: Set<ManaColor> = $state(new Set());
	selectedRarities: Set<Rarity> = $state(new Set());
	selectedTypes: Set<CardType> = $state(new Set());
	selectedLegalities: Set<LegalityFormat> = $state(new Set(['standard', 'commander']));

	/** Build MeiliSearch filter array from current state. */
	get meiliFilters(): string[] {
		const filters: string[] = [];

		const colorFilter = buildColorFilter(this.selectedColors);
		if (colorFilter) {
			filters.push(colorFilter);
		}

		if (this.selectedRarities.size > 0) {
			const rarityFilters = [...this.selectedRarities].map((r) => `rarity = "${r}"`);
			filters.push(`(${rarityFilters.join(' OR ')})`);
		}

		if (this.selectedTypes.size > 0) {
			const typeFilters = [...this.selectedTypes].map((t) => `card_types = "${t}"`);
			filters.push(`(${typeFilters.join(' OR ')})`);
		}

		if (this.selectedLegalities.size > 0) {
			const legalityFilters = [...this.selectedLegalities].map((f) => `legalities.${f} = "legal"`);
			filters.push(`(${legalityFilters.join(' OR ')})`);
		}

		return filters;
	}

	toggleColor(color: ManaColor): void {
		const next = new Set(this.selectedColors);
		if (next.has(color)) {
			next.delete(color);
		} else {
			next.add(color);
		}
		this.selectedColors = next;
	}

	toggleRarity(rarity: Rarity): void {
		const next = new Set(this.selectedRarities);
		if (next.has(rarity)) {
			next.delete(rarity);
		} else {
			next.add(rarity);
		}
		this.selectedRarities = next;
	}

	toggleType(type: CardType): void {
		const next = new Set(this.selectedTypes);
		if (next.has(type)) {
			next.delete(type);
		} else {
			next.add(type);
		}
		this.selectedTypes = next;
	}

	toggleLegality(format: LegalityFormat): void {
		const next = new Set(this.selectedLegalities);
		if (next.has(format)) {
			next.delete(format);
		} else {
			next.add(format);
		}
		this.selectedLegalities = next;
	}

	clear(): void {
		this.selectedColors = new Set();
		this.selectedRarities = new Set();
		this.selectedTypes = new Set();
		this.selectedLegalities = new Set();
	}

	get hasFilters(): boolean {
		return (
			this.selectedColors.size > 0 ||
			this.selectedRarities.size > 0 ||
			this.selectedTypes.size > 0 ||
			this.selectedLegalities.size > 0
		);
	}
}
