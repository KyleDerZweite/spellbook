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
	it('includes every automatic NOT predicate, even when two exclusions produce an empty result', () => {
		const match = completeColorMatch({ field: 'color', any: ['W', 'U'], all: [] });
		expect(formatColorExpression(match).visual).toBe(
			'(White || Blue) && !Black && !Red && !Green && !Colorless'
		);
		expect(completeColorMatch(match)).toEqual(match);
		expect(
			formatColorExpression(
				completeColorMatch({ field: 'identity', any: [], all: [], not: ['R', 'B'] })
			).visual
		).toBe('!White && !Blue && !Black && !Red && !Green && !Colorless');
	});
});
