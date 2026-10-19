import type { Deck, DeckAcknowledgement } from './decks.ts';
import type {
	InventoryAcknowledgement,
	InventoryAdd,
	InventoryPatch,
	InventoryRemove
} from './inventory.ts';

/** Closed web intents preserve existing receipt fingerprints across the HTTP extraction. */
export interface WebCommandInputs {
	'inventory.add': Omit<InventoryAdd, 'source'>;
	'inventory.patchEntry': Omit<InventoryPatch, 'source'>;
	'inventory.remove': Omit<InventoryRemove, 'source'>;
	'decks.createRecord': {
		game: 'mtg';
		name: string;
		description: string;
		format: string;
	};
	'decks.addCatalogCard': {
		deckId: string;
		catalogCardId: string;
		quantity: number;
		role: string;
		requestId: string;
	};
	'decks.changePrinting': {
		entryId: string;
		catalogCardId: string;
		quantity: number;
		role: string;
		requestId: string;
		categoryPreview?: string;
	};
	'decks.updateCard': {
		entryId: string;
		quantity?: number;
		role?: string;
		requestId: string;
		delta?: number;
		categoryPreview?: string;
	};
	'decks.removeCard': { entryId: string; requestId: string };
	'decks.importInto': { deckId: string; text: string; requestId: string };
}

export type WebCommand = {
	[K in keyof WebCommandInputs]: { operation: K; input: WebCommandInputs[K] };
}[keyof WebCommandInputs];

export interface WebCommandOutputs {
	'inventory.add': InventoryAcknowledgement;
	'inventory.patchEntry': InventoryAcknowledgement;
	'inventory.remove': InventoryAcknowledgement;
	'decks.createRecord': Deck;
	'decks.addCatalogCard': DeckAcknowledgement;
	'decks.changePrinting': DeckAcknowledgement;
	'decks.updateCard': DeckAcknowledgement;
	'decks.removeCard': DeckAcknowledgement;
	'decks.importInto': DeckAcknowledgement;
}
