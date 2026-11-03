/** Public Scryfall token artwork related to a Deck, independent of owned quantities. */
export interface RelatedTokenFace {
	name: string;
	typeLine: string;
	colors: string[];
	oracleText: string;
	power: string | null;
	toughness: string | null;
	imageUri: string | null;
	imageUriSmall: string | null;
}

export interface RelatedToken {
	catalogCardId: string;
	canonicalCardId: string | null;
	name: string;
	layout: string;
	setCode: string;
	collectorNumber: string;
	faces: RelatedTokenFace[];
	sourceEntryIds: string[];
}

export interface UnresolvedTokenReference {
	catalogCardId: string;
	name: string;
	sourceEntryIds: string[];
}

export interface DeckRelatedTokens {
	/** Availability of direct source references, not exhaustive token-production rules. */
	status: 'available' | 'partial' | 'unavailable';
	items: RelatedToken[];
	unresolved: UnresolvedTokenReference[];
	unavailableEntryIds: string[];
}
