import { describe, it, expect } from 'vitest';
import { SearchFilterState } from '../../src/lib/search/filters.svelte.ts';

describe('SearchFilterState', () => {
	it('keeps the default standard and commander legality selection', () => {
		const state = new SearchFilterState();
		expect(state.catalogFilters).toEqual({
			colors: [],
			rarities: [],
			types: [],
			legalities: ['standard', 'commander']
		});
		expect(state.hasFilters).toBe(true);
	});

	it('toggles every category without changing the other categories', () => {
		const state = new SearchFilterState();
		state.clear();
		state.toggleColor('R');
		state.toggleRarity('rare');
		state.toggleType('Creature');
		state.toggleLegality('modern');
		expect(state.catalogFilters).toEqual({
			colors: ['R'],
			rarities: ['rare'],
			types: ['Creature'],
			legalities: ['modern']
		});
		state.toggleColor('R');
		state.toggleRarity('rare');
		state.toggleType('Creature');
		state.toggleLegality('modern');
		expect(state.hasFilters).toBe(false);
	});

	it('preserves colorless as an explicit option for server subset filtering', () => {
		const state = new SearchFilterState();
		state.clear();
		state.toggleColor('C');
		expect(state.catalogFilters.colors).toEqual(['C']);
		state.toggleColor('R');
		expect(state.catalogFilters.colors).toEqual(['C', 'R']);
		state.toggleColor('C');
		expect(state.catalogFilters.colors).toEqual(['R']);
	});

	it('takes independent filter snapshots for in-flight requests', () => {
		const state = new SearchFilterState();
		const before = state.catalogFilters;
		state.toggleColor('G');
		before.legalities?.push('legacy');
		expect(before.colors).toEqual([]);
		expect(state.catalogFilters.colors).toEqual(['G']);
		expect(state.catalogFilters.legalities).toEqual(['standard', 'commander']);
	});

	it('clears all selections including default legalities', () => {
		const state = new SearchFilterState();
		state.toggleColor('G');
		state.toggleRarity('uncommon');
		state.toggleType('Instant');
		state.clear();
		expect(state.catalogFilters).toEqual({ colors: [], rarities: [], types: [], legalities: [] });
		expect(state.hasFilters).toBe(false);
	});
});
