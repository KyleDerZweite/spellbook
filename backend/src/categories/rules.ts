import type {
	EntryDefinition,
	PredicateEvidence,
	StarterOrigin
} from '@spellbook/contracts/categories.ts';
import type { Truth } from '@spellbook/contracts/category-library.ts';
import { evaluateEntryRule } from './library-rules.ts';
const seeds: [StarterOrigin, string, string | null][] = [
	['lands', 'Lands', null],
	['board-wipes', 'Board wipes', '3fb7e4fd-5304-4120-b7c4-8a89f70ad3f0'],
	['counterspells', 'Counterspells', '690fc968-48ba-4854-a948-3db6bf19d3a9'],
	['removal', 'Removal', 'cc12d27d-1d0e-4849-9551-71caead74d24'],
	['ramp', 'Ramp', '2f3e4ad7-5e60-41b4-bdbc-653f16869cf6'],
	['draw', 'Draw', 'b6448c45-ce65-4848-aa98-2151e4e07437'],
	['protection', 'Protection', '6e2cdc7c-b02c-4b59-a171-f93723721b79'],
	['recursion', 'Recursion', '82b824ad-648f-467f-a190-2e0fa9a795d2']
];
export const starterDefinitions: EntryDefinition[] = seeds.map(([origin, name, rootId], index) => ({
	id: `15ca0000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
	origin,
	name,
	rootId,
	version: 1,
	policyVersion: 1,
	mappingVersion: 1,
	priority: index,
	displayOrder: index,
	descendants: true,
	excludeLand: origin === 'ramp'
}));
export type PrimaryFacts = {
	comboForDefinition?: (definition: EntryDefinition) => Record<string, Truth>;
	types: string[] | null;
	canonical: boolean;
	oracleId?: string | null;
	keywords?: string[] | null;
	roots: Record<string, string[] | undefined>;
};
export function orderCategoryDefinitions(bundle: EntryDefinition[]) {
	return bundle
		.filter((d) => d.automaticEligible !== false)
		.sort((a, b) => {
			const custom = Number(b.origin === 'custom') - Number(a.origin === 'custom');
			if (custom) return custom;
			if (a.priority !== b.priority) return a.priority - b.priority;
			const left = a.originId ?? a.id,
				right = b.originId ?? b.id;
			return left < right ? -1 : left > right ? 1 : 0;
		});
}
export function evaluatePrimary(
	bundle: EntryDefinition[],
	facts: PrimaryFacts,
	ordered = false
): {
	state: 'Automatic' | 'Pending';
	origin: EntryDefinition['origin'] | null;
	definitionId: string | null;
	predicates: PredicateEvidence[];
} {
	const predicates: PredicateEvidence[] = [];
	for (const rule of ordered ? bundle : orderCategoryDefinitions(bundle)) {
		let result: PredicateEvidence['result'];
		const matches = rule.rootId && facts.canonical ? facts.roots[rule.rootId] : undefined;
		if (rule.rule)
			result = evaluateEntryRule(rule.rule, {
				...facts,
				comboParticipants: facts.comboForDefinition?.(rule),
				oracleId: facts.canonical ? facts.oracleId : null
			});
		else if (rule.origin === 'lands')
			result = facts.types === null ? 'Unknown' : facts.types.includes('Land') ? 'True' : 'False';
		else if (rule.excludeLand && facts.types?.includes('Land')) result = 'False';
		else
			result =
				!facts.canonical || matches === undefined || (rule.excludeLand && facts.types === null)
					? 'Unknown'
					: matches.length
						? 'True'
						: 'False';
		predicates.push({
			origin: rule.origin,
			definitionId: rule.id,
			result,
			matchedTagIds: matches ?? []
		});
		if (result === 'Unknown')
			return { state: 'Pending', origin: null, definitionId: null, predicates };
		if (result === 'True')
			return {
				state: 'Automatic',
				origin: rule.origin,
				definitionId: rule.id,
				predicates
			};
	}
	return { state: 'Automatic', origin: null, definitionId: null, predicates };
}
