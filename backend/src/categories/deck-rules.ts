import type {
	CategoryRole,
	DeckRule,
	EntryRule,
	Truth
} from '@spellbook/contracts/category-library.ts';
import { evaluateEntryRule, ruleRoots, type RuleFacts } from './library-rules.ts';

export type DeckRuleEntry = {
	printingId: string;
	role: CategoryRole;
	quantity: number;
	facts: RuleFacts;
};
export type DeckRuleEvidence = import('@spellbook/contracts/whole-categories.ts').WholeRuleEvidence;
export type DeckRuleEvaluation = { truth: Truth; evidence: DeckRuleEvidence };

/** Inputs are persisted quantities. Corrupt data must not produce a classification. */
export function evaluateDeckRule(
	rule: DeckRule,
	entries: readonly DeckRuleEntry[],
	roles: readonly CategoryRole[],
	comboOutcomes: Record<string, Truth> = {}
): DeckRuleEvaluation {
	for (const entry of entries) {
		if (!Number.isInteger(entry.quantity) || entry.quantity < 1 || entry.quantity > 2147483647)
			throw new Error('Deck rule integrity: quantity must be a positive PostgreSQL integer');
	}
	const participating = entries.filter((entry) => roles.includes(entry.role));
	const evidence = evaluate(rule, participating, comboOutcomes);
	return { truth: evidence.truth, evidence };
}

function evaluate(
	rule: DeckRule,
	entries: readonly DeckRuleEntry[],
	comboOutcomes: Record<string, Truth>
): DeckRuleEvidence {
	switch (rule.op) {
		case 'all':
		case 'any': {
			const children = rule.children.map((child) => evaluate(child, entries, comboOutcomes));
			const truths = children.map((child) => child.truth);
			const truth =
				rule.op === 'all'
					? truths.includes('False')
						? 'False'
						: truths.includes('Unknown')
							? 'Unknown'
							: 'True'
					: truths.includes('True')
						? 'True'
						: truths.includes('Unknown')
							? 'Unknown'
							: 'False';
			return { op: rule.op, truth, children };
		}
		case 'not': {
			const child = evaluate(rule.child, entries, comboOutcomes);
			return {
				op: rule.op,
				truth: child.truth === 'Unknown' ? 'Unknown' : child.truth === 'True' ? 'False' : 'True',
				children: [child]
			};
		}
		case 'comboOutcome':
			return { op: rule.op, truth: comboOutcomes[rule.outcomeId] ?? 'Unknown' };
		case 'minimumCopies': {
			let lower = 0n,
				upper = 0n;
			for (const entry of entries) {
				const truth = evaluateEntryRule(rule.predicate, entry.facts);
				if (truth === 'True') lower += BigInt(entry.quantity);
				if (truth !== 'False') upper += BigInt(entry.quantity);
			}
			return bounds(rule, lower, upper);
		}
		case 'minimumDistinct': {
			const proven = new Set<string>(),
				possible = new Set<string>(),
				unknownPrintings = new Set<string>();
			for (const entry of entries) {
				const truth = evaluateEntryRule(rule.predicate, entry.facts);
				if (entry.facts.oracleId) {
					if (truth === 'True') proven.add(entry.facts.oracleId);
					if (truth !== 'False') possible.add(entry.facts.oracleId);
				} else if (truth !== 'False') unknownPrintings.add(entry.printingId);
			}
			return bounds(rule, BigInt(proven.size), BigInt(possible.size + unknownPrintings.size));
		}
		case 'percentage':
			return percentage(rule, entries);
	}
}

function bounds(
	rule: Extract<DeckRule, { minimum: number }>,
	lower: bigint,
	upper: bigint
): DeckRuleEvidence {
	const minimum = BigInt(rule.minimum);
	return {
		op: rule.op,
		truth: lower >= minimum ? 'True' : upper < minimum ? 'False' : 'Unknown',
		lower: lower.toString(),
		upper: upper.toString()
	};
}

type State = { denominator: boolean; numerator: boolean };
function possibleStates(rule: Extract<DeckRule, { op: 'percentage' }>, facts: RuleFacts): State[] {
	const lands = facts.types == null ? [false, true] : [facts.types.includes('Land')];
	const states: State[] = [];
	for (const land of lands) {
		const denominator = rule.denominator === 'all-cards' || !land;
		if (!denominator) {
			states.push({ denominator: false, numerator: false });
			continue;
		}
		// Only Land membership is assumed. Other unknown types remain unknown.
		const truth = evaluateEntryRule(rule.predicate, facts, land);
		if (truth !== 'True') states.push({ denominator: true, numerator: false });
		if (truth !== 'False') states.push({ denominator: true, numerator: true });
	}
	return states;
}

type Interval = { lower: bigint; upper: bigint };
function extend(interval: Interval | null, amount: bigint): Interval | null {
	return (
		interval && {
			lower: interval.lower + amount,
			upper: interval.upper + amount
		}
	);
}
function merge(left: Interval | null, right: Interval | null): Interval | null {
	if (!left) return right;
	if (!right) return left;
	return {
		lower: left.lower < right.lower ? left.lower : right.lower,
		upper: left.upper > right.upper ? left.upper : right.upper
	};
}

function percentage(
	rule: Extract<DeckRule, { op: 'percentage' }>,
	entries: readonly DeckRuleEntry[]
): DeckRuleEvidence {
	let empty: Interval | null = { lower: 0n, upper: 0n },
		nonempty: Interval | null = null;
	let lower = 0n,
		upper = 0n,
		denominatorLower = 0n,
		denominatorUpper = 0n;
	for (const entry of entries) {
		const states = possibleStates(rule, entry.facts);
		const quantity = BigInt(entry.quantity);
		if (states.every((state) => state.numerator)) lower += quantity;
		if (states.some((state) => state.numerator)) upper += quantity;
		if (states.every((state) => state.denominator)) denominatorLower += quantity;
		if (states.some((state) => state.denominator)) denominatorUpper += quantity;
		let nextEmpty: Interval | null = null,
			nextNonempty: Interval | null = null;
		for (const state of states) {
			const contribution =
				quantity *
				(10000n * BigInt(state.numerator) - BigInt(rule.basisPoints) * BigInt(state.denominator));
			nextNonempty = merge(nextNonempty, extend(nonempty, contribution));
			if (state.denominator) nextNonempty = merge(nextNonempty, extend(empty, contribution));
			else nextEmpty = merge(nextEmpty, extend(empty, contribution));
		}
		empty = nextEmpty;
		nonempty = nextNonempty;
	}
	const truth =
		!nonempty || nonempty.upper < 0n
			? 'False'
			: !empty && nonempty.lower >= 0n
				? 'True'
				: 'Unknown';
	return {
		op: rule.op,
		truth,
		lower: lower.toString(),
		upper: upper.toString(),
		denominatorLower: denominatorLower.toString(),
		denominatorUpper: denominatorUpper.toString(),
		nonemptyContributionLower: nonempty?.lower.toString() ?? null,
		nonemptyContributionUpper: nonempty?.upper.toString() ?? null,
		emptyDenominatorPossible: empty !== null
	};
}

export function collectDeckRulePredicates(rule: DeckRule): EntryRule[] {
	if (rule.op === 'all' || rule.op === 'any')
		return rule.children.flatMap(collectDeckRulePredicates);
	if (rule.op === 'not') return collectDeckRulePredicates(rule.child);
	return 'predicate' in rule ? [rule.predicate] : [];
}
export function collectDeckRuleRoots(rule: DeckRule): string[] {
	return [...new Set(collectDeckRulePredicates(rule).flatMap(ruleRoots))];
}
