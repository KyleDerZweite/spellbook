import type {
	DeckEntryCategories,
	EntryCategoryDecision,
	PredicateEvidence
} from '@spellbook/contracts/categories.ts';

/** Preserve a saved Manual meaning when Review reuses its local category identity. */
export function categoryDecisionPresentation(
	categories: DeckEntryCategories,
	decision?: EntryCategoryDecision
) {
	const adopted = categories.definitions.find((d) => d.id === decision?.categoryId);
	const snapshot = decision?.definitionSnapshot;
	const snapshotVersion =
		snapshot && ('scope' in snapshot ? snapshot.id : snapshot.definitionVersionId);
	const historical =
		decision?.state === 'Manual' &&
		!!snapshot &&
		(!adopted || (!!snapshotVersion && snapshotVersion !== adopted.definitionVersionId));
	const name =
		decision?.categoryId == null
			? 'Uncategorized'
			: historical
				? snapshot!.name
				: (adopted?.name ?? snapshot?.name ?? 'Category definition unavailable');
	return {
		name,
		historical,
		snapshot,
		adopted,
		displayOrder: historical ? snapshot!.displayOrder : (adopted?.displayOrder ?? 100)
	};
}
export function categoryGroupLabel(
	categories: DeckEntryCategories,
	decision?: EntryCategoryDecision
) {
	const presentation = categoryDecisionPresentation(categories, decision);
	return presentation.historical
		? `${presentation.name} (saved Manual version ${presentation.snapshot!.version})`
		: presentation.name;
}

export function categoryGroupIdentity(
	categories: DeckEntryCategories,
	decision?: EntryCategoryDecision
) {
	if (decision?.categoryId == null) return 'uncategorized';
	const { historical, snapshot } = categoryDecisionPresentation(categories, decision);
	return JSON.stringify([
		decision.categoryId,
		historical && snapshot
			? (('scope' in snapshot ? snapshot.id : snapshot.definitionVersionId) ?? snapshot.version)
			: 'adopted'
	]);
}

/** Current definitions never stand in for missing historical custom rule labels. */
export function categoryPredicateLabel(
	predicate: PredicateEvidence,
	decision: EntryCategoryDecision,
	categories: DeckEntryCategories
) {
	if (predicate.definitionName)
		return `${predicate.definitionName}${predicate.definitionVersion ? ` version ${predicate.definitionVersion}` : ''}`;
	if (predicate.definitionId === decision.categoryId && decision.definitionSnapshot)
		return decision.definitionSnapshot.name;
	const adopted = categories.definitions.find((d) => d.id === predicate.definitionId);
	if (predicate.origin === 'custom')
		return adopted
			? `${adopted.name} (current label; saved rule label unavailable)`
			: 'Custom rule label unavailable';
	return adopted?.name ?? predicate.origin;
}
