/** A card document as stored in MeiliSearch. */
export interface CardDocument {
	id: string;
	game?: Game;
	oracle_id: string;
	name: string;
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

/** Search result wrapper matching MeiliSearch response shape. */
export interface SearchResult {
	hits: CardDocument[];
	query: string;
	processingTimeMs: number;
	estimatedTotalHits: number;
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
	| 'standard'
	| 'pioneer'
	| 'modern'
	| 'legacy'
	| 'vintage'
	| 'commander'
	| 'pauper'
	| 'brawl';

/** Facet distribution counts returned by MeiliSearch. */
export interface FacetResponse {
	colors: Record<string, number>;
	rarity: Record<string, number>;
	set_code: Record<string, number>;
}
