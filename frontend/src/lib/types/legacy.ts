// Explicit view models for legacy routes. They preserve the current Date representation.
import type { CardDocument } from '@spellbook/contracts/catalog.ts';
import type { ProfileCardDefinition } from '@spellbook/contracts/profile.ts';

export interface UserProfile {
	accountId: string;
	username: string;
	email: string;
	avatarId: string;
	artworkId: string;
	profileCard: ProfileCardDefinition | null;
	lastSeenAt: Date;
}
export interface AuthIdentity {
	accountId: string;
	id: string;
	providerType: string;
	issuer: string;
	subject: string;
	emailAtLogin: string;
	createdAt: Date;
	updatedAt: Date;
}
export interface Inventory {
	accountId: string;
	id: string;
	createdAt: Date;
	updatedAt: Date;
	game: string;
}
export interface InventoryCard {
	accountId: string;
	name: string;
	id: string;
	createdAt: Date;
	updatedAt: Date;
	game: string;
	inventoryId: string;
	catalogCardId: string;
	canonicalCardId: string;
	setCode: string;
	imageUri: string;
	quantity: number;
	finish: string;
	condition: string;
	notes: string;
	notesRevision: string;
	spellbookPosition: number;
}
export type { Deck, DeckCard } from '@spellbook/contracts/decks.ts';
export interface DeckMutationRequest {
	accountId: string;
	createdAt: Date;
	updatedAt: Date;
	deckId: string;
	requestId: string;
	requestHash: string | null;
	source: string;
	status: string;
}
export interface ScanSession {
	accountId: string;
	id: string;
	createdAt: Date;
	updatedAt: Date;
	game: string;
	status: string;
}
export interface ScanArtifact {
	accountId: string;
	id: string;
	createdAt: Date;
	updatedAt: Date;
	status: string;
	sessionId: string;
	originalObjectKey: string;
	normalizedObjectKey: string;
	qualityScore: number;
	embeddingModelVersion: string;
	ocrModelVersion: string;
	ocrName: string | null;
	ocrSetCode: string | null;
	ocrCollectorNumber: string | null;
	candidateJson: unknown;
}
export interface ScanReviewItem {
	accountId: string;
	name: string;
	id: string;
	createdAt: Date;
	updatedAt: Date;
	catalogCardId: string;
	canonicalCardId: string;
	setCode: string;
	imageUri: string;
	quantity: number;
	finish: string;
	condition: string;
	sessionId: string;
	scanArtifactId: string;
	oracleId: string;
	collectorNumber: string;
	similarityScore: number;
	ocrScore: number;
	finalScore: number;
	matchReason: string;
}
export interface InventoryMutationRequest {
	accountId: string;
	createdAt: Date;
	updatedAt: Date;
	requestId: string;
	requestHash: string | null;
	source: string;
	status: string;
}
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
export type { DeckSnapshot } from '@spellbook/contracts/decks.ts';
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
	confidence?: number;
	matchReason: string;
}
export interface ScanWorkerResult {
	status: 'matched' | 'ambiguous' | 'no_match' | 'failed';
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
export interface InventoryGroup {
	id: string;
	name: string;
	entryCount: number;
	quantity: number;
}

export interface InventoryGroupMembership {
	groupId: string;
	entryId: string;
}
