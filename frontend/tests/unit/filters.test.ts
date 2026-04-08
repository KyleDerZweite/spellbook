import { describe, it, expect } from 'vitest';
import { SearchFilterState } from '../../src/lib/search/filters.svelte';

describe('SearchFilterState', () => {
	it('starts with default legality filters', () => {
		const state = new SearchFilterState();
		expect(state.selectedColors.size).toBe(0);
		expect(state.selectedRarities.size).toBe(0);
		expect(state.selectedTypes.size).toBe(0);
		expect(state.selectedLegalities.size).toBe(2);
		expect(state.selectedLegalities.has('standard')).toBe(true);
		expect(state.selectedLegalities.has('commander')).toBe(true);
		expect(state.hasFilters).toBe(true);
	});

	it('toggleColor adds and removes colors', () => {
		const state = new SearchFilterState();
		state.clear();

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
		state.clear();
		state.toggleColor('W');
		state.toggleColor('U');

		const filters = state.meiliFilters;
		expect(filters.length).toBe(1);
		expect(filters[0]).toContain('colors = "W"');
		expect(filters[0]).toContain('colors = "U"');
		expect(filters[0]).toContain('NOT colors = "B"');
		expect(filters[0]).toContain('NOT colors = "R"');
		expect(filters[0]).toContain('NOT colors = "G"');
		expect(filters[0]).toContain('colors IS NOT EMPTY');
	});

	it('builds colorless filter using IS EMPTY', () => {
		const state = new SearchFilterState();
		state.clear();
		state.toggleColor('C');

		const filters = state.meiliFilters;
		expect(filters.length).toBe(1);
		expect(filters[0]).toContain('colors IS EMPTY');
	});

	it('combines colorless with other color filters', () => {
		const state = new SearchFilterState();
		state.clear();
		state.toggleColor('C');
		state.toggleColor('R');

		const filters = state.meiliFilters;
		expect(filters.length).toBe(1);
		expect(filters[0]).toContain('colors IS EMPTY');
		expect(filters[0]).toContain('colors = "R"');
		expect(filters[0]).toContain('NOT colors = "W"');
		expect(filters[0]).toContain('NOT colors = "U"');
		expect(filters[0]).toContain('NOT colors = "B"');
		expect(filters[0]).toContain('NOT colors = "G"');
	});

	it('single-color filter excludes cards with extra colors', () => {
		const state = new SearchFilterState();
		state.clear();
		state.toggleColor('R');

		expect(state.meiliFilters[0]).toContain('colors = "R"');
		expect(state.meiliFilters[0]).toContain('NOT colors = "W"');
		expect(state.meiliFilters[0]).toContain('NOT colors = "U"');
		expect(state.meiliFilters[0]).toContain('NOT colors = "B"');
		expect(state.meiliFilters[0]).toContain('NOT colors = "G"');
		expect(state.meiliFilters[0]).toContain('colors IS NOT EMPTY');
		expect(state.meiliFilters[0]).not.toContain('colors IS EMPTY) OR');
	});

	it('multi-color filter allows only selected colors and their subsets', () => {
		const state = new SearchFilterState();
		state.clear();
		state.toggleColor('R');
		state.toggleColor('B');

		expect(state.meiliFilters[0]).toContain('colors = "R"');
		expect(state.meiliFilters[0]).toContain('colors = "B"');
		expect(state.meiliFilters[0]).toContain('NOT colors = "W"');
		expect(state.meiliFilters[0]).toContain('NOT colors = "U"');
		expect(state.meiliFilters[0]).toContain('NOT colors = "G"');
		expect(state.meiliFilters[0]).toContain('colors IS NOT EMPTY');
	});

	it('builds rarity filters correctly', () => {
		const state = new SearchFilterState();
		state.clear();
		state.toggleRarity('mythic');

		const filters = state.meiliFilters;
		expect(filters.length).toBe(1);
		expect(filters[0]).toContain('rarity = "mythic"');
	});

	it('toggleType adds and removes types', () => {
		const state = new SearchFilterState();
		state.clear();

		state.toggleType('Creature');
		expect(state.selectedTypes.has('Creature')).toBe(true);
		expect(state.hasFilters).toBe(true);

		state.toggleType('Creature');
		expect(state.selectedTypes.has('Creature')).toBe(false);
		expect(state.hasFilters).toBe(false);
	});

	it('builds type filters correctly', () => {
		const state = new SearchFilterState();
		state.clear();
		state.toggleType('Instant');
		state.toggleType('Sorcery');

		const filters = state.meiliFilters;
		expect(filters.length).toBe(1);
		expect(filters[0]).toContain('card_types = "Instant"');
		expect(filters[0]).toContain('card_types = "Sorcery"');
		expect(filters[0]).toContain(' OR ');
	});

	it('toggleLegality adds and removes formats', () => {
		const state = new SearchFilterState();
		state.clear();

		state.toggleLegality('commander');
		expect(state.selectedLegalities.has('commander')).toBe(true);
		expect(state.hasFilters).toBe(true);

		state.toggleLegality('commander');
		expect(state.selectedLegalities.has('commander')).toBe(false);
		expect(state.hasFilters).toBe(false);
	});

	it('builds legality filters correctly', () => {
		const state = new SearchFilterState();
		state.clear();
		state.toggleLegality('modern');

		const filters = state.meiliFilters;
		expect(filters.length).toBe(1);
		expect(filters[0]).toContain('legalities.modern = "legal"');
	});

	it('combines multiple filter types', () => {
		const state = new SearchFilterState();
		state.toggleColor('R');
		state.toggleRarity('rare');
		state.toggleType('Creature');
		// standard and commander already active by default
		state.toggleLegality('modern');

		const filters = state.meiliFilters;
		expect(filters.length).toBe(4);
	});

	it('clear resets all filters including defaults', () => {
		const state = new SearchFilterState();
		state.toggleColor('G');
		state.toggleRarity('uncommon');
		state.toggleType('Instant');

		state.clear();

		expect(state.selectedColors.size).toBe(0);
		expect(state.selectedRarities.size).toBe(0);
		expect(state.selectedTypes.size).toBe(0);
		expect(state.selectedLegalities.size).toBe(0);
		expect(state.meiliFilters).toEqual([]);
		expect(state.hasFilters).toBe(false);
	});
});
