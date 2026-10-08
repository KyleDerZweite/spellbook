import type { CategoryRole, Truth } from './category-library.ts';

export type ComboSourceToken = {
	enabled: boolean;
	publicationId: string | null;
	policyVersion: 'ingredients-v1';
};
export type ComboSource = ComboSourceToken & {
	availability: 'Disabled' | 'Unavailable' | 'Available';
	refreshStatus: {
		kind: 'NeverAttempted' | 'Succeeded' | 'Failed';
		attemptedAt?: string;
		error?: string;
	};
	sourceTime: string | null;
	sourceVersion: string | null;
	payloadDigest: string | null;
	decodedDigest: string | null;
	parserVersion: number | null;
};
export type ComboIngredient = {
	oracleId: string | null;
	name: string;
	quantity: string;
	mustBeCommander: boolean;
	zones: string[];
	usedFace: number | null;
	states: Record<string, string>;
};
export type ComboVariant = {
	id: string;
	status: string;
	ingredients: ComboIngredient[];
	outcomeIds: string[];
	unsupportedReasons: string[];
	mana: string;
	prerequisites: string;
	steps: string;
	notes: string;
	templates: {
		id: string;
		name: string;
		query: string | null;
		quantity: string;
		zones: string[];
		states: Record<string, string>;
		mustBeCommander: boolean;
		usedFace: number | null;
	}[];
	producedOutcomes: {
		id: string;
		name: string;
		status: string;
		uncountable: boolean;
		quantity: string;
	}[];
};
export type ComboCompositionEntry = {
	entryId: string;
	printingId: string;
	role: CategoryRole;
	quantity: number;
	oracleId: string | null;
};
export type ComboProof = {
	variant: ComboVariant;
	publicationId: string;
	outcomeId: string;
	roles: CategoryRole[];
	policyVersion: 'ingredients-v1';
	parserVersion: number;
};
export type ComboEvaluation = {
	outcomeId: string;
	roles: CategoryRole[];
	truth: Truth;
	participants: Record<string, Truth>;
	proof: ComboProof | null;
};
export type ComboEvidence = {
	source: ComboSource;
	evaluations: ComboEvaluation[];
};
