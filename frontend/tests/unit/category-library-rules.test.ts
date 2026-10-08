import { describe, expect, it } from 'vitest';
import { evaluateEntryRule, validateRule } from '@spellbook/backend/categories/library-rules.ts';
import { evaluatePrimary, starterDefinitions } from '@spellbook/backend/categories/rules.ts';

describe('account category rule authority', () => {
	it('blocks lower matches at a higher custom Unknown and resolves priority ties by stable origin, not presentation order', () => {
		const seed = starterDefinitions[0];
		const custom = (
			originId: string,
			rule: Parameters<typeof evaluateEntryRule>[0],
			displayOrder: number
		) => ({
			...seed,
			id: originId,
			origin: 'custom' as const,
			originId,
			rule,
			priority: 4,
			displayOrder
		});
		const first = custom(
			'00000000-0000-4000-8000-000000000001',
			{ op: 'keyword', value: 'Flying' },
			100
		);
		const second = custom(
			'00000000-0000-4000-8000-000000000002',
			{ op: 'type', value: 'Land' },
			-100
		);
		expect(
			evaluatePrimary([second, ...starterDefinitions, first], {
				types: ['Land'],
				canonical: true,
				roots: {}
			})
		).toMatchObject({ state: 'Pending', definitionId: null });
		expect(
			evaluatePrimary([second, ...starterDefinitions, first], {
				types: ['Land'],
				keywords: [],
				canonical: true,
				roots: {}
			})
		).toMatchObject({ state: 'Automatic', definitionId: second.id });
	});
	it('keeps missing facts Unknown through negation and optional combo predicates', () => {
		expect(evaluateEntryRule({ op: 'not', child: { op: 'keyword', value: 'Flying' } }, {})).toBe(
			'Unknown'
		);
		expect(evaluateEntryRule({ op: 'keyword', value: 'Flying' }, { keywords: [] })).toBe('False');
		expect(
			evaluateEntryRule(
				{
					op: 'not',
					child: { op: 'comboParticipant', outcomeId: '42', policyVersion: 'ingredients-v1' }
				},
				{}
			)
		).toBe('Unknown');
	});
	it('short circuits only decisive three-valued results', () => {
		const missing = { op: 'keyword' as const, value: 'Flying' };
		const known = { op: 'type' as const, value: 'Creature' };
		expect(evaluateEntryRule({ op: 'all', children: [missing, known] }, { types: ['Land'] })).toBe(
			'False'
		);
		expect(
			evaluateEntryRule({ op: 'any', children: [missing, known] }, { types: ['Creature'] })
		).toBe('True');
	});
	it('rejects a whole-tree limit before recursive parsing, and rejects wrong-scope or extra fields', () => {
		let tree: unknown = { op: 'type', value: 'Land' };
		for (let i = 0; i < 10000; i++) tree = { op: 'not', child: tree };
		expect(() => validateRule(tree, 'entry')).toThrow(/depth/i);
		expect(() =>
			validateRule(
				{ op: 'all', children: Array.from({ length: 128 }, () => ({ op: 'type', value: 'Land' })) },
				'entry'
			)
		).toThrow(/nodes/i);
		expect(() =>
			validateRule(
				{ op: 'minimumCopies', predicate: { op: 'type', value: 'Land' }, minimum: 2 },
				'entry'
			)
		).toThrow();
		expect(() => validateRule({ op: 'type', value: 'Land', inferred: true }, 'entry')).toThrow();
	});
	it('counts canonical selections across the entire aggregate tree', () => {
		const ids = Array.from(
			{ length: 51 },
			(_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
		);
		expect(() =>
			validateRule(
				{
					op: 'all',
					children: [0, 1].map(() => ({
						op: 'minimumDistinct',
						minimum: 1,
						predicate: { op: 'canonicalCards', oracleIds: ids }
					}))
				},
				'deck'
			)
		).toThrow(/selections/i);
	});
});
