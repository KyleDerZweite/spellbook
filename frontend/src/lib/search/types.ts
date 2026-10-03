/** A printing returned by the catalog API. */
export interface CardDocument {
	id: string;
	game?: Game;
	oracle_id: string;
	name: string;
	printed_name?: string;
	normalized_name?: string;
	lang: string;
	released_at: string;
	layout: string;
	mana_cost: string;
	cmc: number;
	type_line: string;
	oracle_text: string;
	colors: string[];
	color_identity: string[];
	keywords: string[];
	card_types: string[];
	power?: string;
	toughness?: string;
	rarity: string;
	set_code: string;
	set_name: string;
	collector_number: string;
	image_uri: string;
	image_uri_small: string;
	is_foil_available: boolean;
	is_nonfoil_available: boolean;
	legalities: Record<string, string>;
	back_face_name?: string;
	back_face_image_uri?: string;
}

/** Catalog search results, with an optional publication identity for pagination. */
export interface SearchResult {
	hits: CardDocument[];
	query: string;
	processingTimeMs: number;
	estimatedTotalHits: number;
	generationId?: string | null;
	facets?: FacetResponse;
}

export type Game = 'mtg' | 'pokemon' | 'yugioh';

/** MTG color identifiers. */
export type ManaColor = 'W' | 'U' | 'B' | 'R' | 'G' | 'C';

/** MTG rarity values. */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'mythic';

/** MTG card types. */
export type CardType =
	| 'Creature'
	| 'Instant'
	| 'Sorcery'
	| 'Enchantment'
	| 'Artifact'
	| 'Planeswalker'
	| 'Land'
	| 'Battle'
	| 'Kindred';

/** MTG format identifiers for legality filtering. */
export type LegalityFormat =
	'standard' | 'pioneer' | 'modern' | 'legacy' | 'vintage' | 'commander' | 'pauper' | 'brawl';

/** Canonical card counts for each filter value. */
export interface FacetResponse {
	colors: Record<string, number>;
	rarity: Record<string, number>;
	set_code: Record<string, number>;
}

export interface CatalogFilters {
	colors?: ManaColor[];
	rarities?: Rarity[];
	types?: CardType[];
	legalities?: LegalityFormat[];
	sets?: string[];
}

export interface CatalogSearchRequest {
	query: string;
	filters?: CatalogFilters;
	limit?: number;
	offset?: number;
	sort?: 'name:asc' | 'name:desc';
	facets?: boolean;
}
