import type { InferSelectModel } from 'drizzle-orm';
import type {
	deckCards,
	decks,
	inventories,
	inventoryCards,
	inventoryMutationRequests,
	scanArtifacts,
	scanReviewItems,
	scanSessions,
	userProfiles
} from '$lib/server/db/schema';
import type { CardDocument } from '$lib/search/types';

export type UserProfile = InferSelectModel<typeof userProfiles>;
export type Inventory = InferSelectModel<typeof inventories>;
export type InventoryCard = InferSelectModel<typeof inventoryCards>;
export type Deck = InferSelectModel<typeof decks>;
export type DeckCard = InferSelectModel<typeof deckCards>;
export type ScanSession = InferSelectModel<typeof scanSessions>;
export type ScanArtifact = InferSelectModel<typeof scanArtifacts>;
export type ScanReviewItem = InferSelectModel<typeof scanReviewItems>;
export type InventoryMutationRequest = InferSelectModel<typeof inventoryMutationRequests>;

export interface InventoryStats {
	total: number;
	unique: number;
	foils: number;
	sets: number;
	completedSets: number;
}

export interface InventorySnapshot {
	inventory: Inventory | null;
	cards: InventoryCard[];
	stats: InventoryStats;
	mutationRequests: InventoryMutationRequest[];
}

export interface HomeSummary {
	stats: InventoryStats;
	recentAdditions: CardDocument[];
}

export interface DeckSnapshot {
	decks: Deck[];
	deckCards: DeckCard[];
	inventoryCards: InventoryCard[];
}

export interface InventoryBatchItem {
	catalogCardId: string;
	canonicalCardId: string;
	name: string;
	setCode: string;
	imageUri: string;
	finish: string;
	condition: string;
	quantity: number;
}

export interface AddInventoryInput extends InventoryBatchItem {
	game: string;
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

export interface ScanWorkerResult {
	status: 'matched' | 'ambiguous' | 'no_match';
	normalizedObjectKey: string;
	qualityScore: number;
	embeddingModelVersion: string;
	ocrModelVersion: string;
	ocrTokens: {
		name?: string;
		setCode?: string;
		collectorNumber?: string;
	};
	candidates: ScanCandidate[];
}

export interface ScanSessionResult {
	session: ScanSession | null;
	artifacts: ScanArtifact[];
	reviewItems: ScanReviewItem[];
	lastResult: ScanWorkerResult | null;
}
