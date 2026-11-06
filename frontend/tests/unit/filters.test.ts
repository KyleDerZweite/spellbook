import { describe, it, expect, vi } from 'vitest';
import { SearchFilterState } from '../../src/lib/search/filters.svelte.ts';

describe('SearchFilterState', () => {
	it('keeps Colorless neutral and independently removable in a completed chromatic palette', () => {
		const state = new SearchFilterState();
		state.toggleColor('W');
		state.toggleColor('U');
		expect(state.colorNot).toEqual(new Set(['B', 'R', 'G']));
		expect(state.selectedColors.has('C')).toBe(false);
		expect(state.colorCycleLocked).toBe(true);
		state.toggleColor('C');
		expect(state.colorAny.has('C')).toBe(true);
		state.toggleColor('C');
		expect(state.colorAll.has('C')).toBe(true);
		state.toggleColor('C');
		expect(state.colorNot.has('C')).toBe(true);
		state.toggleColor('C');
		expect(state.selectedColors.has('C')).toBe(false);
		state.toggleColor('C');
		state.removeColor('C');
		expect(state.selectedColors.has('C')).toBe(false);
		expect(state.colorCycleLocked).toBe(true);
	});
	it('completes other colors once when a second filter is set, then cycles three states', () => {
		const changed = vi.fn(),
			state = new SearchFilterState(changed);
		state.toggleColor('W');
		expect(state.colorCycleLocked).toBe(false);
		state.toggleColor('U');
		expect(changed).toHaveBeenCalledTimes(2);
		expect(state.colorCycleLocked).toBe(true);
		expect(state.colorNot).toEqual(new Set(['B', 'R', 'G']));
		state.toggleColor('R');
		expect(state.colorAny.has('R')).toBe(true);
		state.toggleColor('R');
		expect(state.colorAll.has('R')).toBe(true);
		state.toggleColor('R');
		expect(state.colorNot.has('R')).toBe(true);
		expect(state.selectedColors.size).toBe(5);
		state.removeColor('W');
		expect(state.colorNot.has('W')).toBe(true);
		state.clear();
		expect(state.colorCycleLocked).toBe(false);
		expect(state.hasFilters).toBe(false);
	});
	it('sends only the explicit predicate and preserves its independent snapshots across fields', () => {
		const state = new SearchFilterState();
		state.toggleColor('W');
		state.toggleColor('W');
		expect(state.catalogFilters).not.toHaveProperty('colors');
		state.toggleColor('U');
		state.toggleColor('U');
		expect(state.catalogFilters.colorMatch).toEqual({
			field: 'color',
			any: [],
			all: ['W', 'U'],
			not: ['B', 'R', 'G']
		});
		const snapshot = state.catalogFilters;
		snapshot.colorMatch!.all.push('G');
		snapshot.colorMatch!.not!.push('W');
		state.setColorField('identity');
		expect(state.catalogFilters.colorMatch).toEqual({
			field: 'identity',
			any: [],
			all: ['W', 'U'],
			not: ['B', 'R', 'G']
		});
		expect(state.catalogFilters).not.toHaveProperty('colorIdentity');
	});
	it('starts unfiltered with printed Color selected', () => {
		const state = new SearchFilterState();
		expect(state.catalogFilters).toEqual({
			languages: ['de', 'en'],
			colorMatch: { field: 'color', any: [], all: [] },
			rarities: [],
			types: [],
			legalities: []
		});
		expect(state.hasFilters).toBe(false);
	});
	it('cycles every color off to OR to AND to NOT to off, with one change notification per click', () => {
		const changed = vi.fn(),
			state = new SearchFilterState(changed);
		for (const color of ['W', 'U', 'B', 'R', 'G', 'C'] as const) {
			state.toggleColor(color);
			expect(state.catalogFilters.colorMatch).toEqual({ field: 'color', any: [color], all: [] });
			state.toggleColor(color);
			expect(state.catalogFilters.colorMatch).toEqual({ field: 'color', any: [], all: [color] });
			state.toggleColor(color);
			expect(state.catalogFilters.colorMatch).toEqual({
				field: 'color',
				any: [],
				all: [],
				not: [color]
			});
			state.toggleColor(color);
			expect(state.hasFilters).toBe(false);
		}
		expect(changed).toHaveBeenCalledTimes(24);
	});
	it('represents (White OR Blue) AND Black and preserves selections when switching fields', () => {
		const state = new SearchFilterState();
		state.toggleColor('W');
		state.toggleColor('U');
		state.toggleColor('B');
		state.toggleColor('B');
		state.setColorField('identity');
		expect(state.catalogFilters.colorMatch).toEqual({
			field: 'identity',
			any: ['W', 'U'],
			all: ['B'],
			not: ['R', 'G']
		});
		state.removeColor('W');
		expect(state.catalogFilters.colorMatch?.any).toEqual(['U']);
		state.removeColor('B');
		expect(state.catalogFilters.colorMatch?.all).toEqual([]);
	});
	it('keeps other categories independent and clears selections without changing the chosen field', () => {
		const state = new SearchFilterState();
		state.toggleColor('R');
		state.toggleRarity('rare');
		state.toggleType('Creature');
		state.toggleLegality('modern');
		expect(state.catalogFilters).toEqual({
			languages: ['de', 'en'],
			colorMatch: { field: 'color', any: ['R'], all: [] },
			rarities: ['rare'],
			types: ['Creature'],
			legalities: ['modern']
		});
		state.setColorField('identity');
		state.clear();
		expect(state.hasFilters).toBe(false);
		expect(state.colorField).toBe('identity');
	});
	it('takes independent snapshots for in-flight requests', () => {
		const state = new SearchFilterState();
		state.toggleColor('G');
		const before = state.catalogFilters;
		state.toggleColor('G');
		before.colorMatch!.any.push('W');
		before.legalities?.push('legacy');
		expect(state.catalogFilters.colorMatch).toEqual({ field: 'color', any: [], all: ['G'] });
		expect(state.catalogFilters.legalities).toEqual([]);
	});
});
