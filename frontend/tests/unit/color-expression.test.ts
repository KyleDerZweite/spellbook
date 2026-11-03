import { describe, expect, it } from 'vitest';
import { completeColorMatch, formatColorExpression } from '#lib/search/color-filters.ts';

describe('color expression presentation', () => {
	it('groups OR before conjunctions and names exclusions for assistive technology', () => {
		expect(
			formatColorExpression({ field: 'identity', any: ['U', 'W'], all: ['B'], not: ['R'] })
		).toEqual({
			visual: '(White || Blue) && Black && !Red',
			spoken: '(White OR Blue) AND Black AND NOT Red'
		});
	});
	it('shows actual single predicates, empty field context and contradictory Colorless conditions', () => {
		expect(formatColorExpression({ field: 'color', any: [], all: [] }).visual).toBe('Any color');
		expect(formatColorExpression({ field: 'identity', any: [], all: [] }).visual).toBe(
			'Any color identity'
		);
		expect(formatColorExpression({ field: 'color', any: ['W'], all: [] }).visual).toBe('White');
		expect(formatColorExpression({ field: 'color', any: [], all: ['W'] }).visual).toBe('White');
		expect(formatColorExpression({ field: 'color', any: [], all: [], not: ['C'] }).visual).toBe(
			'!Colorless'
		);
		expect(formatColorExpression({ field: 'color', any: [], all: ['W', 'C'] }).visual).toBe(
			'White && Colorless'
		);
	});
	it('includes every automatic NOT predicate, without inventing a Colorless exclusion', () => {
		const match = completeColorMatch({ field: 'color', any: ['W', 'U'], all: [] });
		expect(formatColorExpression(match).visual).toBe('(White || Blue) && !Black && !Red && !Green');
		expect(completeColorMatch(match)).toEqual(match);
		expect(
			formatColorExpression(
				completeColorMatch({ field: 'identity', any: [], all: [], not: ['R', 'B'] })
			).visual
		).toBe('!White && !Blue && !Black && !Red && !Green');
	});
	it('preserves explicit Colorless choices without changing a caller snapshot', () => {
		for (const group of ['any', 'all', 'not'] as const) {
			const input = {
				field: 'color' as const,
				any: ['W' as const],
				all: [],
				not: [],
				[group]: ['C' as const]
			};
			const before = structuredClone(input);
			const completed = completeColorMatch(input);
			expect(completed[group]).toContain('C');
			expect(input).toEqual(before);
			expect(completeColorMatch(completed)).toEqual(completed);
		}
	});
	it('abbreviates visual colors without losing the full accessible expression', () => {
		expect(
			formatColorExpression(
				{ field: 'color', any: ['W', 'U', 'C'], all: [], not: ['B', 'R', 'G'] },
				true
			)
		).toEqual({
			visual: '(W || U || C) && !B && !R && !G',
			spoken: '(White OR Blue OR Colorless) AND NOT Black AND NOT Red AND NOT Green'
		});
	});
});
