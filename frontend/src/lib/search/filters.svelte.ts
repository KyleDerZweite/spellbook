import type { CardType, CatalogFilters, LegalityFormat, ManaColor, Rarity } from './types.ts';

/**
 * Reactive filter state for card search.
 * Uses Svelte 5 runes ($state) for reactivity.
 */
export class SearchFilterState {
	constructor(private changed: () => void = () => {}) {}

	selectedColors: Set<ManaColor> = $state(new Set());
	selectedRarities: Set<Rarity> = $state(new Set());
	selectedTypes: Set<CardType> = $state(new Set());
	selectedLegalities: Set<LegalityFormat> = $state(new Set());

	get catalogFilters(): CatalogFilters {
		return {
			colorIdentity: [...this.selectedColors],
			rarities: [...this.selectedRarities],
			types: [...this.selectedTypes],
			legalities: [...this.selectedLegalities]
		};
	}

	toggleColor(color: ManaColor): void {
		const next = new Set(this.selectedColors);
		if (next.has(color)) {
			next.delete(color);
		} else {
			next.add(color);
		}
		this.selectedColors = next;
		this.changed();
	}

	toggleRarity(rarity: Rarity): void {
		const next = new Set(this.selectedRarities);
		if (next.has(rarity)) {
			next.delete(rarity);
		} else {
			next.add(rarity);
		}
		this.selectedRarities = next;
		this.changed();
	}

	toggleType(type: CardType): void {
		const next = new Set(this.selectedTypes);
		if (next.has(type)) {
			next.delete(type);
		} else {
			next.add(type);
		}
		this.selectedTypes = next;
		this.changed();
	}

	toggleLegality(format: LegalityFormat): void {
		const next = new Set(this.selectedLegalities);
		if (next.has(format)) {
			next.delete(format);
		} else {
			next.add(format);
		}
		this.selectedLegalities = next;
		this.changed();
	}

	clear(): void {
		this.selectedColors = new Set();
		this.selectedRarities = new Set();
		this.selectedTypes = new Set();
		this.selectedLegalities = new Set();
		this.changed();
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
