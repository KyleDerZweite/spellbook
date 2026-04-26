import type { AuthUser } from '$lib/auth/types';
import type { CardDocument } from '$lib/search/types';
import type {
	Deck,
	DeckCard,
	Inventory,
	InventoryCard,
	InventoryMutationRequest,
	ScanArtifact,
	ScanReviewItem,
	ScanSession,
	ScanWorkerResult
} from '$lib/server/data/types';

export type { ScanWorkerResult } from '$lib/server/data/types';

export interface MobileAuthContext {
	user: AuthUser;
}

export interface MobileInventoryBatchItem {
	catalogCardId: string;
	canonicalCardId: string;
	name: string;
	setCode: string;
	imageUri: string;
	finish: string;
	condition: string;
	quantity: number;
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
	matchReason: string;
}

export interface MobileInventoryResponse {
	inventory: Inventory | null;
	cards: InventoryCard[];
	stats: {
		total: number;
		unique: number;
		sets: number;
	};
	mutationRequests: InventoryMutationRequest[];
}

export interface MobileDecksResponse {
	decks: Deck[];
	deckCards: DeckCard[];
}

export interface MobileScanResultResponse {
	session: ScanSession | null;
	artifacts: ScanArtifact[];
	reviewItems: ScanReviewItem[];
	lastResult: ScanWorkerResult | null;
}

export interface MobileSearchResponse {
	query: string;
	hits: CardDocument[];
	estimatedTotalHits: number;
}
