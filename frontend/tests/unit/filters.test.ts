import { describe, it, expect, vi } from 'vitest';
import { SearchFilterState } from '../../src/lib/search/filters.svelte.ts';

describe('SearchFilterState', () => {
	it('excludes additional printed colors from a pure White AND Blue selection', () => {
		const state = new SearchFilterState();
		for (const color of ['W', 'U'] as const) {
			state.toggleColor(color);
			state.toggleColor(color);
		}
		expect(state.catalogFilters.colorMatch).toEqual({ field: 'color', any: [], all: ['W', 'U'] });
		expect(state.catalogFilters.colors).toEqual(['W', 'U']);
		const snapshot = state.catalogFilters;
		snapshot.colors!.push('R');
		snapshot.colorMatch!.all.push('G');
		expect(state.catalogFilters.colors).toEqual(['W', 'U']);
		expect(state.catalogFilters.colorMatch?.all).toEqual(['W', 'U']);
		state.setColorField('identity');
		expect(state.catalogFilters.colorIdentity).toEqual(['W', 'U']);
		expect(state.catalogFilters.colors).toBeUndefined();
		state.toggleColor('B');
		expect(state.catalogFilters.colorIdentity).toBeUndefined();
		state.clear();
		expect(state.catalogFilters.colorIdentity).toBeUndefined();
	});
	it('starts unfiltered with printed Color selected', () => {
		const state = new SearchFilterState();
		expect(state.catalogFilters).toEqual({
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
			all: ['B']
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
