import type { LegalityFormat } from './catalog.ts';
import type { Deck, DeckRole } from './decks.ts';
import type { ValueEstimate } from './inventory-value.ts';

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

export type DeckDiscoverySort =
	'missing_cost:asc' | 'ownership:desc' | 'meta_share:desc' | 'name:asc';

export type DeckDiscoveryInventoryMode = 'all' | 'free';

export interface DeckDiscoveryQuery {
	format?: LegalityFormat | '';
	source?: string;
	query?: string;
	maxMissingCost?: number | null;
	minOwnership?: number | null;
	inventoryMode?: DeckDiscoveryInventoryMode;
	sort?: DeckDiscoverySort;
	limit?: number;
	offset?: number;
}

export interface DeckDiscoveryItem extends ReferenceDeckSummary {
	coverImageUri: string | null;
	ownedCards: number;
	missingCards: number;
	ownershipPercent: number;
	missingValue: ValueEstimate;
}

export interface DeckDiscoveryResponse {
	decks: DeckDiscoveryItem[];
	total: number;
	limit: number;
	offset: number;
	inventoryMode: DeckDiscoveryInventoryMode;
	sort: DeckDiscoverySort;
	assembledDeckCount: number;
	valuationAvailable: boolean;
	evaluatedAt: string;
	availableFormats: LegalityFormat[];
	sources: ReferenceDeckSourceStatus[];
}

export interface DeckDiscoveryCopyResult {
	deck: Deck;
	copiedCards: number;
	skippedCards: number;
}
