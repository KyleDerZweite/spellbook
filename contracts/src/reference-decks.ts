import type { LegalityFormat } from './catalog.ts';
import type { DeckRole } from './decks.ts';

export interface ReferenceDeckSourceStatus {
	source: string;
	lastSyncedAt: string | null;
	deckCount: number;
}

export interface ReferenceDeckSummary {
	id: string;
	source: string;
	externalId: string;
	name: string;
	format: LegalityFormat;
	archetype: string | null;
	sourceUrl: string | null;
	metaShare: number | null;
	sourceUpdatedAt: string | null;
	syncedAt: string;
	cardCount: number;
	uniqueCardCount: number;
}

export interface ReferenceDeckCard {
	oracleId: string;
	name: string;
	quantity: number;
	role: DeckRole;
	representativePrintingId: string | null;
	imageUri: string | null;
	imageUriSmall: string | null;
	manaCost: string | null;
	typeLine: string | null;
	colors: string[] | null;
	colorIdentity: string[] | null;
}

export interface ReferenceDeckDetail extends ReferenceDeckSummary {
	cards: ReferenceDeckCard[];
}

export interface ReferenceDeckListResponse {
	decks: ReferenceDeckSummary[];
	total: number;
	limit: number;
	offset: number;
	availableFormats: LegalityFormat[];
	sources: ReferenceDeckSourceStatus[];
}
