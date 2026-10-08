import { describe, expect, it } from 'vitest';
import type { DeckRule, EntryRule } from '@spellbook/contracts/category-library.ts';
import {
	collectDeckRulePredicates,
	collectDeckRuleRoots,
	evaluateDeckRule,
	type DeckRuleEntry
} from '@spellbook/backend/categories/deck-rules.ts';
import { evaluateEntryRule, type RuleFacts } from '@spellbook/backend/categories/library-rules.ts';
import { starterDefinitions } from '@spellbook/backend/categories/rules.ts';

const flying: EntryRule = { op: 'keyword', value: 'Flying' };
const land: EntryRule = { op: 'type', value: 'Land' };
const rampRoot = starterDefinitions.find((definition) => definition.origin === 'ramp')!.rootId!;
const entry = (
	facts: RuleFacts,
	quantity = 1,
	printingId = 'printing-a',
	role: DeckRuleEntry['role'] = 'main'
): DeckRuleEntry => ({ printingId, role, quantity, facts });
const run = (rule: DeckRule, entries: DeckRuleEntry[]) => evaluateDeckRule(rule, entries, ['main']);

describe('independent whole Deck rules', () => {
	it('uses quantity bounds and adopted roles without choosing a category winner', () => {
		const rule: DeckRule = { op: 'minimumCopies', predicate: flying, minimum: 3 };
		const entries = [
			entry({ keywords: ['Flying'] }, 2),
			entry({}, 2, 'unknown'),
			entry({ keywords: ['Flying'] }, 100, 'side', 'sideboard')
		];
		expect(run(rule, entries)).toMatchObject({
			truth: 'Unknown',
			evidence: { lower: '2', upper: '4' }
		});
		expect(run({ ...rule, minimum: 2 }, entries).truth).toBe('True');
		expect(run({ ...rule, minimum: 5 }, entries).truth).toBe('False');
		expect(evaluateDeckRule(rule, entries, ['sideboard']).truth).toBe('True');
	});
	it('deduplicates proven Oracle identities and unknown printing identities across roles', () => {
		const rule: DeckRule = { op: 'minimumDistinct', predicate: flying, minimum: 2 };
		const entries = [
			entry({ oracleId: 'oracle-a', keywords: ['Flying'] }, 30),
			entry({ oracleId: 'oracle-a', keywords: ['Flying'] }, 20, 'printing-b'),
			entry({ keywords: ['Flying'] }, 100, 'unknown'),
			entry({ keywords: ['Flying'] }, 100, 'unknown', 'commander'),
			entry({ keywords: [] }, 100, 'false')
		];
		expect(evaluateDeckRule(rule, entries, ['main', 'commander'])).toMatchObject({
			truth: 'Unknown',
			evidence: { lower: '1', upper: '2' }
		});
		expect(run({ ...rule, minimum: 3 }, entries).truth).toBe('False');
		expect(run({ ...rule, minimum: 1 }, [entry({ keywords: ['Flying'] })]).truth).toBe('Unknown');
		expect(
			run(rule, [entry({ keywords: ['Flying'] }), entry({ keywords: ['Flying'] }, 1, 'other')])
				.evidence.upper
		).toBe('2');
	});
	it('fails integrity for invalid quantities, including excluded roles', () => {
		for (const quantity of [0, -1, 0.5, NaN, Infinity, 2147483648, Number.MAX_SAFE_INTEGER]) {
			expect(() =>
				run({ op: 'minimumCopies', minimum: 1, predicate: flying }, [
					entry({}, quantity, 'bad', 'sideboard')
				])
			).toThrow(/integrity/);
		}
	});
	it('keeps exact evidence beyond safe numeric aggregation', () => {
		const entries = Array.from({ length: 500 }, (_, i) =>
			entry({ keywords: ['Flying'] }, 2147483647, String(i))
		);
		const result = run(
			{ op: 'percentage', basisPoints: 0, denominator: 'all-cards', predicate: flying },
			entries
		);
		expect(result.evidence.nonemptyContributionLower).toBe('10737418235000000');
		expect(() => JSON.stringify(result)).not.toThrow();
	});
	it('uses Kleene logic for nested rules and keeps Combo Unknown', () => {
		const unknown: DeckRule = {
			op: 'comboOutcome',
			outcomeId: '42',
			policyVersion: 'ingredients-v1'
		};
		const yes: DeckRule = {
			op: 'not',
			child: { op: 'minimumCopies', minimum: 1, predicate: flying }
		};
		expect(run({ op: 'any', children: [unknown, { op: 'not', child: unknown }] }, []).truth).toBe(
			'Unknown'
		);
		expect(run({ op: 'all', children: [unknown, { op: 'not', child: yes }] }, []).truth).toBe(
			'False'
		);
		expect(run({ op: 'any', children: [unknown, yes] }, []).truth).toBe('True');
	});
	it('collects nested predicates and deduplicated Oracle roots', () => {
		const predicate: EntryRule = {
			op: 'all',
			children: [
				{ op: 'mappedTrait', traitId: 'ramp', mappingVersion: 1 },
				{ op: 'oracleTag', tagId: rampRoot, includeDescendants: false }
			]
		};
		const rule: DeckRule = {
			op: 'not',
			child: {
				op: 'any',
				children: [
					{ op: 'minimumCopies', minimum: 1, predicate },
					{ op: 'percentage', predicate, denominator: 'nonland', basisPoints: 5000 }
				]
			}
		};
		expect(collectDeckRulePredicates(rule)).toEqual([predicate, predicate]);
		expect(collectDeckRuleRoots(rule)).toEqual([rampRoot]);
	});
	it('keeps copy and distinct bounds sound across all small identity and predicate completions', () => {
		const profiles: RuleFacts[] = [undefined, 'a', 'b'].flatMap((oracleId) =>
			[undefined, [], ['Flying']].map((keywords) => ({ oracleId, keywords }))
		);
		for (const left of profiles)
			for (const right of profiles) {
				const entries = [entry(left), entry(right, 2, 'other')];
				for (const op of ['minimumCopies', 'minimumDistinct'] as const)
					for (const minimum of [1, 2, 3, 4]) {
						const actual = run({ op, minimum, predicate: flying }, entries).truth;
						if (actual === 'Unknown') continue;
						for (const a of identityCompletions(left))
							for (const b of identityCompletions(right)) {
								const matches = [a, b].filter((facts) => facts.match);
								const count =
									op === 'minimumDistinct'
										? new Set(matches.map((facts) => facts.oracleId)).size
										: Number(a.match) + 2 * Number(b.match);
								expect(actual, JSON.stringify({ op, minimum, left, right, a, b })).toBe(
									count >= minimum ? 'True' : 'False'
								);
							}
					}
			}
	});
});

