const COLORS = ['W', 'U', 'B', 'R', 'G'] as const;
const RARITIES = ['common', 'uncommon', 'rare', 'mythic'] as const;

export type Color = (typeof COLORS)[number];
export type Rarity = (typeof RARITIES)[number];

class SearchFilterState {
  selectedColors = $state<Set<Color>>(new Set());
  selectedRarities = $state<Set<Rarity>>(new Set());
  typeQuery = $state('');

  get activeFilterCount(): number {
    return this.selectedColors.size + this.selectedRarities.size + (this.typeQuery ? 1 : 0);
  }

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
    if (this.typeQuery) {
      filters.push(`type_line = "${this.typeQuery}"`);
    }
    return filters;
  }

  toggleColor(color: Color) {
    const next = new Set(this.selectedColors);
    if (next.has(color)) {
      next.delete(color);
    } else {
      next.add(color);
    }
    this.selectedColors = next;
  }

  toggleRarity(rarity: Rarity) {
    const next = new Set(this.selectedRarities);
    if (next.has(rarity)) {
      next.delete(rarity);
    } else {
      next.add(rarity);
    }
    this.selectedRarities = next;
  }

  clear() {
    this.selectedColors = new Set();
    this.selectedRarities = new Set();
    this.typeQuery = '';
  }
}

export const filters = new SearchFilterState();
export { COLORS, RARITIES };
