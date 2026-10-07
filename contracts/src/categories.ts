import type { AuthUser } from './auth.ts';
export type StarterOrigin =
	| 'lands'
	| 'board-wipes'
	| 'counterspells'
	| 'removal'
	| 'ramp'
	| 'draw'
	| 'protection'
	| 'recursion';
export type EntryDefinition = {
	id: string;
	origin: StarterOrigin;
	name: string;
	version: number;
	policyVersion: number;
	mappingVersion: number;
	priority: number;
	displayOrder: number;
	rootId: string | null;
	descendants: boolean;
	excludeLand: boolean;
};
export type PredicateEvidence = {
	origin: StarterOrigin;
	result: 'True' | 'False' | 'Unknown';
	matchedTagIds: string[];
};
export type CategoryEvidence = {
	predicates: PredicateEvidence[];
	catalogGenerationId: string | null;
	oraclePublicationId: string | null;
	sourceTime: string | null;
	payloadDigest: string | null;
	parserVersion: number | null;
	printingId: string;
	rawOracleId: string | null;
	types: string[] | null;
	transformVersion: number | null;
};
export type EntryCategoryDecision = {
	entryId: string;
	categoryId: string | null;
	state: 'Automatic' | 'Manual' | 'Pending';
	revision: string;
	evidence: CategoryEvidence | null;
};
export type DeckEntryCategories = {
	deckId: string;
	initialized: boolean;
	decisionRevision: string;
	definitions: EntryDefinition[];
	decisions: EntryCategoryDecision[];
	sourceStatus: {
		kind: 'NeverAttempted' | 'Succeeded' | 'Failed';
		sourceTime: string | null;
	};
};
export type CategoryAcknowledgement = {
	requestId: string;
	deckId: string;
	decisionRevision: string;
	entryIds: string[];
};
export type CategoryMergeInput = {
	deckId: string;
	entryId: string;
	catalogCardId: string;
	role: 'main' | 'sideboard' | 'commander' | 'companion';
	quantity: number;
};
export type CategoryMergePreview = {
	required: boolean;
	token: string;
	source: EntryCategoryDecision | null;
	destination: EntryCategoryDecision | null;
	destinationEntryId: string | null;
	resultingQuantity: number;
	compositionRevision: string;
	decisionRevision: string;
	sourceTokens: {
		catalogGenerationId: string | null;
		oraclePublicationId: string | null;
		policy: string;
	};
};
export interface CategoriesApplication {
	previewEntryMerge(actor: AuthUser, input: CategoryMergeInput): Promise<CategoryMergePreview>;
	getDeckEntryCategories(actor: AuthUser, deckId: string): Promise<DeckEntryCategories>;
	initializeDeckCategories(
		actor: AuthUser,
		input: { deckId: string; requestId: string }
	): Promise<CategoryAcknowledgement>;
	setEntryCategory(
		actor: AuthUser,
		input: {
			deckId: string;
			entryId: string;
			categoryId: string | null;
			expectedDecisionRevision: string;
			requestId: string;
		}
	): Promise<CategoryAcknowledgement>;
}
