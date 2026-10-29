import type {
	CardType,
	CatalogFilters,
	ColorMatch,
	LegalityFormat,
	ManaColor,
	Rarity
} from './types.ts';

/**
 * Reactive filter state for card search.
 * Uses Svelte 5 runes ($state) for reactivity.
 */
export class SearchFilterState {
	constructor(private changed: () => void = () => {}) {}

	colorAny: Set<ManaColor> = $state(new Set());
	colorAll: Set<ManaColor> = $state(new Set());
	colorField: ColorMatch['field'] = $state('color');

	get selectedColors(): Set<ManaColor> {
		return new Set([...this.colorAny, ...this.colorAll]);
	}
	selectedRarities: Set<Rarity> = $state(new Set());
	selectedTypes: Set<CardType> = $state(new Set());
	selectedLegalities: Set<LegalityFormat> = $state(new Set());

	get catalogFilters(): CatalogFilters {
		return {
			colorMatch: { field: this.colorField, any: [...this.colorAny], all: [...this.colorAll] },
			rarities: [...this.selectedRarities],
			types: [...this.selectedTypes],
			legalities: [...this.selectedLegalities]
		};
	}

	toggleColor(color: ManaColor): void {
		const any = new Set(this.colorAny),
			all = new Set(this.colorAll);
		if (all.has(color)) all.delete(color);
		else if (any.has(color)) {
			any.delete(color);
			all.add(color);
		} else any.add(color);
		this.colorAny = any;
		this.colorAll = all;
		this.changed();
	}

	removeColor(color: ManaColor): void {
		this.colorAny = new Set([...this.colorAny].filter((value) => value !== color));
		this.colorAll = new Set([...this.colorAll].filter((value) => value !== color));
		this.changed();
	}

	setColorField(field: ColorMatch['field']): void {
		if (field === this.colorField) return;
		this.colorField = field;
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
		this.colorAny = new Set();
		this.colorAll = new Set();
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
