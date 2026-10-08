import type { AuthUser } from './auth.ts';
import type { DefinitionVersion, Truth, DeckRule } from './category-library.ts';

export type WholeRuleEvidence = {
	op: DeckRule['op'];
	truth: Truth;
	lower?: string;
	upper?: string;
	denominatorLower?: string;
	denominatorUpper?: string;
	nonemptyContributionLower?: string | null;
	nonemptyContributionUpper?: string | null;
	emptyDenominatorPossible?: boolean;
	children?: WholeRuleEvidence[];
};
export type WholeCategoryEvidence = {
	combo?: import('./combo.ts').ComboEvidence;
	definitionVersionId: string;
	rule: DefinitionVersion['rule'];
	roles: DefinitionVersion['roles'];
	compositionRevision: string;
	attemptedTruth: Truth;
	bounds: WholeRuleEvidence;
	catalogGenerationId: string | null;
	oraclePublicationId: string | null;
	sourceTime: string | null;
	payloadDigest: string | null;
	parserVersion: number | null;
	transformVersions: number[];
};
export type WholeCategoryDecision = {
	versionId: string;
	state: 'Automatic' | 'Pending' | 'Manual';
	manual: 'Include' | 'Exclude' | null;
	truth: 'True' | 'False' | null;
	attemptedTruth: Truth | null;
	revision: string;
	evidence: WholeCategoryEvidence | null;
	previousEvaluation: WholeCategoryEvidence | null;
};
export type WholeCategory = {
	versionId: string;
	originId: string;
	definition: DefinitionVersion;
	name: string;
	displayOrder: number;
	suppressed: boolean;
	automaticActive: boolean;
	decision: WholeCategoryDecision | null;
};
export type DeckWholeCategories = {
	deckId: string;
	initialized: boolean;
	decisionRevision: string;
	categories: WholeCategory[];
};
export type WholeCategoryAcknowledgement = {
	requestId: string;
	deckId: string;
	scope: 'deck';
	decisionRevision: string;
	versionIds: string[];
	changed: boolean;
};
export interface WholeCategoriesApplication {
	getDeckWholeCategories(actor: AuthUser, deckId: string): Promise<DeckWholeCategories>;
	setWholeCategory(
		actor: AuthUser,
		input: {
			requestId: string;
			deckId: string;
			versionId: string;
			manual: 'Include' | 'Exclude';
			expectedDecisionRevision: string;
		}
	): Promise<WholeCategoryAcknowledgement>;
	renameWholeCategory(
		actor: AuthUser,
		input: {
			requestId: string;
			deckId: string;
			versionId: string;
			name: string;
			expectedDecisionRevision: string;
		}
	): Promise<WholeCategoryAcknowledgement>;
	removeWholeCategory(
		actor: AuthUser,
		input: {
			requestId: string;
			deckId: string;
			versionId: string;
			expectedDecisionRevision: string;
		}
	): Promise<WholeCategoryAcknowledgement>;
}
