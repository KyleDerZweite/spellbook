import type { InferSelectModel } from 'drizzle-orm';
import type {
	authIdentities,
	inventories,
	inventoryCards,
	inventoryMutationRequests,
	userProfiles
} from '#lib/server/db/schema.ts';
import type { CardDocument } from '#lib/search/types.ts';

export type UserProfile = InferSelectModel<typeof userProfiles>;
export type AuthIdentity = InferSelectModel<typeof authIdentities>;
export type Inventory = InferSelectModel<typeof inventories>;
export type InventoryCard = InferSelectModel<typeof inventoryCards>;
export type {
	Deck,
	DeckCard,
	DeckAcknowledgement,
	DeckSnapshot
} from '@spellbook/contracts/decks.ts';
export type {
	ScanSession,
	ScanArtifact,
	ScanReviewItem,
	ScanCandidate,
	ScanSessionResult
} from '@spellbook/contracts/scan.ts';
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
