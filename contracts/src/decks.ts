import type { AuthUser } from './auth.ts';
import type { CardDocument, SearchResult } from './catalog.ts';
export type DeckRole = 'main' | 'sideboard' | 'commander' | 'companion';
export interface Deck {
	id: string;
	accountId: string;
	game: string;
	name: string;
	description: string;
	format: string;
	descriptionRevision: string;
	compositionRevision: string;
	createdAt: string;
	updatedAt: string;
}
export type DeckChoice = Pick<Deck, 'id' | 'name' | 'format'>;
export interface DeckChoicePage {
	items: DeckChoice[];
	nextOffset: number | null;
	selected: DeckChoice | null;
}
export interface DeckCard {
	id: string;
	deckId: string;
	accountId: string;
	game: string;
	catalogCardId: string;
	canonicalCardId: string;
	name: string;
	setCode: string;
	imageUri: string;
	quantity: number;
	role: string;
	createdAt: string;
	updatedAt: string;
}
export interface DeckAvailability {
	exact: number;
	alternate: number;
	missing: number;
}
export interface DeckAvailabilityResponse {
	deckId: string;
	entries: (DeckAvailability & { entryId: string; required: number })[];
	totals: DeckAvailability & { required: number };
}
export interface DeckSnapshot {
	decks: Deck[];
	deckTotals: Record<string, number>;
	deckCovers: Record<string, { imageUri: string }>;
	deckCards: DeckCard[];
	availability: Record<string, DeckAvailability>;
	ownedByCanonical: Record<string, number>;
	ownedPrintings: {
		catalogCardId: string;
		canonicalCardId: string;
		quantity: number;
	}[];
}
export interface DeckAcknowledgement {
	requestId: string;
	deckId: string;
	revision: string;
	changes: {
		entryId: string;
		quantity: number;
		delta: number;
		catalogCardId: string;
		role: string;
	}[];
	removedEntryIds: string[];
	categoryDecisionRevision?: string;
	categoryEntryIds?: string[];
}
export type DeckFailure =
	| {
			kind: 'DescriptionConflict';
			message: string;
			description: string;
			descriptionRevision: string;
	  }
	| { kind: 'NotFound'; message: string }
	| { kind: 'RequestConflict'; message: string };
export interface DeckPatch {
	deckId: string;
	name?: string;
	format?: string;
	description?: string;
	descriptionRevision?: string;
}
export interface DeckCardIdentity {
	catalogCardId: string;
	canonicalCardId: string;
	name: string;
	setCode: string;
	imageUri: string;
}
export type DeckOperation =
	| { op: 'add'; card: DeckCardIdentity; quantity: number; role?: string }
	| {
			op: 'set' | 'decrement' | 'increment';
			target: { entryId: string };
			quantity: number;
	  }
	| { op: 'remove'; target: { entryId: string } }
	| { op: 'move'; target: { entryId: string }; role: DeckRole; categoryPreview?: string }
	| {
			op: 'replace';
			target: { entryId: string };
			catalogCardId: string;
			quantity: number;
			role: DeckRole;
			categoryPreview?: string;
	  };
export interface DeckBulkInput {
	deckId: string;
	requestId: string;
	source: string;
	game: string;
	operations: DeckOperation[];
}
export interface ImportLine {
	quantity: number;
	name: string;
	normalizedName: string;
	setCode: string | null;
	collectorNumber: string | null;
	role: DeckRole | 'maybeboard';
	raw: string;
}
export interface LegalityWarning {
	code: string;
	message: string;
	cardName?: string;
}
export interface ImportPreview {
	parsed: ImportLine[];
	resolved: { line: ImportLine; card: CardDocument }[];
	unresolved: {
		line: ImportLine | { raw: string; role: ImportLine['role'] };
		reason: string;
	}[];
	ambiguous: { line: ImportLine; candidates: CardDocument[] }[];
	warnings: LegalityWarning[];
}
export interface DecksApplication {
	importTextDeck(
		actor: AuthUser,
		input: {
			requestId: string;
			source: string;
			game: string;
			name: string;
			description: string;
			format: string;
			text: string;
		}
	): Promise<DeckAcknowledgement>;

	search(
		actor: AuthUser,
		query: string
	): Promise<
		SearchResult & {
			ownedPrintings: DeckSnapshot['ownedPrintings'];
			ownedByCanonical: Record<string, number>;
		}
	>;
	ownership(actor: AuthUser, canonicalIds: string[]): Promise<DeckSnapshot['ownedPrintings']>;

	getDeckChoices(
		actor: AuthUser,
		input?: {
			query?: string;
			offset?: number;
			limit?: number;
			selectedDeckId?: string;
		}
	): Promise<DeckChoicePage>;

	getDeckSnapshot(
		actor: AuthUser,
		game?: string,
		selectedDeckId?: string | null
	): Promise<DeckSnapshot>;
	createDeckRecord(
		actor: AuthUser,
		input: { game: string; name: string; description: string; format: string }
	): Promise<Deck>;
	updateDeck(actor: AuthUser, input: DeckPatch): Promise<Deck>;
	deleteDeck(actor: AuthUser, deckId: string): Promise<void>;
	bulkMutateDeckCards(actor: AuthUser, input: DeckBulkInput): Promise<DeckAcknowledgement>;
	getDeckCardsForDeck(actor: AuthUser, deckId: string): Promise<DeckCard[]>;
	getRecentDecks(actor: AuthUser, game?: string): Promise<Pick<Deck, 'id' | 'name' | 'format'>[]>;
	availability(actor: AuthUser, deckId: string): Promise<DeckAvailabilityResponse>;
	getDeckLegality(
		actor: AuthUser,
		deckId: string
	): Promise<{ warnings: LegalityWarning[]; deckDocuments: Record<string, CardDocument> }>;
	exportDecklist(actor: AuthUser, deckId: string): Promise<string>;
	previewMtgImport(actor: AuthUser, text: string, format?: string): Promise<ImportPreview>;
	addCatalogCardToDeck(
		actor: AuthUser,
		input: {
			deckId: string;
			catalogCardId: string;
			quantity: number;
			role: string;
			requestId: string;
		}
	): Promise<DeckAcknowledgement>;
	changeDeckPrinting(
		actor: AuthUser,
		input: {
			entryId: string;
			catalogCardId: string;
			quantity: number;
			role: string;
			requestId: string;
			categoryPreview?: string;
		}
	): Promise<DeckAcknowledgement>;
	importIntoDeck(
		actor: AuthUser,
		input: { deckId: string; text: string; requestId: string }
	): Promise<DeckAcknowledgement>;
	importDeck(
		actor: AuthUser,
		input: {
			requestId: string;
			source: string;
			game: string;
			name: string;
			description: string;
			format: string;
			operations: DeckOperation[];
		}
	): Promise<DeckAcknowledgement>;
	updateDeckCard(
		actor: AuthUser,
		entryId: string,
		quantity: number | undefined,
		role: string | undefined,
		requestId: string,
		delta?: number,
		source?: string,
		categoryPreview?: string
	): Promise<DeckAcknowledgement>;
	removeDeckCard(
		actor: AuthUser,
		entryId: string,
		requestId: string,
		source?: string
	): Promise<DeckAcknowledgement>;
	addDeckCard(
		actor: AuthUser,
		input: DeckCardIdentity & {
			deckId: string;
			quantity: number;
			role: string;
			requestId: string;
		}
	): Promise<DeckAcknowledgement>;
}
