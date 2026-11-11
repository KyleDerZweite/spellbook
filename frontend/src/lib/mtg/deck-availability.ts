export interface DeckAvailability {
	exact: number;
	alternate: number;
	missing: number;
}

export interface DeckAvailabilityResponse {
	deckId: string;
	entries: Array<DeckAvailability & { entryId: string; required: number }>;
	totals: DeckAvailability & { required: number };
}