function identityCompletions(facts: RuleFacts) {
	const identities = facts.oracleId ? [facts.oracleId] : ['a', 'b', 'c', 'd'];
	const matches = facts.keywords == null ? [false, true] : [facts.keywords.includes('Flying')];
	return identities.flatMap((oracleId) => matches.map((match) => ({ oracleId, match })));
}

describe('exact joint percentage bounds', () => {
	it('excludes numerator cards outside the denominator and rejects empty denominators at zero', () => {
		const rule: DeckRule = {
			op: 'percentage',
			predicate: land,
			denominator: 'nonland',
			basisPoints: 1
		};
		expect(run(rule, [entry({ types: ['Land'] }), entry({ types: [] })]).truth).toBe('False');
		expect(run(rule, [entry({})]).truth).toBe('False');
		expect(run({ ...rule, basisPoints: 0 }, [entry({})]).truth).toBe('Unknown');
		expect(run({ ...rule, basisPoints: 0 }, [entry({ types: ['Land'] })]).truth).toBe('False');
		expect(run({ ...rule, basisPoints: 0 }, []).truth).toBe('False');
	});
	it('shares Land assumptions through nested predicates and mapped traits without inventing other types', () => {
		const nonland: EntryRule = {
			op: 'not',
			child: { op: 'mappedTrait', traitId: 'lands', mappingVersion: 1 }
		};
		const rule: DeckRule = {
			op: 'percentage',
			predicate: nonland,
			denominator: 'nonland',
			basisPoints: 10000
		};
		expect(run(rule, [entry({}), entry({ types: [] })]).truth).toBe('True');
		expect(run(rule, [entry({})]).truth).toBe('Unknown');
		expect(
			run(
				{
					...rule,
					predicate: { op: 'all', children: [nonland, { op: 'type', value: 'Creature' }] }
				},
				[entry({}), entry({ types: ['Creature'] })]
			).truth
		).toBe('Unknown');
		expect(evaluateEntryRule({ op: 'type', value: 'Creature' }, {}, false)).toBe('Unknown');
		expect(
			run({ ...rule, predicate: { op: 'mappedTrait', traitId: 'ramp', mappingVersion: 1 } }, [
				entry({ oracleId: 'oracle', roots: { [rampRoot]: [rampRoot] } }),
				entry({ types: [], oracleId: 'oracle-2', roots: { [rampRoot]: [rampRoot] } })
			]).truth
		).toBe('True');
	});
	it('compares exact basis point thresholds with maximum legal entry quantities', () => {
		const rule: DeckRule = {
			op: 'percentage',
			predicate: flying,
			denominator: 'all-cards',
			basisPoints: 5000
		};
		const entries = [
			entry({ keywords: ['Flying'] }, 2147483647),
			entry({ keywords: [] }, 2147483647, 'other')
		];
		expect(run(rule, entries)).toMatchObject({
			truth: 'True',
			evidence: { nonemptyContributionLower: '0', nonemptyContributionUpper: '0' }
		});
		expect(run({ ...rule, basisPoints: 5001 }, entries).truth).toBe('False');
		expect(run({ ...rule, basisPoints: 4999 }, entries).truth).toBe('True');
	});
	it('never returns a decisive result contradicted by an exhaustive small completion oracle', () => {
		const predicates: EntryRule[] = [
			land,
			flying,
			{ op: 'not', child: land },
			{ op: 'all', children: [land, flying] },
			{ op: 'any', children: [land, flying] },
			{ op: 'not', child: { op: 'all', children: [land, flying] } },
			{ op: 'type', value: 'Creature' },
			{ op: 'mappedTrait', traitId: 'lands', mappingVersion: 1 },
			{ op: 'mappedTrait', traitId: 'ramp', mappingVersion: 1 }
		];
		const profiles: RuleFacts[] = [
			{},
			{ types: [] },
			{ types: ['Land'] },
			{ types: ['Creature'] },
			{ keywords: [] },
			{ keywords: ['Flying'] },
			{ types: [], keywords: ['Flying'] },
			{ types: ['Land'], keywords: [] }
		].map((facts) => ({ ...facts, oracleId: 'oracle', roots: { [rampRoot]: [rampRoot] } }));
		for (const left of profiles)
			for (const right of profiles)
				for (const predicate of predicates)
					for (const denominator of ['all-cards', 'nonland'] as const)
						for (const basisPoints of [0, 1, 3333, 5000, 6667, 10000]) {
							const entries = [entry(left, 1), entry(right, 2, 'other')];
							const rule: DeckRule = { op: 'percentage', predicate, denominator, basisPoints };
							const actual = run(rule, entries).truth;
							if (actual === 'Unknown') continue;
							for (const a of completions(left))
								for (const b of completions(right)) {
									const completed = [a, b];
									let d = 0n,
										n = 0n;
									for (let i = 0; i < completed.length; i++) {
										const facts = completed[i];
										if (denominator === 'nonland' && facts.types.includes('Land')) continue;
										d += BigInt(i + 1);
										if (concretePredicate(predicate, facts)) n += BigInt(i + 1);
									}
									const expected =
										d > 0n && 10000n * n >= BigInt(basisPoints) * d ? 'True' : 'False';
									expect(actual, JSON.stringify({ rule, entries, completed })).toBe(expected);
								}
						}
	});
});

type CompleteFacts = { types: string[]; keywords: string[] };
function completions(facts: RuleFacts): CompleteFacts[] {
	const types =
		facts.types == null ? [[], ['Land'], ['Creature'], ['Land', 'Creature']] : [facts.types];
	const keywords = facts.keywords == null ? [[], ['Flying']] : [facts.keywords];
	return types.flatMap((types) => keywords.map((keywords) => ({ types, keywords })));
}
// This oracle evaluates actual complete facts, independently of the bound algorithm.
function concretePredicate(rule: EntryRule, facts: CompleteFacts): boolean {
	switch (rule.op) {
		case 'type':
			return facts.types.includes(rule.value);
		case 'keyword':
			return facts.keywords.includes(rule.value);
		case 'not':
			return !concretePredicate(rule.child, facts);
		case 'all':
			return rule.children.every((child) => concretePredicate(child, facts));
		case 'any':
			return rule.children.some((child) => concretePredicate(child, facts));
		case 'mappedTrait':
			return rule.traitId === 'lands'
				? facts.types.includes('Land')
				: !facts.types.includes('Land');
		default:
			throw new Error('Completion oracle received an unsupported test predicate');
	}
}
