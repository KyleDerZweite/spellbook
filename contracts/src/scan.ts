import type { AuthUser } from './auth.ts';
import type { InventoryAcknowledgement } from './inventory.ts';

export type ScanStatus = 'matched' | 'ambiguous' | 'no_match' | 'failed';
export interface ScanSession {
	id: string;
	game: 'mtg';
	status: 'open' | 'pending_review' | 'committed' | 'cancelled';
	createdAt: string;
	updatedAt: string;
}
export interface ScanCandidate {
	catalogCardId: string;
	canonicalCardId: string;
	oracleId: string;
	name: string;
	setCode: string;
	collectorNumber: string;
	imageUri: string;
	similarityScore: number;
	ocrScore: number;
	finalScore: number;
	confidence?: number;
	matchReason: string;
}
export interface ScanResult {
	artifactId: string;
	status: ScanStatus;
	qualityScore: number;
	embeddingModelVersion: string;
	ocrModelVersion: string;
	ocrTokens: { name?: string; setCode?: string; collectorNumber?: string };
	candidates: ScanCandidate[];
}
export interface ScanArtifact extends ScanResult {
	id: string;
	sessionId: string;
	createdAt: string;
	updatedAt: string;
}
export interface ScanReviewItem extends ScanCandidate {
	id: string;
	sessionId: string;
	scanArtifactId: string;
	finish: string;
	condition: string;
	quantity: number;
	createdAt: string;
	updatedAt: string;
}
export interface ScanSessionResult {
	session: ScanSession;
	artifacts: ScanArtifact[];
	reviewItems: ScanReviewItem[];
	artifactCount: number;
	reviewCount: number;
	nextArtifactCursor: string | null;
	nextReviewCursor: string | null;
	lastResult: ScanResult | null;
}
export interface ScanReviewIntent {
	id?: string;
	scanArtifactId: string;
	catalogCardId: string;
	finish: string;
	condition: string;
	quantity: number;
}
/** Original submitted fields are verification evidence only, never fresh identity authority. */
export interface ScanReviewCommitItem extends ScanReviewIntent {
	sessionId: string;
	canonicalCardId?: string;
	oracleId?: string;
	name?: string;
	setCode?: string;
	collectorNumber?: string;
	imageUri?: string;
	similarityScore: number;
	ocrScore: number;
	finalScore: number;
	matchReason: string;
}
export interface ScanCommitInput {
	requestId: string;
	sessionId: string;
	items: ScanReviewIntent[];
	legacyVerification?: {
		version: 'scan-v1' | 'scan-v2';
		sessionId?: string;
		items: ScanReviewCommitItem[];
	};
}
export type ScanCommitAcknowledgement =
	| {
			kind: 'Committed';
			sessionId: string;
			acknowledgement: InventoryAcknowledgement;
	  }
	| {
			kind: 'LegacyNoRepeat';
			requestId: string;
			binding: 'VerifiedLegacyHash' | 'UnverifiedLegacyHash';
			acknowledgement: InventoryAcknowledgement;
	  };
export type ScanFailure = {
	kind:
		| 'ScanNotFound'
		| 'ScanClosed'
		| 'ScanProcessingFailed'
		| 'ScanUnavailable'
		| 'LegacyReplayEvidenceRequired'
		| 'ScanImageInvalid';
	message: string;
};
export interface ScanCommitApplication {
	commitReview(actor: AuthUser, input: ScanCommitInput): Promise<ScanCommitAcknowledgement>;
}
export interface ScanApplication extends ScanCommitApplication {
	listSessions(actor: AuthUser): Promise<ScanSession[]>;
	createSession(actor: AuthUser): Promise<ScanSession>;
	readSession(
		actor: AuthUser,
		input: {
			sessionId: string;
			artifactCursor?: string;
			reviewCursor?: string;
			limit?: number;
		}
	): Promise<ScanSessionResult>;
	assertUploadable(actor: AuthUser, sessionId: string): Promise<void>;
	submitResult(
		actor: AuthUser,
		input: {
			sessionId: string;
			artifactId: string;
			status: ScanStatus;
			modelVersion: string;
			candidates: {
				catalogCardId: string;
				confidence: number;
				notes?: string;
			}[];
		}
	): Promise<{ artifact: ScanArtifact; result: ScanResult }>;
}
