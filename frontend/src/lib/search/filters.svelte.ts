import type { ManaColor, Rarity } from './types';

/**
 * Reactive filter state for card search.
 * Uses Svelte 5 runes ($state) for reactivity.
 */
export class SearchFilterState {
	selectedColors: Set<ManaColor> = $state(new Set());
	selectedRarities: Set<Rarity> = $state(new Set());
	typeQuery: string = $state('');

	/** Build MeiliSearch filter array from current state. */
	get meiliFilters(): string[] {
		const filters: string[] = [];

		if (this.selectedColors.size > 0) {
			const colorFilters = [...this.selectedColors].map((c) => `colors = "${c}"`);
			filters.push(`(${colorFilters.join(' OR ')})`);
		}

		if (this.selectedRarities.size > 0) {
			const rarityFilters = [...this.selectedRarities].map((r) => `rarity = "${r}"`);
			filters.push(`(${rarityFilters.join(' OR ')})`);
		}

		if (this.typeQuery.trim()) {
			filters.push(`type_line = "${this.typeQuery.trim()}"`);
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

	clear(): void {
		this.selectedColors = new Set();
		this.selectedRarities = new Set();
		this.typeQuery = '';
	}

	get hasFilters(): boolean {
		return this.selectedColors.size > 0 || this.selectedRarities.size > 0 || this.typeQuery.trim().length > 0;
	}
}
