import { DEFAULT_SEARCH_LANGUAGES } from './languages.ts';
import type {
	CardType,
	CatalogLanguage,
	CatalogFilters,
	ColorMatch,
	LegalityFormat,
	ManaColor,
	Rarity
} from './types.ts';
import { browserColorFilters, completeColorMatch } from './color-filters.ts';

/**
 * Reactive filter state for card search.
 * Uses Svelte 5 runes ($state) for reactivity.
 */
export class SearchFilterState {
	constructor(private changed: () => void = () => {}) {}

	colorAny: Set<ManaColor> = $state(new Set());
	colorAll: Set<ManaColor> = $state(new Set());
	colorNot: Set<ManaColor> = $state(new Set());
	colorField: ColorMatch['field'] = $state('color');

	get selectedColors(): Set<ManaColor> {
		return new Set([...this.colorAny, ...this.colorAll, ...this.colorNot]);
	}
	get colorCycleLocked(): boolean {
		const selected = this.selectedColors;
		return (['W', 'U', 'B', 'R', 'G'] as const).every((color) => selected.has(color));
	}

	selectedLanguages: Set<CatalogLanguage> = $state(new Set(DEFAULT_SEARCH_LANGUAGES));
	selectedRarities: Set<Rarity> = $state(new Set());
	selectedTypes: Set<CardType> = $state(new Set());
	selectedLegalities: Set<LegalityFormat> = $state(new Set());

	get catalogFilters(): CatalogFilters {
		return {
			...browserColorFilters({
				field: this.colorField,
				any: [...this.colorAny],
				all: [...this.colorAll],
				...(this.colorNot.size ? { not: [...this.colorNot] } : {})
			}),
			languages: [...this.selectedLanguages],
			rarities: [...this.selectedRarities],
			types: [...this.selectedTypes],
			legalities: [...this.selectedLegalities]
		};
	}

	toggleColor(color: ManaColor): void {
		const any = new Set(this.colorAny),
			all = new Set(this.colorAll),
			not = new Set(this.colorNot);
		if (not.has(color)) {
			not.delete(color);
			if (color !== 'C' && this.colorCycleLocked) any.add(color);
		} else if (all.has(color)) {
			all.delete(color);
			not.add(color);
		} else if (any.has(color)) {
			any.delete(color);
			all.add(color);
		} else any.add(color);
		const completed = completeColorMatch({
			field: this.colorField,
			any: [...any],
			all: [...all],
			not: [...not]
		});
		this.colorAny = new Set(completed.any);
		this.colorAll = new Set(completed.all);
		this.colorNot = new Set(completed.not);
		this.changed();
	}

	removeColor(color: ManaColor): void {
		const locked = this.colorCycleLocked;
		this.colorAny = new Set([...this.colorAny].filter((value) => value !== color));
		this.colorAll = new Set([...this.colorAll].filter((value) => value !== color));
		this.colorNot = new Set([...this.colorNot].filter((value) => value !== color));
		if (color !== 'C' && locked) this.colorNot = new Set([...this.colorNot, color]);
		this.changed();
	}

	setColorField(field: ColorMatch['field']): void {
		if (field === this.colorField) return;
		this.colorField = field;
		this.changed();
	}

	setLanguages(languages: CatalogLanguage[]): void {
		this.selectedLanguages = new Set(languages);
		this.changed();
	}
	toggleLanguage(language: CatalogLanguage): void {
		const next = new Set(this.selectedLanguages);
		if (next.has(language)) next.delete(language);
		else next.add(language);
		this.setLanguages([...next]);
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
		this.selectedLanguages = new Set(DEFAULT_SEARCH_LANGUAGES);
		this.colorAny = new Set();
		this.colorAll = new Set();
		this.colorNot = new Set();
		this.selectedRarities = new Set();
		this.selectedTypes = new Set();
		this.selectedLegalities = new Set();
		this.changed();
	}

	get hasFilters(): boolean {
		return (
			this.selectedLanguages.size !== 2 ||
			!this.selectedLanguages.has('de') ||
			!this.selectedLanguages.has('en') ||
			this.selectedColors.size > 0 ||
			this.selectedRarities.size > 0 ||
			this.selectedTypes.size > 0 ||
			this.selectedLegalities.size > 0
		);
	}
}
