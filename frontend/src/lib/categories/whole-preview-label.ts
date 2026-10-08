import type { CategoryDifference } from '@spellbook/contracts/category-library.ts';
import { describeCategoryRule } from './rule-summary.ts';

/** Every whole consequence describes the frozen version and effective membership. */
export function describeWholeCategoryConsequence(value: CategoryDifference['before']) {
	if (!value || !('definition' in value)) return null;
	const decision = value.decision;
	let outcome: string;
	if (decision?.state === 'Manual')
		outcome = `Manual ${decision.manual}; ${decision.manual === 'Include' ? 'membership' : 'no membership'}.`;
	else if (!value.automaticActive) outcome = 'Historical inactive version; no membership.';
	else if (decision?.state === 'Pending')
		outcome = `Pending; retained ${decision.truth ?? 'no valid result'}; ${decision.truth === 'True' ? 'membership retained' : 'no membership'}. Latest attempt ${decision.attemptedTruth ?? 'Unknown'}.`;
	else
		outcome = `Automatic ${decision?.truth ?? 'Unknown'}; ${decision?.truth === 'True' ? 'membership' : 'no membership'}.`;
	if (value.suppressed)
		outcome = `Suppressed; no membership. Stored ${decision?.state ?? 'undecided'} ${decision?.manual ?? decision?.truth ?? 'Unknown'}.`;
	return {
		title: `${value.name}, version ${value.definition.version}`,
		versionId: value.versionId,
		definitionName: value.definition.name,
		meaning: value.definition.meaning,
		criteria: `${describeCategoryRule(value.definition.rule)} Roles: ${value.definition.roles.join(', ')}.`,
		outcome
	};
}
