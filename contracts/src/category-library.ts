import type { WholeCategory, WholeCategoryAcknowledgement } from './whole-categories.ts';
import type { StarterOrigin } from './categories.ts';
import type {
	CategoryAcknowledgement,
	EntryCategoryDecision,
	EntryDefinition
} from './categories.ts';
import type { AuthUser } from './auth.ts';

export type Truth = 'True' | 'False' | 'Unknown';
export type CategoryScope = 'entry' | 'deck';
export type CategoryRole = 'main' | 'commander' | 'sideboard' | 'companion';
export type EntryRule =
	| { op: 'all' | 'any'; children: EntryRule[] }
	| { op: 'not'; child: EntryRule }
	| { op: 'type' | 'keyword'; value: string }
	| { op: 'oracleTag'; tagId: string; includeDescendants: boolean }
	| { op: 'mappedTrait'; traitId: StarterOrigin; mappingVersion: number }
	| { op: 'canonicalCards'; oracleIds: string[] }
	| {
			op: 'comboParticipant';
			outcomeId: string;
			policyVersion: 'ingredients-v1';
	  };
export type DeckRule =
	| { op: 'all' | 'any'; children: DeckRule[] }
	| { op: 'not'; child: DeckRule }
	| {
			op: 'minimumCopies' | 'minimumDistinct';
			predicate: EntryRule;
			minimum: number;
	  }
	| {
			op: 'percentage';
			predicate: EntryRule;
			basisPoints: number;
			denominator: 'all-cards' | 'nonland';
	  }
	| { op: 'comboOutcome'; outcomeId: string; policyVersion: 'ingredients-v1' };
export type DefinitionVersion = {
	id: string;
	originId: string;
	scope: CategoryScope;
	version: number;
	name: string;
	meaning: string;
	priority: number;
	displayOrder: number;
	roles: CategoryRole[];
	rule: EntryRule | DeckRule;
	createdAt: string;
};
export type LibraryDefinition = {
	originId: string;
	archived: boolean;
	current: DefinitionVersion;
};
export type CategoryLibrary = {
	revision: string;
	definitions: LibraryDefinition[];
};
export type CategoryLibraryPage = CategoryLibrary & {
	total: number;
	offset: number;
	limit: number;
};
export type CategoryRuleChoices = {
	tags: { id: string; name: string }[];
	cards: { oracleId: string; name: string }[];
	combo?: {
		source: import('./combo.ts').ComboSource;
		outcomes: { id: string; name: string }[];
		selectedOutcomes: { id: string; name: string }[];
	};
};
export type SaveDefinitionInput = {
	requestId: string;
	originId: string | null;
	expectedLibraryRevision: string;
	scope: CategoryScope;
	name: string;
	meaning: string;
	priority: number;
	displayOrder: number;
	roles: CategoryRole[];
	rule: EntryRule | DeckRule;
	confirmRetainedRule: boolean;
};
export type LibraryAcknowledgement = {
	requestId: string;
	libraryRevision: string;
	originId: string;
	versionId: string;
	changed: boolean;
};
export type CategoryChangeIntent = {
	requestId: string;
	deckId: string;
	scope: CategoryScope;
	mode: 'Review' | 'Reset';
	restoreOriginIds: string[];
};
export type CategoryDifference = {
	kind:
		| 'DefinitionAdded'
		| 'DefinitionChanged'
		| 'DefinitionRemoved'
		| 'RetainedManual'
		| 'EntryChanged'
		| 'EntryPreserved'
		| 'DeckChanged'
		| 'DeckPreserved'
		| 'OriginRestored'
		| 'NameConflict';
	entityId: string;
	message: string;
	before?: EntryDefinition | EntryCategoryDecision | WholeCategory | null;
	after?: EntryDefinition | EntryCategoryDecision | WholeCategory | null;
};
export type CategoryPreview = {
	id: string;
	deckId: string;
	scope: CategoryScope;
	mode: 'Review' | 'Reset';
	status: 'Ready' | 'BlockedByNameConflict' | 'Expired' | 'Committed' | 'Unsupported';
	expiresAt: string;
	total: number;
	offset: number;
	limit: number;
	differences: CategoryDifference[];
	acknowledgement: CategoryAcknowledgement | WholeCategoryAcknowledgement | null;
};
export interface CategoryChangesApplication {
	renameLocalCategory(
		actor: AuthUser,
		input: {
			requestId: string;
			deckId: string;
			categoryId: string;
			name: string;
			expectedDecisionRevision: string;
		}
	): Promise<CategoryAcknowledgement>;
	removeLocalCategory(
		actor: AuthUser,
		input: {
			requestId: string;
			deckId: string;
			categoryId: string;
			replacementCategoryId: string | null;
			expectedDecisionRevision: string;
		}
	): Promise<CategoryAcknowledgement>;
	previewCategoryChange(actor: AuthUser, input: CategoryChangeIntent): Promise<CategoryPreview>;
	getCategoryPreview(
		actor: AuthUser,
		input: { previewId: string; offset?: number; limit?: number }
	): Promise<CategoryPreview>;
	commitCategoryChange(
		actor: AuthUser,
		input: { requestId: string; previewId: string }
	): Promise<CategoryAcknowledgement | WholeCategoryAcknowledgement>;
}
export interface CategoryLibraryApplication {
	getDefinition(
		actor: AuthUser,
		originId: string
	): Promise<LibraryDefinition & { libraryRevision: string }>;
	getRuleChoices(
		actor: AuthUser,
		input: {
			tagQuery?: string;
			cardQuery?: string;
			tagIds?: string[];
			oracleIds?: string[];
			outcomeQuery?: string;
			outcomeIds?: string[];
		}
	): Promise<CategoryRuleChoices>;
	getLibrary(
		actor: AuthUser,
		page?: { scope?: CategoryScope; offset?: number; limit?: number }
	): Promise<CategoryLibraryPage>;
	saveDefinition(actor: AuthUser, input: SaveDefinitionInput): Promise<LibraryAcknowledgement>;
	archiveDefinition(
		actor: AuthUser,
		input: {
			requestId: string;
			originId: string;
			expectedLibraryRevision: string;
			archived: boolean;
		}
	): Promise<LibraryAcknowledgement>;
}
