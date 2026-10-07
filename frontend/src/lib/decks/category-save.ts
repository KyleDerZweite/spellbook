import type {
	CategoryAcknowledgement,
	DeckEntryCategories,
	EntryCategoryDecision
} from '@spellbook/contracts/categories.ts';
export type CategoryDraft = {
	value: string;
	revision: string;
	dirty: boolean;
	confirmation: { categoryId: string | null; revision: string } | null;
};
export function initialCategoryDraft(
	decision: EntryCategoryDecision | undefined,
	revision: string,
	recovery?: { categoryId: string | null; expectedDecisionRevision: string }
): CategoryDraft {
	return {
		value: recovery ? (recovery.categoryId ?? '') : (decision?.categoryId ?? ''),
		revision: recovery?.expectedDecisionRevision ?? revision,
		dirty: !!recovery,
		confirmation: null
	};
}
export function editCategoryDraft(state: CategoryDraft, value: string): CategoryDraft {
	return { ...state, value, dirty: true };
}
export function acknowledgeCategoryDraft(
	state: CategoryDraft,
	submitted: string,
	ack: CategoryAcknowledgement
): CategoryDraft {
	return {
		...state,
		dirty: true,
		revision: ack.decisionRevision,
		confirmation: { categoryId: submitted || null, revision: ack.decisionRevision }
	};
}
export function reconcileCategoryDraft(
	state: CategoryDraft,
	read: DeckEntryCategories,
	entryId: string
): CategoryDraft {
	if (BigInt(read.decisionRevision) < BigInt(state.revision)) return state;
	const decision = read.decisions.find((d) => d.entryId === entryId);
	const value = decision?.categoryId ?? '';
	if (
		state.confirmation &&
		decision?.state === 'Manual' &&
		decision.categoryId === state.confirmation.categoryId &&
		state.value === value &&
		BigInt(read.decisionRevision) >= BigInt(state.confirmation.revision)
	) {
		return { ...state, value, revision: read.decisionRevision, dirty: false, confirmation: null };
	}
	if (state.dirty) return state;
	return value === state.value && read.decisionRevision === state.revision
		? state
		: { ...state, value, revision: read.decisionRevision };
}
