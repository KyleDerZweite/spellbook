import { ValidationError } from './validation.ts';

/** Shared, data-only sorting DSL. Version 1 is executable offline on the Jetson. */
export type SortField = 'printedColor' | 'rarity' | 'setCode';
export interface SortPredicate {
	field: SortField;
	oneOf: string[];
}
export interface SortRule {
	when: SortPredicate[];
	slot: number;
}
export interface CardstationSortRuleV1 {
	dsl: 'spellbook.cardstation.sort';
	version: 1;
	name: string;
	rules: SortRule[];
	fallbackSlot: number;
}
export interface SortObservation {
	reliable: boolean;
	printedColor?: string;
	rarity?: string;
	setCode?: string;
}

const allowed: Record<SortField, readonly string[] | RegExp> = {
	printedColor: ['white', 'blue', 'black', 'red', 'green', 'multicolor', 'colorless'],
	rarity: ['common', 'uncommon', 'rare', 'mythic', 'special', 'bonus'],
	setCode: /^[a-z0-9]{2,6}$/
};

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value))
		throw new ValidationError('Sort DSL value must be an object');
	const item = value as Record<string, unknown>;
	if (Object.keys(item).some((key) => !keys.includes(key)))
		throw new ValidationError('Unknown Sort DSL property');
	return item;
}

function slot(value: unknown): number {
	if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 8)
		throw new ValidationError('Sort slot must be an integer from 1 through 8');
	return value;
}

function matches(field: SortField, value: unknown): value is string {
	if (typeof value !== 'string') return false;
	const restriction = allowed[field];
	return restriction instanceof RegExp ? restriction.test(value) : restriction.includes(value);
}

export function parseCardstationSortRule(input: unknown): CardstationSortRuleV1 {
	const document = object(input, ['dsl', 'version', 'name', 'rules', 'fallbackSlot']);
	if (document.dsl !== 'spellbook.cardstation.sort' || document.version !== 1)
		throw new ValidationError('Unsupported Sort DSL version');
	if (typeof document.name !== 'string' || !document.name.trim() || document.name.length > 100)
		throw new ValidationError('Invalid Sort DSL name');
	if (!Array.isArray(document.rules) || document.rules.length > 64)
		throw new ValidationError('Invalid Sort DSL rules');
	const rules: SortRule[] = document.rules.map((entry) => {
		const rule = object(entry, ['when', 'slot']);
		if (!Array.isArray(rule.when) || rule.when.length < 1 || rule.when.length > 3)
			throw new ValidationError('Each Sort rule needs 1 to 3 predicates');
		const seen = new Set<SortField>();
		const when: SortPredicate[] = rule.when.map((entry) => {
			const condition = object(entry, ['field', 'oneOf']);
			const field = condition.field;
			if (typeof field !== 'string' || !(field in allowed))
				throw new ValidationError('Unknown Sort DSL field');
			const typedField = field as SortField;
			if (seen.has(typedField)) throw new ValidationError('Repeated field in one rule');
			seen.add(typedField);
			if (
				!Array.isArray(condition.oneOf) ||
				condition.oneOf.length < 1 ||
				condition.oneOf.some((value) => !matches(typedField, value)) ||
				new Set(condition.oneOf).size !== condition.oneOf.length
			)
				throw new ValidationError('Invalid Sort predicate values');
			return { field: typedField, oneOf: [...condition.oneOf] };
		});
		return { when, slot: slot(rule.slot) };
	});
	return {
		dsl: 'spellbook.cardstation.sort',
		version: 1,
		name: document.name,
		rules,
		fallbackSlot: slot(document.fallbackSlot)
	};
}

/** The first matching rule wins; unreliable recognition always uses Reject. */
export function selectCardstationSortSlot(
	rule: CardstationSortRuleV1,
	observation: SortObservation
): number {
	if (observation.reliable !== true) return rule.fallbackSlot;
	for (const option of rule.rules) {
		if (
			option.when.every(
				(predicate) =>
				matches(predicate.field, observation[predicate.field]) &&
				predicate.oneOf.includes(observation[predicate.field]!)
			)
		)
			return option.slot;
	}
	return rule.fallbackSlot;
}
