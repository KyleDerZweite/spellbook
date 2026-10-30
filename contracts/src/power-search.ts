export interface PowerSearchCatalogHit {
	kind: 'catalog';
	canonicalCardId: string;
	catalogCardId: string;
	name: string;
}

export interface PowerSearchInventoryHit {
	kind: 'inventory';
	canonicalCardId: string;
	name: string;
	quantity: number;
}

export interface PowerSearchDeckHit {
	kind: 'deck';
	deckId: string;
	name: string;
	format: string;
}

export interface PowerSearchDeckCardHit {
	kind: 'deck-card';
	deckId: string;
	deckName: string;
	canonicalCardId: string;
	name: string;
	quantity: number;
}

export interface PowerSearchResponse {
	query: string;
	accountId: string | null;
	generationId: string | null;
	cards: PowerSearchCatalogHit[];
	inventory: PowerSearchInventoryHit[];
	decks: (PowerSearchDeckHit | PowerSearchDeckCardHit)[];
}
