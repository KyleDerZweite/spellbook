import { describe, expect, it } from 'vitest';
import { evaluatePrimary, starterDefinitions } from '@spellbook/backend/categories/rules.ts';

describe('accepted primary entry rules', () => {
	it('uses Ramp before Draw for a multipurpose card and keeps Lands out of Ramp', () => {
		const facts = {
			types: ['Creature'],
			canonical: true,
			roots: Object.fromEntries(
				starterDefinitions.filter((d) => d.rootId).map((d) => [d.rootId!, [] as string[]])
			)
		};
		facts.roots['2f3e4ad7-5e60-41b4-bdbc-653f16869cf6'] = ['land-ramp'];
		facts.roots['b6448c45-ce65-4848-aa98-2151e4e07437'] = ['pure-draw'];
		expect(evaluatePrimary(starterDefinitions, facts).origin).toBe('ramp');
		expect(evaluatePrimary(starterDefinitions, { ...facts, types: ['Land'] }).origin).toBe('lands');
	});
	it('blocks lower matches when higher facts are unknown and does not mistake identity fallback for false', () => {
		expect(
			evaluatePrimary(starterDefinitions, { types: null, canonical: true, roots: {} }).state
		).toBe('Pending');
		expect(
			evaluatePrimary(starterDefinitions, { types: ['Creature'], canonical: false, roots: {} })
				.state
		).toBe('Pending');
	});
	it('keeps genuine known absence distinct from missing roots', () => {
		const roots = Object.fromEntries(
			starterDefinitions.filter((d) => d.rootId).map((d) => [d.rootId!, []])
		);
		expect(
			evaluatePrimary(starterDefinitions, { types: ['Creature'], canonical: true, roots })
		).toMatchObject({ state: 'Automatic', origin: null });
		expect(
			evaluatePrimary(starterDefinitions, { types: ['Creature'], canonical: true, roots: {} }).state
		).toBe('Pending');
	});
});
