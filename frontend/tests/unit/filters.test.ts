import { describe, it, expect } from 'vitest';
import { SearchFilterState } from '../../src/lib/search/filters.svelte';

describe('SearchFilterState', () => {
	it('starts with no filters', () => {
		const state = new SearchFilterState();
		expect(state.selectedColors.size).toBe(0);
		expect(state.selectedRarities.size).toBe(0);
		expect(state.typeQuery).toBe('');
		expect(state.meiliFilters).toEqual([]);
		expect(state.hasFilters).toBe(false);
	});

	it('toggleColor adds and removes colors', () => {
		const state = new SearchFilterState();

		state.toggleColor('W');
		expect(state.selectedColors.has('W')).toBe(true);
		expect(state.hasFilters).toBe(true);

		state.toggleColor('W');
		expect(state.selectedColors.has('W')).toBe(false);
		expect(state.hasFilters).toBe(false);
	});

	it('toggleRarity adds and removes rarities', () => {
		const state = new SearchFilterState();

		state.toggleRarity('rare');
		expect(state.selectedRarities.has('rare')).toBe(true);

		state.toggleRarity('rare');
		expect(state.selectedRarities.has('rare')).toBe(false);
	});

	it('builds color filters correctly', () => {
		const state = new SearchFilterState();
		state.toggleColor('W');
		state.toggleColor('U');

		const filters = state.meiliFilters;
		expect(filters.length).toBe(1);
		expect(filters[0]).toContain('colors = "W"');
		expect(filters[0]).toContain('colors = "U"');
		expect(filters[0]).toContain(' OR ');
	});

	it('builds rarity filters correctly', () => {
		const state = new SearchFilterState();
		state.toggleRarity('mythic');

		const filters = state.meiliFilters;
		expect(filters.length).toBe(1);
		expect(filters[0]).toContain('rarity = "mythic"');
	});

	it('combines multiple filter types', () => {
		const state = new SearchFilterState();
		state.toggleColor('R');
		state.toggleRarity('rare');
		state.typeQuery = 'Creature';

		const filters = state.meiliFilters;
		expect(filters.length).toBe(3);
	});

	it('clear resets all filters', () => {
		const state = new SearchFilterState();
		state.toggleColor('G');
		state.toggleRarity('uncommon');
		state.typeQuery = 'Instant';

		state.clear();

		expect(state.selectedColors.size).toBe(0);
		expect(state.selectedRarities.size).toBe(0);
		expect(state.typeQuery).toBe('');
		expect(state.meiliFilters).toEqual([]);
		expect(state.hasFilters).toBe(false);
	});
});
