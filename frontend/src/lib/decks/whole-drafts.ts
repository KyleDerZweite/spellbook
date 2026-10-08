export type WholeCategoryDraft = {
	kind: 'manual' | 'rename' | 'remove';
	deckId: string;
	versionId: string;
	requestId: string;
	expectedDecisionRevision: string;
	name: string;
	manual: 'Include' | 'Exclude';
};
