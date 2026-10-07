import type { AuthUser } from './auth.ts';
import type { InventoryAcknowledgement } from './inventory.ts';
export interface ScanReviewCommitItem {
	id?: string;
	sessionId: string;
	scanArtifactId: string;
	catalogCardId: string;
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
	finish: string;
	condition: string;
	quantity: number;
}
export interface ScanCommitApplication {
	commitReview(
		actor: AuthUser,
		input: {
			requestId: string;
			sessionId: string;
			items: ScanReviewCommitItem[];
		}
	): Promise<InventoryAcknowledgement>;
}
